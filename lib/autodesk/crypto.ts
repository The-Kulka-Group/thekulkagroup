import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// LA-2894. AES-256-GCM for the Autodesk tokens at rest and for the short-lived
// sign-in cookie. The key is 32 random bytes, base64, in AUTODESK_TOKEN_KEY.
// Each value names its purpose as associated data, so a ciphertext copied from
// one column or cookie into another fails to open.

const VERSION = "v1";

export class TokenKeyError extends Error {
  constructor() {
    super("AUTODESK_TOKEN_KEY must be 32 bytes, base64.");
    this.name = "TokenKeyError";
  }
}

export function tokenKey(value = process.env.AUTODESK_TOKEN_KEY): Buffer | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const key = Buffer.from(trimmed, "base64");
  return key.length === 32 ? key : null;
}

export function encrypt(plain: string, purpose: string, key: Buffer): string {
  if (key.length !== 32) throw new TokenKeyError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const sealed = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), sealed.toString("base64url")].join(".");
}

/** The plain text, or null when the value was altered, sealed for another purpose, or sealed under another key. */
export function decrypt(sealed: string, purpose: string, key: Buffer): string | null {
  const [version, iv, tag, body, extra] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined || extra !== undefined) return null;
  try {
    // A full 16-byte tag only; GCM would otherwise accept a cut-down one.
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"), { authTagLength: 16 });
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
