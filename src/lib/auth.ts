// src/lib/auth.ts
import { randomBytes, randomInt, createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq, and, isNull, gte, asc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "./db";
import { checkRateLimit as generalRateLimit, clearRateLimit } from "./rate-limiter";
import {
  AUTH_CAPTCHA_REQUIRED,
  AUTH_FORGOT_OK,
  AUTH_GENERIC_FAIL,
  AUTH_LOCKED,
  AUTH_OTP_FAIL,
  AUTH_RATE_LIMITED,
  AUTH_TOKEN_FAIL,
  AUTH_VERIFY_FAIL,
  MIN_FORGOT_MS,
  MIN_LOGIN_MS,
  MIN_OTP_MS,
  MIN_RESET_MS,
  MIN_VERIFY_MS,
  OTP_TTL_MS,
  RESET_TOKEN_TTL_MS,
  VERIFY_CODE_TTL_MS,
  authBucket,
  clearAuthFailures,
  createAuthCaptcha,
  equalizeTiming,
  getLockoutStatus,
  getRequestIp,
  recordAuthFailure,
  sha256Hex,
  verifyAuthCaptcha,
} from "./auth-security";

const COOKIE = "kp_session";
const MAX_ADMIN_DEVICES = 2;
const SESSION_GRACE_MS = 60_000; // Turso read-after-write grace for new sessions
// Known-good bcrypt hash (cost 12) of a constant dummy password for timing equalization.
const DUMMY_BCRYPT =
  "$2a$12$3i0y0Tlv64KDQG6TcXbqOuh.1cBdUqWkh5RqkkQb.O4yV9cTr6Nsm";

export type AuthFailResult = {
  ok: false;
  error: string;
  captchaRequired?: boolean;
  captcha?: { id: string; question: string };
  retryAfter?: number;
};

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.trim().length < 8) {
    throw new Error(
      "AUTH_SECRET is required and must be at least 8 characters. Current value length: " +
        (s ? s.length : "undefined")
    );
  }
  if (s.trim().length < 32) {
    console.warn(
      "[auth] AUTH_SECRET is shorter than 32 characters. Generate a stronger secret with: openssl rand -base64 32"
    );
  }
  return new TextEncoder().encode(s);
}

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee";
  sessionId?: string;
  mustChangePwd?: boolean;
};

