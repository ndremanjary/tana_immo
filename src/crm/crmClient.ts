import { createHash } from "node:crypto";
import { ENDPOINT, TIMEOUT_MS, MAX_ATTEMPTS, BASE_DELAY_MS, RETRYABLE_STATUS } from "./constants.js";
import { CrmError, type CreatedLead, type CrmClientOptions, type Lead } from "./types.js";

type Client = {
  token: string;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  maxAttempts: number;
  timeoutMs: number;
  baseDelayMs: number;
};

/**
 * Crée un lead. La clé d'idempotence est stable pour un même lead,
 * donc un réessai ne le crée pas une seconde fois.
 * 429, 500, 502, 503 et l'absence de réponse sont rejoués.
 * Un 4xx définitif s'arrête tout de suite.
 * Le jeton n'est jamais recopié dans le message d'erreur.
 */
export async function createLead(lead: Lead, options: CrmClientOptions = {}): Promise<CreatedLead> {
  const client = resolveClient(options);
  const idempotencyKey = leadKey(lead);

  for (let attempt = 1; attempt <= client.maxAttempts; attempt += 1) {
    const last = attempt === client.maxAttempts;
    try {
      const response = await postLead(client, lead, idempotencyKey);
      if (response.status === 201) return await readCreated(response);
      if (!RETRYABLE_STATUS.has(response.status) || last) {
        throw await toCrmError(response, client.token);
      }
      await client.sleep(waitMs(response, attempt, client.baseDelayMs));
    } catch (error) {
      if (error instanceof CrmError || last || !isTransportError(error)) {
        throw redactError(client.token, error);
      }
      await client.sleep(backoffMs(attempt, client.baseDelayMs));
    }
  }

  throw new CrmError("CRM indisponible.", null);
}

function resolveClient(options: CrmClientOptions): Client {
  const token = (options.token ?? process.env.CRM_TOKEN ?? "").trim();
  if (!token) throw new CrmError("CRM_TOKEN manquant.", null);

  return {
    token,
    fetch: options.fetch ?? fetch,
    sleep: options.sleep ?? delay,
    maxAttempts: options.maxAttempts ?? MAX_ATTEMPTS,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
    baseDelayMs: options.baseDelayMs ?? BASE_DELAY_MS,
  };
}

function postLead(client: Client, lead: Lead, idempotencyKey: string): Promise<Response> {
  return client.fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${client.token}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(lead),
    signal: AbortSignal.timeout(client.timeoutMs),
  });
}

function leadKey(lead: Lead): string {
  const material = [lead.listingId, lead.name, lead.phone, lead.email, lead.message].join("\0");
  return createHash("sha256").update(material).digest("hex");
}

function waitMs(response: Response, attempt: number, baseDelayMs: number): number {
  if (response.status === 429) {
    const seconds = Number(response.headers.get("retry-after"));
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  }
  return backoffMs(attempt, baseDelayMs);
}

function backoffMs(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** (attempt - 1);
}

async function readCreated(response: Response): Promise<CreatedLead> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CrmError("Réponse CRM invalide.", 201);
  }

  if (!isRecord(body) || typeof body.id !== "string" || typeof body.createdAt !== "string") {
    throw new CrmError("Réponse CRM invalide.", 201);
  }

  return { id: body.id, createdAt: body.createdAt };
}

async function toCrmError(response: Response, token: string): Promise<CrmError> {
  const detail = redact(token, (await response.text()).trim());
  const message = detail ? `CRM ${response.status}: ${detail}` : `CRM ${response.status}.`;
  return new CrmError(message, response.status);
}

function redactError(token: string, error: unknown): CrmError {
  if (error instanceof CrmError) {
    return new CrmError(redact(token, error.message), error.status);
  }
  const message = error instanceof Error ? error.message : "Erreur CRM.";
  return new CrmError(redact(token, message), null);
}

function redact(token: string, message: string): string {
  return message.split(token).join("[redacted]");
}

function isTransportError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError" || error.name === "TypeError")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
