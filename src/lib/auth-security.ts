// src/lib/auth-security.ts
// Shared anti-enumeration, lockout, and CAPTCHA helpers for auth flows.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/** Identical failure copy — never reveal whether the email exists. */
export const AUTH_GENERIC_FAIL = "Invalid Credentials";
export const AUTH_OTP_FAIL = "Invalid or expired OTP.";
export const AUTH_TOKEN_FAIL = "Invalid or expired reset token.";
export const AUTH_FORGOT_OK =
  "If an account exists for that email, you can continue with the next step.";
export const AUTH_CREATE_FAIL = "Unable to create that account. Check the details and try again.";
export const AUTH_VERIFY_FAIL = "Invalid or expired verification code.";
export const AUTH_RATE_LIMITED = "Too many attempts. Please wait and try again.";
export const AUTH_CAPTCHA_REQUIRED = "Please complete the security check and try again.";
export const AUTH_LOCKED = "Too many failed attempts. Please wait before trying again.";

export const MIN_LOGIN_MS = 450;
export const MIN_FORGOT_MS = 700;
export const MIN_OTP_MS = 450;
export const MIN_RESET_MS = 450;
export const MIN_VERIFY_MS = 450;

/** Reset / verification tokens expire within one hour. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const VERIFY_CODE_TTL_MS = 60 * 60 * 1000;
export const OTP_TTL_MS = 10 * 60 * 1000;

const CAPTCHA_TTL_MS = 10 * 60 * 1000;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const CAPTCHA_AFTER_FAILURES = 5;
const LOCK_AFTER_FAILURES = 10;

export async function equalizeTiming(startedAt: number, minMs: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed));
  }
}

export async function getRequestIp(): Promise<string> {
  try {
    const h = await headers();
    const xf = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    const real = h.get("x-real-ip")?.trim();
    const ip = xf || real || "unknown";
    return ip.slice(0, 64);
  } catch {
    return "unknown";
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function captchaKey(id: string) {
  return `auth_captcha_${id}`;
}

function failKey(bucket: string) {
  return `auth_fail_${bucket}`;
}

type FailState = { count: number; firstAt: number; lockedUntil?: number };

async function readJsonSetting<T>(key: string): Promise<T | null> {
  try {
    const row = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1)
      .then((r) => r[0]);
    if (!row) return null;
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

async function writeJsonSetting(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  await db
    .insert(schema.settings)
    .values({ key, value: raw, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: raw, updatedAt: new Date() },
    });
}

async function deleteSetting(key: string): Promise<void> {
  try {
    await db.delete(schema.settings).where(eq(schema.settings.key, key));
  } catch {
    // ignore
  }
}

/** Create a short math CAPTCHA (no third-party required). */
export async function createAuthCaptcha(): Promise<{ id: string; question: string }> {
  const a = randomInt(2, 12);
  const b = randomInt(2, 12);
  const id = randomBytes(16).toString("hex");
  const answer = String(a + b);
  const secret = process.env.AUTH_SECRET || "captcha";
  await writeJsonSetting(captchaKey(id), {
    hash: sha256Hex(`${answer}:${secret}:${id}`),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  });
  return { id, question: `What is ${a} + ${b}?` };
}

export async function verifyAuthCaptcha(id: string, answer: string): Promise<boolean> {
  if (!id || !answer) return false;
  const key = captchaKey(id);
  const data = await readJsonSetting<{ hash: string; expiresAt: number }>(key);
  await deleteSetting(key); // single-use
  if (!data || typeof data.hash !== "string" || typeof data.expiresAt !== "number") return false;
  if (Date.now() > data.expiresAt) return false;
  const secret = process.env.AUTH_SECRET || "captcha";
  const expected = sha256Hex(`${String(answer).trim()}:${secret}:${id}`);
  return safeEqualHex(expected, data.hash);
}

export type LockoutStatus = {
  captchaRequired: boolean;
  locked: boolean;
  retryAfterSec?: number;
};

export async function getLockoutStatus(bucket: string): Promise<LockoutStatus> {
  const data = await readJsonSetting<FailState>(failKey(bucket));
  const now = Date.now();
  if (!data) return { captchaRequired: false, locked: false };
  if (data.lockedUntil && data.lockedUntil > now) {
    return {
      captchaRequired: true,
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((data.lockedUntil - now) / 1000)),
    };
  }
  if (now - data.firstAt > LOCKOUT_WINDOW_MS) {
    return { captchaRequired: false, locked: false };
  }
  return {
    captchaRequired: data.count >= CAPTCHA_AFTER_FAILURES,
    locked: false,
  };
}

export async function recordAuthFailure(bucket: string): Promise<LockoutStatus> {
  const key = failKey(bucket);
  const now = Date.now();
  const prev = await readJsonSetting<FailState>(key);
  let count = 1;
  let firstAt = now;
  if (prev && now - prev.firstAt <= LOCKOUT_WINDOW_MS) {
    count = prev.count + 1;
    firstAt = prev.firstAt;
  }
  const next: FailState = { count, firstAt };
  if (count >= LOCK_AFTER_FAILURES) {
    next.lockedUntil = now + LOCKOUT_WINDOW_MS;
  }
  await writeJsonSetting(key, next);
  return getLockoutStatus(bucket);
}

export async function clearAuthFailures(bucket: string): Promise<void> {
  await deleteSetting(failKey(bucket));
}

export function authBucket(action: string, email: string, ip: string): string {
  return `${action}:${email.toLowerCase().trim()}:${ip}`;
}