async function sign(user: SessionUser): Promise<string> {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24); // 1 day

  // Persist session for revocation. Retries on transient Turso errors.
  // If persistence still fails, we still issue the JWT — verify() allows a
  // short grace window for missing rows so login is not hard-down.
  let sessionPersisted = false;
  for (let attempt = 0; attempt < 3 && !sessionPersisted; attempt++) {
    try {
      if (user.role === "admin" && attempt === 0) {
        const activeSessions = await db
          .select({ id: schema.sessions.id })
          .from(schema.sessions)
          .where(
            and(
              eq(schema.sessions.userId, user.id),
              isNull(schema.sessions.revokedAt),
              gte(schema.sessions.expiresAt, now)
            )
          )
          .orderBy(asc(schema.sessions.createdAt));

        const toRevokeCount = Math.max(0, activeSessions.length - (MAX_ADMIN_DEVICES - 1));
        for (let i = 0; i < toRevokeCount; i++) {
          await db
            .update(schema.sessions)
            .set({ revokedAt: now })
            .where(eq(schema.sessions.id, activeSessions[i].id));
        }
      }

      await db.insert(schema.sessions).values({
        id: sessionId,
        userId: user.id,
        refreshToken: sessionId,
        rotated: false,
        expiresAt,
        createdAt: now,
      });
      sessionPersisted = true;
    } catch (err) {
      console.error(`[auth] sign() session persist attempt ${attempt + 1} failed:`, err);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  if (!sessionPersisted) {
    console.error("[auth] sign() continuing without persisted session — verify grace window applies");
  }

  return new SignJWT({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    sessionId,
    mustChangePwd: Boolean(user.mustChangePwd),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(getSecret());
}

async function verify(token: string): Promise<SessionUser | null> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, getSecret()));
  } catch {
    return null;
  }
  const user = payload as unknown as SessionUser & { iat?: number };
  if (!user || typeof user.id !== "number" || !user.role) return null;
  if (!user.sessionId) return null;

  // Fail closed: session must exist and not be revoked.
  try {
    const session = await db
      .select({ revokedAt: schema.sessions.revokedAt })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, user.sessionId))
      .limit(1)
      .then((r) => r[0]);

    if (!session) {
      // Allow a short grace window for Turso eventual consistency right after login.
      const iatMs = typeof payload.iat === "number" ? payload.iat * 1000 : 0;
      if (!iatMs || Date.now() - iatMs > SESSION_GRACE_MS) return null;
    } else if (session.revokedAt) {
      return null;
    }
  } catch (err) {
    console.error("[auth] session lookup DB error — failing closed:", err);
    return null;
  }

  // Fail closed: user must exist, be active, not soft-deleted.
  try {
    const dbUser = await db
      .select({
        deletedAt: schema.users.deletedAt,
        active: schema.users.active,
        mustChangePwd: schema.users.mustChangePwd,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)
      .then((r) => r[0]);
    if (!dbUser || dbUser.deletedAt) return null;
    if (dbUser.active === false) return null;
    return {
      id: user.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      sessionId: user.sessionId,
      mustChangePwd: Boolean(dbUser.mustChangePwd),
    };
  } catch (err) {
    console.error("[auth] user lookup DB error — failing closed:", err);
    return null;
  }
}

/** Get current user from cookie (server components / route handlers). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verify(token);
}

/** Require an authenticated user, else redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

/** Require an admin; otherwise return null so pages can redirect. */
export async function requireAdmin(): Promise<SessionUser | null> {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return null;
  return u;
}

