const CLAIM_EVENT_SQL = `
-- tana:webhook.claim
INSERT INTO processed_webhook_events (id, received_at)
VALUES ($1, $2)
ON CONFLICT (id) DO NOTHING
RETURNING id
`.trim();

const MARK_PAID_SQL = `
-- tana:booking.markPaid
UPDATE bookings
SET status = $1
WHERE id = $2
`.trim();

const EMAIL_FLAG_SQL = `
-- tana:webhook.email
UPDATE processed_webhook_events
SET email_sent = $2
WHERE id = $1 AND email_sent = $3
RETURNING id
`.trim();

const CRM_FLAG_SQL = `
-- tana:webhook.crm
UPDATE processed_webhook_events
SET crm_notified = $2
WHERE id = $1 AND crm_notified = $3
RETURNING id
`.trim();

export { CLAIM_EVENT_SQL, MARK_PAID_SQL, EMAIL_FLAG_SQL, CRM_FLAG_SQL };