// src/lib/email-change.ts
// Secure email-change flows: admin (logged-in + OTP) and employee (request → approve → form → verify).
import { randomBytes, randomInt, createHash } from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "./db";
import { hashPassword } from "./auth";
import { sendEmail } from "./email";
import { escapeHtml } from "./escape-html";
import {
  AUTH_EMAIL_CHANGE_UNAVAILABLE,
  AUTH_RATE_LIMITED,
  AUTH_CAPTCHA_REQUIRED,
  AUTH_LOCKED,
  MIN_EMAIL_CHANGE_MS,
  authBucket,
  clearAuthFailures,
  createAuthCaptcha,
  equalizeTiming,
  getLockoutStatus,
  getRequestIp,
  recordAuthFailure,
  safeEqualHex,
  sha256Hex,
  verifyAuthCaptcha,
} from "./auth-security";
import { checkRateLimit as generalRateLimit } from "./rate-limiter";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Form-access + new-email verification window. */
export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Pending employee request waiting for admin approval. */
export const EMAIL_CHANGE_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Identical copy whether the new address is free or already registered. */
export const EMAIL_CHANGE_START_OK =
  "If that address is available, a one-time code was sent. Check the inbox and enter the OTP below.";

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "https://parth-production-app.vercel.app").replace(/\/$/, "");
}

function genOtp(): string {
  return String(randomInt(100000, 1000000));
}

function genToken(): string {
  return randomBytes(32).toString("hex");
}

async function emailTaken(email: string, excludeUserId?: number): Promise<boolean> {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(sql`lower(${schema.users.email}) = ${email}`, isNull(schema.users.deletedAt)))
    .limit(5);
  return rows.some((row) => !excludeUserId || row.id !== excludeUserId);
}

/**
 * Free an address held only by a stale invite (never verified, inactive employee).
 * Does not touch verified or active accounts — that is the real "taken" case.
 */
async function releaseStaleEmailClaim(email: string, excludeUserId?: number): Promise<void> {
  const rows = await db
    .select({
      id: schema.users.id,
      role: schema.users.role,
      active: schema.users.active,
      emailVerifiedAt: schema.users.emailVerifiedAt,
    })
    .from(schema.users)
    .where(and(sql`lower(${schema.users.email}) = ${email}`, isNull(schema.users.deletedAt)))
    .limit(5);

  for (const row of rows) {
    if (excludeUserId && row.id === excludeUserId) continue;
    const unverified = row.emailVerifiedAt == null;
    const inactive = row.active === false;
    if (row.role === "employee" && unverified && inactive) {
      await db
        .update(schema.users)
        .set({
          deletedAt: new Date(),
          email: sql`"deleted_" || ${schema.users.id} || "_" || ${schema.users.email}`,
          active: false,
        })
        .where(eq(schema.users.id, row.id));
    }
  }
}

async function getUser(userId: number) {
  return db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
}