export async function login(
  email: string,
  password: string,
  captcha?: { id?: string; answer?: string }
): Promise<{ ok: true; mustChangePwd?: boolean } | AuthFailResult> {
  const started = Date.now();
  const normalized = email.toLowerCase().trim();
  const ip = await getRequestIp();
  const bucket = authBucket("login", normalized, ip);

  async function fail(error: string, status?: { captchaRequired?: boolean; retryAfter?: number }): Promise<AuthFailResult> {
    const lock = await recordAuthFailure(bucket);
    const captchaRequired = Boolean(status?.captchaRequired || lock.captchaRequired || lock.locked);
    let captchaChallenge: { id: string; question: string } | undefined;
    if (captchaRequired) {
      try {
        captchaChallenge = await createAuthCaptcha();
      } catch (err) {
        console.error("[auth] captcha create failed:", err);
      }
    }
    await equalizeTiming(started, MIN_LOGIN_MS);
    return {
      ok: false,
      error: lock.locked ? AUTH_LOCKED : error,
      captchaRequired,
      captcha: captchaChallenge,
      retryAfter: lock.retryAfterSec ?? status?.retryAfter,
    };
  }

  // IP spray protection + per-account window.
  const rlEmail = await generalRateLimit(`login:${normalized}`, { max: 5, windowMs: 5 * 60 * 1000 });
  const rlIp = await generalRateLimit(`login_ip:${ip}`, { max: 30, windowMs: 5 * 60 * 1000 });
  if (!rlEmail.allowed || !rlIp.allowed) {
    return fail(AUTH_RATE_LIMITED, {
      captchaRequired: true,
      retryAfter: rlEmail.retryAfter ?? rlIp.retryAfter,
    });
  }

  const lock = await getLockoutStatus(bucket);
  if (lock.locked) {
    return fail(AUTH_LOCKED, { captchaRequired: true, retryAfter: lock.retryAfterSec });
  }
  if (lock.captchaRequired) {
    const okCaptcha = await verifyAuthCaptcha(String(captcha?.id || ""), String(captcha?.answer || ""));
    if (!okCaptcha) {
      const challenge = await createAuthCaptcha();
      await equalizeTiming(started, MIN_LOGIN_MS);
      return { ok: false, error: AUTH_CAPTCHA_REQUIRED, captchaRequired: true, captcha: challenge };
    }
  }

  let user: {
    id: number;
    name: string;
    email: string;
    password: string;
    role: "admin" | "employee";
    mustChangePwd: boolean;
    active: boolean | null;
    emailVerifiedAt: Date | null;
  } | undefined;

  try {
    user = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        password: schema.users.password,
        role: schema.users.role,
        mustChangePwd: schema.users.mustChangePwd,
        active: schema.users.active,
        emailVerifiedAt: schema.users.emailVerifiedAt,
      })
      .from(schema.users)
      .where(and(eq(schema.users.email, normalized), isNull(schema.users.deletedAt)))
      .limit(1)
      .then((r) => r[0]);
  } catch (err) {
    console.error("[auth] users drizzle query failed — raw SQL fallback:", err);
    try {
      const { createClient } = await import("@libsql/client");
      const url = process.env.TURSO_DATABASE_URL;
      const authToken = process.env.TURSO_AUTH_TOKEN;
      if (!url) throw new Error("TURSO_DATABASE_URL missing");
      const client = createClient({ url, authToken });
      let res;
      try {
        res = await client.execute({
          sql: "SELECT id, name, email, password, role, must_change_pwd, active, email_verified_at FROM users WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1",
          args: [normalized],
        });
      } catch {
        res = await client.execute({
          sql: "SELECT id, name, email, password, role, must_change_pwd, active FROM users WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1",
          args: [normalized],
        });
      }
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (row) {
        const verifiedRaw = row.email_verified_at;
        user = {
          id: Number(row.id),
          name: String(row.name),
          email: String(row.email),
          password: String(row.password),
          role: String(row.role) as "admin" | "employee",
          mustChangePwd: Boolean(row.must_change_pwd),
          active: row.active === undefined || row.active === null ? true : Boolean(row.active),
          emailVerifiedAt:
            verifiedRaw === undefined || verifiedRaw === null
              ? new Date() // legacy rows without column → treat as verified
              : new Date(Number(verifiedRaw) * (Number(verifiedRaw) < 1e12 ? 1000 : 1)),
        };
      }
    } catch (err2) {
      console.error("[auth] users raw SQL fallback failed:", err2);
      await equalizeTiming(started, MIN_LOGIN_MS);
      return { ok: false, error: "Server error (DB). Please try again." };
    }
  }

  // Always run bcrypt — identical work whether or not the email exists.
  const hash = user?.password ?? DUMMY_BCRYPT;
  let match = false;
  try {
    match = await bcrypt.compare(password, hash);
  } catch (err) {
    console.error("[auth] bcrypt compare error:", err);
    await equalizeTiming(started, MIN_LOGIN_MS);
    return { ok: false, error: "Server error (auth). Please try again." };
  }

  // Single generic failure for missing user, bad password, or inactive/unverified.
  // Pending email verification keeps active=false until proven — same error copy.
  const activeOk = user ? user.active !== false : false;

  if (!user || !match || !activeOk) {
    return fail(AUTH_GENERIC_FAIL, { captchaRequired: lock.captchaRequired });
  }

  try {
    await clearRateLimit(`login:${normalized}`);
    await clearAuthFailures(bucket);
  } catch (err) {
    console.error("[auth] clearRateLimit error:", err);
  }

  const store = await cookies();
  let token: string;
  try {
    token = await sign({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePwd: Boolean(user.mustChangePwd),
    });
  } catch (err) {
    console.error("[auth] sign token error:", err);
    await equalizeTiming(started, MIN_LOGIN_MS);
    return { ok: false, error: "Server error (token). Please try again." };
  }
  try {
    store.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  } catch (err) {
    console.error("[auth] cookie set error:", err);
    await equalizeTiming(started, MIN_LOGIN_MS);
    return { ok: false, error: "Server error (cookie). Please try again." };
  }
  await equalizeTiming(started, MIN_LOGIN_MS);
  return { ok: true, mustChangePwd: Boolean(user.mustChangePwd) };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      const sid = payload.sessionId as string | undefined;
      if (sid) {
        await db
          .update(schema.sessions)
          .set({ revokedAt: new Date() })
          .where(eq(schema.sessions.id, sid));
      }
    } catch {
      // invalid token — just delete cookie
    }
  }
  store.delete(COOKIE);
}

