import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhookBody(secret: string, body: Buffer): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Compare la signature HMAC SHA-256 du corps brut.
 * Un en-tête absent, tronqué ou non hexadécimal est rejeté avant
 * la comparaison en temps constant.
 */
export function isValidWebhookSignature(
  secret: string,
  body: Buffer,
  header: string | undefined,
): boolean {
  if (!secret || !header) {
    return false;
  }

  const given = header.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) {
    return false;
  }

  const expected = signWebhookBody(secret, body);
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