async function enforceEmailChangeLimits(
  action: string,
  email: string,
  captcha?: { id?: string; answer?: string }
): Promise<{ ok: true } | { ok: false; error: string; captchaRequired?: boolean; captcha?: { id: string; question: string } }> {
  const ip = await getRequestIp();
  const bucket = authBucket(action, email, ip);

  const rl = await generalRateLimit(`${action}:${sha256Hex(email).slice(0, 24)}`, {
    max: 5,
    windowMs: 15 * 60 * 1000,
  });
  const rlIp = await generalRateLimit(`${action}_ip:${ip}`, { max: 20, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed || !rlIp.allowed) {
    return { ok: false, error: AUTH_RATE_LIMITED, captchaRequired: true, captcha: await createAuthCaptcha() };
  }

  const lock = await getLockoutStatus(bucket);
  if (lock.locked) {
    return {
      ok: false,
      error: AUTH_LOCKED,
      captchaRequired: true,
      captcha: await createAuthCaptcha(),
    };
  }
  if (lock.captchaRequired) {
    const okCaptcha = await verifyAuthCaptcha(String(captcha?.id || ""), String(captcha?.answer || ""));
    if (!okCaptcha) {
      return {
        ok: false,
        error: AUTH_CAPTCHA_REQUIRED,
        captchaRequired: true,
        captcha: await createAuthCaptcha(),
      };
    }
  }
  return { ok: true };
}

// ─── Admin: start change (OTP to new email) ───────────────────────────────

export async function adminStartEmailChange(input: {
  adminId: number;
  currentPassword: string;
  newEmail: string;
  captcha?: { id?: string; answer?: string };
}): Promise<
  | { ok: true; requestId: string; message: string }
  | { ok: false; error: string; captchaRequired?: boolean; captcha?: { id: string; question: string } }
> {
  const started = Date.now();
  const newEmail = input.newEmail.toLowerCase().trim();

  if (!EMAIL_RE.test(newEmail)) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Invalid email address." };
  }

  const admin = await getUser(input.adminId);
  if (!admin || admin.role !== "admin") {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Unauthorized." };
  }

  // Always bcrypt-compare for timing parity on wrong password.
  const ip = await getRequestIp();
  const pwdRl = await generalRateLimit(`admin_email_change_pwd:${admin.id}:${ip}`, {
    max: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!pwdRl.allowed) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: AUTH_RATE_LIMITED, captchaRequired: true, captcha: await createAuthCaptcha() };
  }
  const pwdOk = await bcrypt.compare(input.currentPassword, admin.password);
  if (!pwdOk) {
    await recordAuthFailure(authBucket("admin_email_change_pwd", admin.email, ip));
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newEmail === admin.email.toLowerCase()) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "New email must be different." };
  }

  const limits = await enforceEmailChangeLimits("email_change_start", newEmail, input.captcha);
  if (!limits.ok) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return limits;
  }

  // Release stale unverified invites holding this address (fixes false "unable to use").
  await releaseStaleEmailClaim(newEmail, admin.id);

  const taken = await emailTaken(newEmail, admin.id);

  // Cancel prior open admin change requests
  await db
    .update(schema.emailChangeRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(schema.emailChangeRequests.userId, admin.id),
        eq(schema.emailChangeRequests.status, "pending")
      )
    );

  // Anti-enumeration: identical success copy + timing whether taken or free.
  // When taken, still mint a dummy requestId so the OTP UI does not leak availability.
  if (taken) {
    await new Promise((r) => setTimeout(r, 400 + randomInt(0, 400)));
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return {
      ok: true,
      requestId: crypto.randomUUID(),
      message: EMAIL_CHANGE_START_OK,
    };
  }

  const otp = genOtp();
  const verifyToken = genToken();
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
  const id = crypto.randomUUID();

  await db.insert(schema.emailChangeRequests).values({
    id,
    userId: admin.id,
    role: "admin",
    currentEmail: admin.email,
    requestedNewEmail: newEmail,
    pendingNewEmail: newEmail,
    status: "pending",
    verifyOtpHash: await bcrypt.hash(otp, 12),
    verifyTokenHash: sha256(verifyToken),
    verifyExpiresAt: expiresAt,
    expiresAt,
  });

  // Token is stored hashed only; email body carries OTP (never put secrets in URLs/logs).
  const verifyPage = `${appBaseUrl()}/change-email/verify`;
  try {
    await sendEmail({
      to: newEmail,
      subject: "Confirm your new admin email — Parth Production",
      html: `
      <div style="max-width:520px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
        <h2 style="color:#1e40af">Confirm email change</h2>
        <p>Hello <strong>${escapeHtml(admin.name)}</strong>,</p>
        <p>Enter this one-time OTP in the app. It expires in <strong>1 hour</strong> and can be used only once.</p>
        <div style="margin:20px 0;text-align:center">
          <span style="display:inline-block;padding:12px 28px;font-size:28px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:8px;color:#1e40af">${otp}</span>
        </div>
        <p style="text-align:center"><a href="${verifyPage}" style="display:inline-block;padding:10px 20px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open verification page</a></p>
        <p style="color:#6b7280;font-size:12px">If you did not request this, ignore this message. Your current email stays active until verification completes.</p>
      </div>
    `,
    });
  } catch (err) {
    console.error("[email-change] admin start send failed");
    await db
      .update(schema.emailChangeRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(schema.emailChangeRequests.id, id));
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: AUTH_EMAIL_CHANGE_UNAVAILABLE };
  }

  // verifyToken kept hashed in DB for optional future server-side use; never emailed in a URL.
  void verifyToken;
  await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
  return { ok: true, requestId: id, message: EMAIL_CHANGE_START_OK };
}

