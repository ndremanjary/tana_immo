import { Database } from "../db/types.js";
import { Logger } from "../log.js";

type PaymentSucceeded = {
    id: string;
    type: "payment.succeeded";
    booking_id: string;
    customer_email: string;
};

type WebhookDeps = {
    db: Database;
    webhookSecret: string;
    sendEmail: (to: string, subject: string, body: string) => Promise<void>;
    notifyCrm: (event: PaymentSucceeded) => Promise<void>;
    logger?: Logger;
    /** Permet aux tests d'attendre la fin des effets, après le 200. */
    schedule?: (task: () => Promise<void>) => void;
};

type Effect = {
    sql: string;
    run: () => Promise<void>;
};

export type { PaymentSucceeded, WebhookDeps, Effect };