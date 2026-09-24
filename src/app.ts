import express, { type ErrorRequestHandler } from "express";
import type { Database } from "./db/types.js";
import type { Logger } from "./log.js";
import { consoleLogger } from "./log.js";
import { createListingsHandler } from "./listings/searchListings.js";
import {
  createPaymentWebhook,
  type WebhookDeps,
} from "./webhooks/paymentWebhook.js";

const BODY_LIMIT = "100kb";

type AppDeps = {
  db: Database;
  webhookSecret: string;
  sendEmail: WebhookDeps["sendEmail"];
  notifyCrm: WebhookDeps["notifyCrm"];
  logger?: Logger;
  schedule?: WebhookDeps["schedule"];
};

export function createApp(deps: AppDeps): express.Express {
  const logger = deps.logger ?? consoleLogger;
  const app = express();
  app.disable("x-powered-by");

  app.get("/api/listings", createListingsHandler(deps.db, logger));

  // Corps brut uniquement ici : la signature HMAC porte sur les octets
  // reçus, pas sur un objet JSON déjà parsé.
  app.post(
    "/webhooks/payment",
    express.raw({ type: () => true, limit: BODY_LIMIT }),
    createPaymentWebhook({ ...deps, logger }),
  );

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    logger.error("erreur non gérée", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erreur interne." });
    }
  };
  app.use(onError);

  return app;
}
