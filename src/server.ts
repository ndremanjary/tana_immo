import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createMemoryDatabase } from "./db/memoryDb.js";
import { createDemoState } from "./db/seed.js";
import { consoleLogger } from "./log.js";

const config = readConfig(process.env);

if (config.webhookSecret.length < 16) {
  console.error("WEBHOOK_SECRET manquant ou trop court (16 caractères minimum).");
  process.exit(1);
}

const app = createApp({
  db: createMemoryDatabase(createDemoState()),
  webhookSecret: config.webhookSecret,
  logger: consoleLogger,
  sendEmail: async () => {
    console.log("email de confirmation pris en charge");
  },
  notifyCrm: async (event) => {
    console.log(`crm notifié, réservation ${event.booking_id}`);
  },
});

app.listen(config.port, "127.0.0.1", () => {
  console.log(`TanàImmo API sur http://127.0.0.1:${config.port}`);
});
