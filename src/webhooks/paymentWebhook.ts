import type { RequestHandler } from "express";
import type { Database } from "../db/types.js";
import type { Logger } from "../log.js";
import { consoleLogger } from "../log.js";
import { isValidWebhookSignature } from "./signature.js";
import { CLAIM_EVENT_SQL, MARK_PAID_SQL, EMAIL_FLAG_SQL, CRM_FLAG_SQL } from "./constants.js";
import type { WebhookDeps, PaymentSucceeded, Effect } from "./types.js";
export type { WebhookDeps };

/**
 * Le prestataire réessaie tant qu'il n'a pas un 200 en moins de 10 s.
 * On vérifie la signature, on enregistre le paiement, on répond, puis
 * seulement ensuite l'email et le CRM. Chaque effet a un drapeau en base :
 * un succès n'est pas rejoué, un échec le reste.
 */
export function createPaymentWebhook(deps: WebhookDeps): RequestHandler {
  const logger = deps.logger ?? consoleLogger;
  const schedule =
    deps.schedule ??
    ((task) => {
      void task().catch((error: unknown) => {
        logger.error("échec des effets de paiement", error);
      });
    });

  return (req, res) => {
    void handlePayment(req, res, deps, logger, schedule).catch((error: unknown) => {
      logger.error("échec du webhook de paiement", error);
      if (!res.headersSent) res.status(500).send("Erreur interne.");
    });
  };
}

async function handlePayment(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  deps: WebhookDeps,
  logger: Logger,
  schedule: (task: () => Promise<void>) => void,
): Promise<void> {
  const raw = req.body;
  if (!Buffer.isBuffer(raw)) {
    res.status(400).send("Corps brut attendu.");
    return;
  }

  if (!isValidWebhookSignature(deps.webhookSecret, raw, req.get("x-webhook-signature"))) {
    res.status(401).send("Signature invalide.");
    return;
  }

  const event = readPaymentEvent(raw);
  if (event === "invalid") {
    res.status(400).send("Événement invalide.");
    return;
  }

  if (event === "ignored") {
    res.status(200).send("ok");
    return;
  }

  await deps.db.transaction(async (tx) => {
    const inserted = await tx.query(CLAIM_EVENT_SQL, [event.id, new Date().toISOString()]);
    if (inserted.rowCount === 0) return;
    await tx.query(MARK_PAID_SQL, ["paid", event.booking_id]);
  });

  res.status(200).send("ok");
  schedule(() => deliverEffects(deps, logger, event));
}

async function deliverEffects(
  deps: WebhookDeps,
  logger: Logger,
  event: PaymentSucceeded,
): Promise<void> {
  const effects: Effect[] = [
    {
      sql: EMAIL_FLAG_SQL,
      run: () =>
        deps.sendEmail(
          event.customer_email,
          "Paiement confirmé",
          `Paiement confirmé pour la réservation ${event.booking_id}.`,
        ),
    },
    {
      sql: CRM_FLAG_SQL,
      run: () => deps.notifyCrm(event),
    },
  ];

  for (const effect of effects) {
    await runOnce(deps.db, logger, effect.sql, event.id, effect.run);
  }
}

// Passe le drapeau à vrai, exécute, et le rend si l'appel échoue.
async function runOnce(
  db: Database,
  logger: Logger,
  sql: string,
  eventId: string,
  run: () => Promise<void>,
): Promise<void> {
  const claimed = await db.query(sql, [eventId, true, false]);
  if (claimed.rowCount === 0) return;

  try {
    await run();
  } catch (error) {
    await db.query(sql, [eventId, false, true]);
    logger.error("échec d'un effet de paiement", error);
  }
}

function readPaymentEvent(raw: Buffer): PaymentSucceeded | "invalid" | "ignored" {
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return "invalid";
  }

  if (!isRecord(value) || !isId(value.id) || !isEventType(value.type)) {
    return "invalid";
  }

  if (value.type !== "payment.succeeded") return "ignored";

  if (!isId(value.booking_id) || !isEmail(value.customer_email)) {
    return "invalid";
  }

  return {
    id: value.id,
    type: "payment.succeeded",
    booking_id: value.booking_id,
    customer_email: value.customer_email,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= 200;
}

function isEventType(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

function isEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 320 || /\s/.test(value)) {
    return false;
  }
  const at = value.indexOf("@");
  return at > 0 && at < value.length - 1 && value.indexOf("@", at + 1) === -1;
}
