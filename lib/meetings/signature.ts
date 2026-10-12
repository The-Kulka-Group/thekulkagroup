import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LA-2279. Whether a Fireflies webhook's `x-hub-signature` is the HMAC-SHA256
 * of the raw body under the shared secret. Fireflies' docs do not say whether
 * the header is bare hex or carries a "sha256=" prefix, so both are accepted.
 */
export function validFirefliesSignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const supplied = header.trim().replace(/^sha256=/i, "").toLowerCase();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