export async function adminConfirmEmailChangeOtp(input: {
  adminId: number;
  requestId: string;
  otp: string;
  captcha?: { id?: string; answer?: string };
}): Promise<
  | { ok: true }
  | { ok: false; error: string; captchaRequired?: boolean; captcha?: { id: string; question: string } }
> {
  const started = Date.now();
  const limits = await enforceEmailChangeLimits("email_change_confirm", String(input.adminId), input.captcha);
  if (!limits.ok) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return limits;
  }

  const row = await db
    .select()
    .from(schema.emailChangeRequests)
    .where(and(eq(schema.emailChangeRequests.id, input.requestId), eq(schema.emailChangeRequests.userId, input.adminId)))
    .limit(1)
    .then((r) => r[0]);

  const result = await finalizeNewEmailVerification(row, { otp: input.otp });
  if (!result.ok) {
    await recordAuthFailure(authBucket("email_change_confirm", String(input.adminId), await getRequestIp()));
  } else {
    await clearAuthFailures(authBucket("email_change_confirm", String(input.adminId), await getRequestIp()));
  }
  await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
  return result;
}

// ─── Employee: request ────────────────────────────────────────────────────

export async function employeeRequestEmailChange(input: {
  userId: number;
  requestedNewEmail?: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const started = Date.now();
  const user = await getUser(input.userId);
  if (!user || user.role !== "employee") {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Unauthorized." };
  }
  if (user.active === false) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Account is inactive." };
  }

  const requested = (input.requestedNewEmail || "").toLowerCase().trim();
  if (requested) {
    if (!EMAIL_RE.test(requested)) {
      await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
      return { ok: false, error: "Invalid email address." };
    }
    if (requested === user.email.toLowerCase()) {
      await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
      return { ok: false, error: "New email must be different." };
    }
    // Do NOT release stale invites from employee-controlled requests (IDOR).
    // Reclaim happens only after proven ownership at final verification / admin start.
  }

  const open = await db
    .select({ id: schema.emailChangeRequests.id })
    .from(schema.emailChangeRequests)
    .where(
      and(
        eq(schema.emailChangeRequests.userId, user.id),
        eq(schema.emailChangeRequests.status, "pending")
      )
    )
    .limit(1)
    .then((r) => r[0]);
  if (open) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "You already have a pending email change request." };
  }

  await db.insert(schema.emailChangeRequests).values({
    id: crypto.randomUUID(),
    userId: user.id,
    role: "employee",
    currentEmail: user.email,
    requestedNewEmail: requested || null,
    status: "pending",
    expiresAt: new Date(Date.now() + EMAIL_CHANGE_REQUEST_TTL_MS),
  });

  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "admin"), isNull(schema.users.deletedAt)));
  for (const a of admins) {
    try {
      await db.insert(schema.notifications).values({
        userId: a.id,
        type: "email_change_request",
        title: "Email change request",
        message: `${user.name} requested an email change${requested ? ` to ${requested}` : ""}.`,
        link: "/email-change-requests",
      });
    } catch {
      // ignore notification failures
    }
  }

  await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
  return {
    ok: true,
    message: "Request submitted. An admin must approve it before you can complete the change.",
  };
}

