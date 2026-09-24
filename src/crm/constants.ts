const ENDPOINT = "https://crm.example.com/v1/leads";
const TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 200;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503]);

export { ENDPOINT, TIMEOUT_MS, MAX_ATTEMPTS, BASE_DELAY_MS, RETRYABLE_STATUS };