/** Hash a password with bcrypt (cost 12) — never store plaintext / MD5 / raw SHA-256. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

function hashResetToken(token: string): string {
  // Store only a SHA-256 digest of the random secret — never the raw token.
  return createHash("sha256").update(token).digest("hex");
}

// ──────────────────────────────────────────────────────────────────────────
// Forgot Password — OTP via SMTP (anti-enumeration + rate limit + CAPTCHA)
// ──────────────────────────────────────────────────────────────────────────

function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

export async function sendForgotOtp(
  email: string,
  captcha?: { id?: string; answer?: string }
): Promise<{ ok: true; message: string; captchaRequired?: boolean; captcha?: { id: string; question: string } } | AuthFailResult> {
  const started = Date.now();
  const normalized = email.toLowerCase().trim();
  const ip = await getRequestIp();
  const bucket = authBucket("forgot", normalized, ip);

  const rl = await generalRateLimit(`forgot:${normalized}`, { max: 3, windowMs: 10 * 60 * 1000 });
  const rlIp = await generalRateLimit(`forgot_ip:${ip}`, { max: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed || !rlIp.allowed) {
    const challenge = await createAuthCaptcha();
    await equalizeTiming(started, MIN_FORGOT_MS);
    return {
      ok: false,
      error: AUTH_RATE_LIMITED,
      captchaRequired: true,
      captcha: challenge,
      retryAfter: rl.retryAfter ?? rlIp.retryAfter,
    };
  }

  const lock = await getLockoutStatus(bucket);
  if (lock.locked) {
    const challenge = await createAuthCaptcha();
    await equalizeTiming(started, MIN_FORGOT_MS);
    return { ok: false, error: AUTH_LOCKED, captchaRequired: true, captcha: challenge, retryAfter: lock.retryAfterSec };
  }
  if (lock.captchaRequired) {
    const okCaptcha = await verifyAuthCaptcha(String(captcha?.id || ""), String(captcha?.answer || ""));
    if (!okCaptcha) {
      const challenge = await createAuthCaptcha();
      await equalizeTiming(started, MIN_FORGOT_MS);
      return { ok: false, error: AUTH_CAPTCHA_REQUIRED, captchaRequired: true, captcha: challenge };
    }
  }

  const user = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(and(eq(schema.users.email, normalized), isNull(schema.users.deletedAt)))
    .limit(1)
    .then((r) => r[0]);

  // Always perform slow KDF work so missing-email responses match existing-email timing.
  const otp = generateOtp();
  const hashed = await bcrypt.hash(otp, 12);
  const key = `forgot_otp_${sha256Hex(normalized).slice(0, 32)}`;

  if (user) {
    await db
      .insert(schema.settings)
      .values({ key, value: JSON.stringify({ otp: hashed, expiresAt: Date.now() + OTP_TTL_MS }) })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: JSON.stringify({ otp: hashed, expiresAt: Date.now() + OTP_TTL_MS }) },
      });

    try {
      const { sendEmail } = await import("@/lib/email");
      await sendEmail({
        to: normalized,
        subject: "Password Reset OTP — Kadam Production",
        html: `
      <div style="max-width:500px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
        <h2 style="color:#1e40af">Password Reset Request</h2>
        <p>Hello <strong>${escapeHtml(user.name)}</strong>,</p>
        <p>Use the following OTP to reset your password. It expires in 10 minutes.</p>
        <div style="margin:24px 0;text-align:center">
          <span style="display:inline-block;padding:12px 32px;font-size:28px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:8px;color:#1e40af">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:13px">If you did not request this, please ignore this email.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
        <p style="font-size:12px;color:#6b7280">Kadam Production — Professional Event Services</p>
      </div>
    `,
      });
    } catch (err) {
      // Do not reveal mailer failure as "account exists".
      console.error("[auth] forgot OTP email failed");
    }
  } else {
    // Burn equivalent time when no account exists (approx. SMTP latency).
    await new Promise((r) => setTimeout(r, 180 + randomInt(0, 120)));
  }

  await equalizeTiming(started, MIN_FORGOT_MS);
  return { ok: true, message: AUTH_FORGOT_OK };
}

export async function verifyForgotOtp(
  email: string,
  otp: string,
  captcha?: { id?: string; answer?: string }
): Promise<{ ok: true; token: string } | AuthFailResult> {
  const started = Date.now();
  const normalized = email.toLowerCase().trim();
  const ip = await getRequestIp();
  const bucket = authBucket("otp", normalized, ip);

  const rl = await generalRateLimit(`verify_otp:${sha256Hex(normalized).slice(0, 24)}`, {
    max: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    const challenge = await createAuthCaptcha();
    await equalizeTiming(started, MIN_OTP_MS);
    return { ok: false, error: AUTH_RATE_LIMITED, captchaRequired: true, captcha: challenge, retryAfter: rl.retryAfter };
  }

  const lock = await getLockoutStatus(bucket);
  if (lock.captchaRequired) {
    const okCaptcha = await verifyAuthCaptcha(String(captcha?.id || ""), String(captcha?.answer || ""));
    if (!okCaptcha) {
      const challenge = await createAuthCaptcha();
      await equalizeTiming(started, MIN_OTP_MS);
      return { ok: false, error: AUTH_CAPTCHA_REQUIRED, captchaRequired: true, captcha: challenge };
    }
  }

  const key = `forgot_otp_${sha256Hex(normalized).slice(0, 32)}`;
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1)
    .then((r) => r[0]);

  let data: { otp: string; expiresAt: number } | null = null;
  if (row) {
    try {
      data = JSON.parse(row.value);
    } catch {
      data = null;
    }
  }

  // Always bcrypt-compare (dummy hash if no OTP) for constant-time-ish behavior.
  const otpHash = data?.otp && typeof data.otp === "string" ? data.otp : DUMMY_BCRYPT;
  const otpMatch = await bcrypt.compare(otp || "000000", otpHash);
  const notExpired = data && typeof data.expiresAt === "number" && Date.now() <= data.expiresAt;

  if (!row || !data || !otpMatch || !notExpired) {
    await recordAuthFailure(bucket);
    await equalizeTiming(started, MIN_OTP_MS);
    const status = await getLockoutStatus(bucket);
    const challenge = status.captchaRequired ? await createAuthCaptcha() : undefined;
    return {
      ok: false,
      error: AUTH_OTP_FAIL,
      captchaRequired: status.captchaRequired,
      captcha: challenge,
    };
  }

  await db.delete(schema.settings).where(eq(schema.settings.key, key));

  const user = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, normalized), isNull(schema.users.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!user) {
    await equalizeTiming(started, MIN_OTP_MS);
    return { ok: false, error: AUTH_OTP_FAIL };
  }

  // Invalidate prior unused reset tokens for this user.
  await db
    .update(schema.passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.passwordResets.userId, user.id), isNull(schema.passwordResets.usedAt)));

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await db.insert(schema.passwordResets).values({
    userId: user.id,
    token: tokenHash,
    expiresAt,
  });

  // Opaque JWT carries only a random jti (raw token). Never log this value.
  const resetToken = await new SignJWT({
    email: normalized,
    purpose: "password_reset",
    jti: rawToken,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(getSecret());

  await clearAuthFailures(bucket);
  await equalizeTiming(started, MIN_OTP_MS);
  return { ok: true, token: resetToken };
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ ok: true } | AuthFailResult> {
  const started = Date.now();
  try {
    if (newPassword.length < 8) {
      await equalizeTiming(started, MIN_RESET_MS);
      return { ok: false, error: "Password must be at least 8 characters." };
    }
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== "password_reset" || !payload.email || !payload.jti) {
      await equalizeTiming(started, MIN_RESET_MS);
      return { ok: false, error: AUTH_TOKEN_FAIL };
    }
    const email = payload.email as string;
    const jti = payload.jti as string;
    const tokenHash = hashResetToken(jti);

    const resetRow = await db
      .select()
      .from(schema.passwordResets)
      .where(and(eq(schema.passwordResets.token, tokenHash), isNull(schema.passwordResets.usedAt)))
      .limit(1)
      .then((r) => r[0]);
    if (!resetRow || resetRow.expiresAt.getTime() < Date.now()) {
      await equalizeTiming(started, MIN_RESET_MS);
      return { ok: false, error: AUTH_TOKEN_FAIL };
    }

    const user = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
      .limit(1)
      .then((r) => r[0]);
    if (!user || user.id !== resetRow.userId) {
      await equalizeTiming(started, MIN_RESET_MS);
      return { ok: false, error: AUTH_TOKEN_FAIL };
    }

    // Single-use: mark consumed before password write.
    await db
      .update(schema.passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(schema.passwordResets.id, resetRow.id));

    await db
      .update(schema.users)
      .set({
        password: await hashPassword(newPassword),
        mustChangePwd: false,
        // Completing reset also proves inbox control.
        emailVerifiedAt: new Date(),
        active: true,
      })
      .where(eq(schema.users.id, user.id));
    await db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.userId, user.id), isNull(schema.sessions.revokedAt)));

    await equalizeTiming(started, MIN_RESET_MS);
    return { ok: true };
  } catch {
    await equalizeTiming(started, MIN_RESET_MS);
    return { ok: false, error: AUTH_TOKEN_FAIL };
  }
}

/** Issue a one-time email verification code (never put the code in a URL). */
export async function issueEmailVerification(userId: number, email: string, name: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  const code = String(randomInt(100000, 1000000));
  const key = `email_verify_${sha256Hex(normalized).slice(0, 32)}`;
  const hash = await bcrypt.hash(code, 12);
  const payload = JSON.stringify({
    userId,
    hash,
    expiresAt: Date.now() + VERIFY_CODE_TTL_MS,
  });
  await db
    .insert(schema.settings)
    .values({ key, value: payload })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: payload },
    });

  const { sendEmail } = await import("@/lib/email");
  await sendEmail({
    to: normalized,
    subject: "Verify your email — Kadam Production",
    html: `
      <div style="max-width:500px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
        <h2 style="color:#1e40af">Verify your email</h2>
        <p>Hello <strong>${escapeHtml(name)}</strong>,</p>
        <p>Enter this verification code in the app to activate your account. It expires in 1 hour.</p>
        <div style="margin:24px 0;text-align:center">
          <span style="display:inline-block;padding:12px 32px;font-size:28px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:8px;color:#1e40af">${code}</span>
        </div>
        <p style="color:#6b7280;font-size:13px">If you did not expect this email, you can ignore it.</p>
      </div>
    `,
  });
}