export async function listPendingEmailChangeRequests() {
  return db
    .select({
      id: schema.emailChangeRequests.id,
      userId: schema.emailChangeRequests.userId,
      currentEmail: schema.emailChangeRequests.currentEmail,
      requestedNewEmail: schema.emailChangeRequests.requestedNewEmail,
      status: schema.emailChangeRequests.status,
      createdAt: schema.emailChangeRequests.createdAt,
      expiresAt: schema.emailChangeRequests.expiresAt,
      userName: schema.users.name,
    })
    .from(schema.emailChangeRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.emailChangeRequests.userId))
    .where(
      and(
        eq(schema.emailChangeRequests.status, "pending"),
        eq(schema.emailChangeRequests.role, "employee")
      )
    )
    .orderBy(desc(schema.emailChangeRequests.createdAt));
}

export async function listMyEmailChangeRequests(userId: number) {
  return db
    .select()
    .from(schema.emailChangeRequests)
    .where(eq(schema.emailChangeRequests.userId, userId))
    .orderBy(desc(schema.emailChangeRequests.createdAt))
    .limit(10);
}

export async function adminRejectEmailChange(adminId: number, requestId: string) {
  const admin = await getUser(adminId);
  if (!admin || admin.role !== "admin") return { ok: false as const, error: "Unauthorized." };
  const row = await db
    .select()
    .from(schema.emailChangeRequests)
    .where(eq(schema.emailChangeRequests.id, requestId))
    .limit(1)
    .then((r) => r[0]);
  if (!row || row.status !== "pending") return { ok: false as const, error: "Request not found." };
  await db
    .update(schema.emailChangeRequests)
    .set({ status: "rejected", rejectedAt: new Date(), approvedBy: adminId, updatedAt: new Date() })
    .where(eq(schema.emailChangeRequests.id, requestId));
  return { ok: true as const };
}

export async function adminApproveEmailChange(adminId: number, requestId: string) {
  const admin = await getUser(adminId);
  if (!admin || admin.role !== "admin") return { ok: false as const, error: "Unauthorized." };

  const row = await db
    .select()
    .from(schema.emailChangeRequests)
    .where(eq(schema.emailChangeRequests.id, requestId))
    .limit(1)
    .then((r) => r[0]);
  if (!row || row.status !== "pending" || row.role !== "employee") {
    return { ok: false as const, error: "Request not found." };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await db
      .update(schema.emailChangeRequests)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(schema.emailChangeRequests.id, requestId));
    return { ok: false as const, error: "Request expired." };
  }

  const user = await getUser(row.userId);
  if (!user) return { ok: false as const, error: "User not found." };

  const formToken = genToken();
  const formOtp = genOtp();
  const formExpires = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);

  await db
    .update(schema.emailChangeRequests)
    .set({
      status: "approved",
      approvedBy: adminId,
      approvedAt: new Date(),
      formTokenHash: sha256(formToken),
      formTokenExpiresAt: formExpires,
      formOtpHash: await bcrypt.hash(formOtp, 12),
      expiresAt: formExpires,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailChangeRequests.id, requestId));

  // OTP only — no token in URL (open /change-email/complete and enter email + OTP).
  const formPage = `${appBaseUrl()}/change-email/complete`;
  try {
    await sendEmail({
      to: user.email,
      subject: "Email change approved — complete your update",
      html: `
      <div style="max-width:520px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
        <h2 style="color:#1e40af">Email change approved</h2>
        <p>Hello <strong>${escapeHtml(user.name)}</strong>,</p>
        <p>An administrator approved your email change request. Use the one-time OTP below within <strong>1 hour</strong> on the secure form. You will confirm your current password and set a new email + password. Your account email does <strong>not</strong> change until the new inbox is verified.</p>
        <div style="margin:20px 0;text-align:center">
          <span style="display:inline-block;padding:12px 28px;font-size:28px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:8px;color:#1e40af">${formOtp}</span>
        </div>
        <p style="text-align:center"><a href="${formPage}" style="display:inline-block;padding:10px 20px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open change form</a></p>
        <p style="color:#6b7280;font-size:12px">OTP is single-use. If you did not request this, contact your administrator.</p>
      </div>
    `,
    });
  } catch (err) {
    console.error("[email-change] approve send failed");
    await db
      .update(schema.emailChangeRequests)
      .set({ status: "pending", formTokenHash: null, formOtpHash: null, formTokenExpiresAt: null, updatedAt: new Date() })
      .where(eq(schema.emailChangeRequests.id, requestId));
    return { ok: false as const, error: AUTH_EMAIL_CHANGE_UNAVAILABLE };
  }

  void formToken; // stored hashed only; not emailed in a URL

  try {
    await db.insert(schema.notifications).values({
      userId: user.id,
      type: "email_change_approved",
      title: "Email change approved",
      message: "Check your email for a one-time OTP to complete the change.",
      link: "/change-email",
    });
  } catch {
    // ignore
  }

  return { ok: true as const };
}

