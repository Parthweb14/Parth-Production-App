// src/lib/auth-secret.ts — shared AUTH_SECRET loader for JWT routes
export function getAuthSecretBytes(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.trim().length < 32) {
    throw new Error(
      "AUTH_SECRET is required and must be at least 32 characters. Current value length: " +
        (s ? s.length : "undefined") +
        ". Generate with: openssl rand -base64 32"
    );
  }
  return new TextEncoder().encode(s);
}