export async function verifyEmailOwnership(
  email: string,
  code: string,
  captcha?: { id?: string; answer?: string }
): Promise<{ ok: true } | AuthFailResult> {
  const started = Date.now();
  const normalized = email.toLowerCase().trim();
  const ip = await getRequestIp();
  const bucket = authBucket("verify", normalized, ip);

  const rl = await generalRateLimit(`email_verify:${sha256Hex(normalized).slice(0, 24)}`, {
    max: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    const challenge = await createAuthCaptcha();
    await equalizeTiming(started, MIN_VERIFY_MS);
    return { ok: false, error: AUTH_RATE_LIMITED, captchaRequired: true, captcha: challenge };
  }

  const lock = await getLockoutStatus(bucket);
  if (lock.captchaRequired) {
    const okCaptcha = await verifyAuthCaptcha(String(captcha?.id || ""), String(captcha?.answer || ""));
    if (!okCaptcha) {
      const challenge = await createAuthCaptcha();
      await equalizeTiming(started, MIN_VERIFY_MS);
      return { ok: false, error: AUTH_CAPTCHA_REQUIRED, captchaRequired: true, captcha: challenge };
    }
  }

  const key = `email_verify_${sha256Hex(normalized).slice(0, 32)}`;
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1)
    .then((r) => r[0]);

  let data: { userId: number; hash: string; expiresAt: number } | null = null;
  if (row) {
    try {
      data = JSON.parse(row.value);
    } catch {
      data = null;
    }
  }
  const hash = data?.hash && typeof data.hash === "string" ? data.hash : DUMMY_BCRYPT;
  const match = await bcrypt.compare(code || "000000", hash);
  const fresh = data && typeof data.expiresAt === "number" && Date.now() <= data.expiresAt;

  if (!row || !data || !match || !fresh) {
    await recordAuthFailure(bucket);
    await equalizeTiming(started, MIN_VERIFY_MS);
    const status = await getLockoutStatus(bucket);
    return {
      ok: false,
      error: AUTH_VERIFY_FAIL,
      captchaRequired: status.captchaRequired,
      captcha: status.captchaRequired ? await createAuthCaptcha() : undefined,
    };
  }

  await db.delete(schema.settings).where(eq(schema.settings.key, key));
  await db
    .update(schema.users)
    .set({ emailVerifiedAt: new Date(), active: true })
    .where(and(eq(schema.users.id, data.userId), eq(schema.users.email, normalized)));

  await clearAuthFailures(bucket);
  await equalizeTiming(started, MIN_VERIFY_MS);
  return { ok: true };
}