/** Open approved form via one-time token or OTP (does not consume until credentials submitted). */
export async function resolveApprovedFormAccess(input: {
  token?: string;
  email?: string;
  otp?: string;
}): Promise<
  | { ok: true; requestId: string; currentEmail: string; requestedNewEmail: string | null }
  | { ok: false; error: string }
> {
  const ip = await getRequestIp();
  const rl = await generalRateLimit(`email_change_form_access:${ip}`, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) return { ok: false, error: AUTH_RATE_LIMITED };

  let row: typeof schema.emailChangeRequests.$inferSelect | undefined;

  if (input.token) {
    // Legacy path: accept token if somehow provided, compare with timing-safe hex equality.
    const hash = sha256(input.token);
    const candidates = await db
      .select()
      .from(schema.emailChangeRequests)
      .where(eq(schema.emailChangeRequests.status, "approved"))
      .orderBy(desc(schema.emailChangeRequests.approvedAt))
      .limit(20);
    row = candidates.find((c) => c.formTokenHash && safeEqualHex(c.formTokenHash, hash));
  } else if (input.email && input.otp) {
    const email = input.email.toLowerCase().trim();
    const emailRl = await generalRateLimit(`email_change_form_otp:${sha256Hex(email).slice(0, 24)}`, {
      max: 8,
      windowMs: 15 * 60 * 1000,
    });
    if (!emailRl.allowed) return { ok: false, error: AUTH_RATE_LIMITED };

    const candidates = await db
      .select()
      .from(schema.emailChangeRequests)
      .where(and(eq(schema.emailChangeRequests.currentEmail, email), eq(schema.emailChangeRequests.status, "approved")))
      .orderBy(desc(schema.emailChangeRequests.approvedAt))
      .limit(5);
    for (const c of candidates) {
      if (!c.formOtpHash) continue;
      if (c.formTokenExpiresAt && c.formTokenExpiresAt.getTime() < Date.now()) continue;
      if (c.formTokenUsedAt) continue;
      if (await bcrypt.compare(input.otp, c.formOtpHash)) {
        row = c;
        break;
      }
    }
  } else {
    return { ok: false, error: "Missing access token or OTP." };
  }

  if (!row) return { ok: false, error: "Invalid or expired access code." };
  if (row.formTokenUsedAt) return { ok: false, error: "This access code was already used." };
  if (!row.formTokenExpiresAt || row.formTokenExpiresAt.getTime() < Date.now()) {
    await db
      .update(schema.emailChangeRequests)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(schema.emailChangeRequests.id, row.id));
    return { ok: false, error: "This access code has expired." };
  }

  return {
    ok: true,
    requestId: row.id,
    currentEmail: row.currentEmail,
    requestedNewEmail: row.requestedNewEmail,
  };
}

/**
 * Employee submits current credentials + new email/password.
 * Consumes form token/OTP. Sends new-email verification (does NOT swap yet).
 */
export async function submitEmailChangeCredentials(input: {
  requestId: string;
  accessToken?: string;
  accessOtp?: string;
  currentEmail: string;
  currentPassword: string;
  newEmail: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const started = Date.now();
  const newEmail = input.newEmail.toLowerCase().trim();
  const currentEmail = input.currentEmail.toLowerCase().trim();
  if (!EMAIL_RE.test(newEmail)) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Invalid new email." };
  }
  if (input.newPassword.length < 8) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "New password must be at least 8 characters." };
  }

  const row = await db
    .select()
    .from(schema.emailChangeRequests)
    .where(eq(schema.emailChangeRequests.id, input.requestId))
    .limit(1)
    .then((r) => r[0]);
  if (!row || row.status !== "approved") {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Invalid request." };
  }
  if (row.formTokenUsedAt) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "This access code was already used." };
  }
  if (!row.formTokenExpiresAt || row.formTokenExpiresAt.getTime() < Date.now()) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "This access code has expired." };
  }

  let accessOk = false;
  if (input.accessToken && row.formTokenHash && safeEqualHex(row.formTokenHash, sha256(input.accessToken))) {
    accessOk = true;
  }
  if (!accessOk && input.accessOtp && row.formOtpHash) {
    accessOk = await bcrypt.compare(input.accessOtp, row.formOtpHash);
  }
  if (!accessOk) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Invalid or expired access code." };
  }

  const user = await getUser(row.userId);
  if (!user) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Invalid request." };
  }
  if (user.active === false) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Account is inactive." };
  }
  if (user.email.toLowerCase() !== currentEmail || row.currentEmail.toLowerCase() !== currentEmail) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Current email does not match this account." };
  }
  // Rate-limit current-password attempts from stolen sessions.
  const ip = await getRequestIp();
  const pwdRl = await generalRateLimit(`email_change_pwd:${user.id}:${ip}`, {
    max: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!pwdRl.allowed) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: AUTH_RATE_LIMITED };
  }
  if (!(await bcrypt.compare(input.currentPassword, user.password))) {
    await recordAuthFailure(authBucket("email_change_pwd", currentEmail, ip));
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newEmail === currentEmail) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: "New email must be different." };
  }

  // Reclaim only at finalization after new-inbox OTP — not here.
  if (await emailTaken(newEmail, user.id)) {
    // Generic — do not say "already in use".
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: AUTH_EMAIL_CHANGE_UNAVAILABLE };
  }

  const verifyToken = genToken();
  const verifyOtp = genOtp();
  const verifyExpires = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
  const pendingPasswordHash = await hashPassword(input.newPassword);

  await db
    .update(schema.emailChangeRequests)
    .set({
      status: "credentials_ok",
      formTokenUsedAt: new Date(),
      pendingNewEmail: newEmail,
      pendingPasswordHash,
      verifyTokenHash: sha256(verifyToken),
      verifyOtpHash: await bcrypt.hash(verifyOtp, 12),
      verifyExpiresAt: verifyExpires,
      expiresAt: verifyExpires,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailChangeRequests.id, row.id));

  const verifyPage = `${appBaseUrl()}/change-email/verify`;
  try {
    await sendEmail({
      to: newEmail,
      subject: "Verify your new email — Parth Production",
      html: `
      <div style="max-width:520px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
        <h2 style="color:#1e40af">Verify your new email</h2>
        <p>Hello <strong>${escapeHtml(user.name)}</strong>,</p>
        <p>Confirm ownership of this inbox to finish switching your account email. Until you verify, your login remains <strong>${escapeHtml(currentEmail)}</strong>.</p>
        <div style="margin:20px 0;text-align:center">
          <span style="display:inline-block;padding:12px 28px;font-size:28px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:8px;color:#1e40af">${verifyOtp}</span>
        </div>
        <p style="text-align:center"><a href="${verifyPage}" style="display:inline-block;padding:10px 20px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open verification page</a></p>
        <p style="color:#6b7280;font-size:12px">OTP expires in 1 hour and is single-use.</p>
      </div>
    `,
    });
  } catch (err) {
    console.error("[email-change] credentials verify send failed");
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return { ok: false, error: AUTH_EMAIL_CHANGE_UNAVAILABLE };
  }

  void verifyToken;
  await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
  return { ok: true };
}