/** Verify current + set new password (Change Password page). */
export async function changePassword(
  userId: number,
  current: string,
  next: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!user) return { ok: false, error: "User not found" };
  if (current === next) return { ok: false, error: "New password must be different from the current password." };
  if (next.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (!(await bcrypt.compare(current, user.password))) return { ok: false, error: "Current password is incorrect" };
  await db
    .update(schema.users)
    .set({ password: await hashPassword(next), mustChangePwd: false })
    .where(eq(schema.users.id, userId));

  // Re-issue cookie with mustChangePwd=false and revoke other device sessions.
  const store = await cookies();
  const oldToken = store.get(COOKIE)?.value;
  let keepSessionId: string | undefined;
  if (oldToken) {
    try {
      const { payload } = await jwtVerify(oldToken, getSecret());
      keepSessionId = payload.sessionId as string | undefined;
    } catch {
      keepSessionId = undefined;
    }
  }
  const sessions = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
  for (const s of sessions) {
    if (keepSessionId && s.id === keepSessionId) continue;
    await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, s.id));
  }

  // Mint a fresh JWT reflecting mustChangePwd=false (reuse current session row if present).
  const sessionId = keepSessionId || crypto.randomUUID();
  if (!keepSessionId) {
    const now = new Date();
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      refreshToken: sessionId,
      rotated: false,
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
      createdAt: now,
    });
  }
  const fresh = await new SignJWT({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    sessionId,
    mustChangePwd: false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(getSecret());
  store.set(COOKIE, fresh, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return { ok: true };
}