async function finalizeNewEmailVerification(
  row: typeof schema.emailChangeRequests.$inferSelect | undefined,
  proof: { otp?: string; token?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!row) return { ok: false, error: "Invalid or expired verification." };
  if (row.verifyUsedAt) return { ok: false, error: "This verification was already used." };
  if (!row.verifyExpiresAt || row.verifyExpiresAt.getTime() < Date.now()) {
    await db
      .update(schema.emailChangeRequests)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(schema.emailChangeRequests.id, row.id));
    return { ok: false, error: "Verification expired. Your previous email is still active." };
  }
  if (row.status !== "pending" && row.status !== "credentials_ok") {
    return { ok: false, error: "Invalid or expired verification." };
  }

  let ok = false;
  if (proof.token && row.verifyTokenHash && safeEqualHex(row.verifyTokenHash, sha256(proof.token))) {
    ok = true;
  }
  if (!ok && proof.otp && row.verifyOtpHash) ok = await bcrypt.compare(proof.otp, row.verifyOtpHash);
  if (!ok) return { ok: false, error: "Invalid or expired verification." };

  const newEmail = (row.pendingNewEmail || row.requestedNewEmail || "").toLowerCase().trim();
  if (!newEmail || !EMAIL_RE.test(newEmail)) return { ok: false, error: "Invalid request state." };

  await releaseStaleEmailClaim(newEmail, row.userId);
  if (await emailTaken(newEmail, row.userId)) {
    return { ok: false, error: AUTH_EMAIL_CHANGE_UNAVAILABLE };
  }

  const user = await getUser(row.userId);
  if (!user) return { ok: false, error: "User not found." };
  // Deactivated accounts must not self-reactivate via email change.
  if (user.active === false) return { ok: false, error: "Account is inactive." };

  const patch: {
    email: string;
    password?: string;
    emailVerifiedAt: Date;
    updatedAt: Date;
  } = {
    email: newEmail,
    emailVerifiedAt: new Date(),
    updatedAt: new Date(),
  };
  if (row.pendingPasswordHash) patch.password = row.pendingPasswordHash;

  await db
    .update(schema.emailChangeRequests)
    .set({ verifyUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.emailChangeRequests.id, row.id));

  await db.update(schema.users).set(patch).where(eq(schema.users.id, row.userId));

  await db
    .update(schema.emailChangeRequests)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.emailChangeRequests.id, row.id));

  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.sessions.userId, row.userId), isNull(schema.sessions.revokedAt)));

  return { ok: true };
}

export async function verifyEmailChangeWithOtp(input: {
  email: string;
  otp: string;
  requestId?: string;
  captcha?: { id?: string; answer?: string };
}) {
  const started = Date.now();
  const email = input.email.toLowerCase().trim();
  const limits = await enforceEmailChangeLimits("email_change_verify", email, input.captcha);
  if (!limits.ok) {
    await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
    return limits;
  }

  let rows = await db
    .select()
    .from(schema.emailChangeRequests)
    .where(eq(schema.emailChangeRequests.pendingNewEmail, email))
    .orderBy(desc(schema.emailChangeRequests.updatedAt))
    .limit(8);
  if (input.requestId) {
    rows = rows.filter((r) => r.id === input.requestId);
  }
  for (const row of rows) {
    if (row.verifyUsedAt) continue;
    if (!row.verifyOtpHash) continue;
    if (row.status !== "pending" && row.status !== "credentials_ok") continue;
    if (await bcrypt.compare(input.otp, row.verifyOtpHash)) {
      const result = await finalizeNewEmailVerification(row, { otp: input.otp });
      if (result.ok) await clearAuthFailures(authBucket("email_change_verify", email, await getRequestIp()));
      await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
      return result;
    }
  }
  await recordAuthFailure(authBucket("email_change_verify", email, await getRequestIp()));
  await equalizeTiming(started, MIN_EMAIL_CHANGE_MS);
  return { ok: false as const, error: "Invalid or expired verification." };
}
