// src/lib/email-change.ts
// Secure email-change flows: admin (logged-in + OTP) and employee (request → approve → form → verify).
import { randomBytes, randomInt, createHash } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "./db";
import { hashPassword } from "./auth";
import { sendEmail } from "./email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Form-access + new-email verification window. */
export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Pending employee request waiting for admin approval. */
export const EMAIL_CHANGE_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "https://kadamproduction-opencode.vercel.app").replace(/\/$/, "");
}

function genOtp(): string {
  return String(randomInt(100000, 1000000));
}

function genToken(): string {
  return randomBytes(32).toString("hex");
}

async function emailTaken(email: string, excludeUserId?: number): Promise<boolean> {
  const row = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!row) return false;
  if (excludeUserId && row.id === excludeUserId) return false;
  return true;
}

async function getUser(userId: number) {
  return db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
}

// ─── Admin: start change (OTP to new email) ───────────────────────────────

export async function adminStartEmailChange(input: {
  adminId: number;
  currentPassword: string;
  newEmail: string;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const newEmail = input.newEmail.toLowerCase().trim();
  if (!EMAIL_RE.test(newEmail)) return { ok: false, error: "Invalid email address." };

  const admin = await getUser(input.adminId);
  if (!admin || admin.role !== "admin") return { ok: false, error: "Unauthorized." };
  if (!(await bcrypt.compare(input.currentPassword, admin.password))) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newEmail === admin.email.toLowerCase()) return { ok: false, error: "New email must be different." };
  if (await emailTaken(newEmail, admin.id)) return { ok: false, error: "Unable to use that email." };

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

  const verifyUrl = `${appBaseUrl()}/change-email/verify?token=${verifyToken}`;
  await sendEmail({
    to: newEmail,
    subject: "Confirm your new admin email — Kadam Production",
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
        <h2 style="color:#1e40af">Confirm email change</h2>
        <p>Hello <strong>${escapeHtml(admin.name)}</strong>,</p>
        <p>Enter this one-time OTP in the app, or open the one-time link. Both expire in <strong>1 hour</strong> and can be used only once.</p>
        <div style="margin:20px 0;text-align:center">
          <span style="display:inline-block;padding:12px 28px;font-size:28px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:8px;color:#1e40af">${otp}</span>
        </div>
        <p style="text-align:center"><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Verify new email</a></p>
        <p style="color:#6b7280;font-size:12px">If you did not request this, ignore this message. Your current email stays active until verification completes.</p>
      </div>
    `,
  });

  return { ok: true, requestId: id };
}

export async function adminConfirmEmailChangeOtp(input: {
  adminId: number;
  requestId: string;
  otp: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db
    .select()
    .from(schema.emailChangeRequests)
    .where(and(eq(schema.emailChangeRequests.id, input.requestId), eq(schema.emailChangeRequests.userId, input.adminId)))
    .limit(1)
    .then((r) => r[0]);
  return finalizeNewEmailVerification(row, { otp: input.otp });
}

// ─── Employee: request ────────────────────────────────────────────────────

export async function employeeRequestEmailChange(input: {
  userId: number;
  requestedNewEmail?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser(input.userId);
  if (!user || user.role !== "employee") return { ok: false, error: "Unauthorized." };

  const requested = (input.requestedNewEmail || "").toLowerCase().trim();
  if (requested) {
    if (!EMAIL_RE.test(requested)) return { ok: false, error: "Invalid email address." };
    if (requested === user.email.toLowerCase()) return { ok: false, error: "New email must be different." };
    if (await emailTaken(requested, user.id)) return { ok: false, error: "Unable to use that email." };
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
  if (open) return { ok: false, error: "You already have a pending email change request." };

  await db.insert(schema.emailChangeRequests).values({
    id: crypto.randomUUID(),
    userId: user.id,
    role: "employee",
    currentEmail: user.email,
    requestedNewEmail: requested || null,
    status: "pending",
    expiresAt: new Date(Date.now() + EMAIL_CHANGE_REQUEST_TTL_MS),
  });

  // Notify admins
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

  return { ok: true };
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

  const formUrl = `${appBaseUrl()}/change-email/complete?token=${formToken}`;
  await sendEmail({
    to: user.email,
    subject: "Email change approved — complete your update",
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
        <h2 style="color:#1e40af">Email change approved</h2>
        <p>Hello <strong>${escapeHtml(user.name)}</strong>,</p>
        <p>An administrator approved your email change request. Use the one-time link or OTP below within <strong>1 hour</strong> to open the secure form. You will confirm your current password and set a new email + password. Your account email does <strong>not</strong> change until the new inbox is verified.</p>
        <div style="margin:20px 0;text-align:center">
          <span style="display:inline-block;padding:12px 28px;font-size:28px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:8px;color:#1e40af">${formOtp}</span>
        </div>
        <p style="text-align:center"><a href="${formUrl}" style="display:inline-block;padding:10px 20px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open change form</a></p>
        <p style="color:#6b7280;font-size:12px">Link and OTP are single-use. If you did not request this, contact your administrator.</p>
      </div>
    `,
  });

  try {
    await db.insert(schema.notifications).values({
      userId: user.id,
      type: "email_change_approved",
      title: "Email change approved",
      message: "Check your email for a one-time link/OTP to complete the change.",
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
}): Promise<{ ok: true; requestId: string; currentEmail: string; requestedNewEmail: string | null } | { ok: false; error: string }> {
  let row:
    | typeof schema.emailChangeRequests.$inferSelect
    | undefined;

  if (input.token) {
    const hash = sha256(input.token);
    row = await db
      .select()
      .from(schema.emailChangeRequests)
      .where(and(eq(schema.emailChangeRequests.formTokenHash, hash), eq(schema.emailChangeRequests.status, "approved")))
      .limit(1)
      .then((r) => r[0]);
  } else if (input.email && input.otp) {
    const email = input.email.toLowerCase().trim();
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
  const newEmail = input.newEmail.toLowerCase().trim();
  const currentEmail = input.currentEmail.toLowerCase().trim();
  if (!EMAIL_RE.test(newEmail)) return { ok: false, error: "Invalid new email." };
  if (input.newPassword.length < 8) return { ok: false, error: "New password must be at least 8 characters." };

  const row = await db
    .select()
    .from(schema.emailChangeRequests)
    .where(eq(schema.emailChangeRequests.id, input.requestId))
    .limit(1)
    .then((r) => r[0]);
  if (!row || row.status !== "approved") return { ok: false, error: "Invalid request." };
  if (row.formTokenUsedAt) return { ok: false, error: "This access code was already used." };
  if (!row.formTokenExpiresAt || row.formTokenExpiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This access code has expired." };
  }

  // Validate one-time form access still matches
  let accessOk = false;
  if (input.accessToken && row.formTokenHash === sha256(input.accessToken)) accessOk = true;
  if (!accessOk && input.accessOtp && row.formOtpHash) {
    accessOk = await bcrypt.compare(input.accessOtp, row.formOtpHash);
  }
  if (!accessOk) return { ok: false, error: "Invalid or expired access code." };

  const user = await getUser(row.userId);
  if (!user) return { ok: false, error: "Invalid request." };
  if (user.email.toLowerCase() !== currentEmail || row.currentEmail.toLowerCase() !== currentEmail) {
    return { ok: false, error: "Current email does not match this account." };
  }
  if (!(await bcrypt.compare(input.currentPassword, user.password))) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newEmail === currentEmail) return { ok: false, error: "New email must be different." };
  if (await emailTaken(newEmail, user.id)) return { ok: false, error: "Unable to use that email." };

  const verifyToken = genToken();
  const verifyOtp = genOtp();
  const verifyExpires = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
  const pendingPasswordHash = await hashPassword(input.newPassword);

  // Consume form access (single-use) and move to credentials_ok
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

  const verifyUrl = `${appBaseUrl()}/change-email/verify?token=${verifyToken}`;
  await sendEmail({
    to: newEmail,
    subject: "Verify your new email — Kadam Production",
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
        <h2 style="color:#1e40af">Verify your new email</h2>
        <p>Hello <strong>${escapeHtml(user.name)}</strong>,</p>
        <p>Confirm ownership of this inbox to finish switching your account email. Until you verify, your login remains <strong>${escapeHtml(currentEmail)}</strong>.</p>
        <div style="margin:20px 0;text-align:center">
          <span style="display:inline-block;padding:12px 28px;font-size:28px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:8px;color:#1e40af">${verifyOtp}</span>
        </div>
        <p style="text-align:center"><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Verify new email</a></p>
        <p style="color:#6b7280;font-size:12px">OTP and link expire in 1 hour and are single-use.</p>
      </div>
    `,
  });

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
  if (proof.token && row.verifyTokenHash === sha256(proof.token)) ok = true;
  if (!ok && proof.otp && row.verifyOtpHash) ok = await bcrypt.compare(proof.otp, row.verifyOtpHash);
  if (!ok) return { ok: false, error: "Invalid or expired verification." };

  const newEmail = (row.pendingNewEmail || row.requestedNewEmail || "").toLowerCase().trim();
  if (!newEmail || !EMAIL_RE.test(newEmail)) return { ok: false, error: "Invalid request state." };
  if (await emailTaken(newEmail, row.userId)) {
    return { ok: false, error: "Unable to use that email." };
  }

  const user = await getUser(row.userId);
  if (!user) return { ok: false, error: "User not found." };

  const patch: { email: string; password?: string; updatedAt: Date } = {
    email: newEmail,
    updatedAt: new Date(),
  };
  if (row.pendingPasswordHash) patch.password = row.pendingPasswordHash;

  // Atomic-ish: mark verify used, then update user, then complete request
  await db
    .update(schema.emailChangeRequests)
    .set({ verifyUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.emailChangeRequests.id, row.id));

  await db.update(schema.users).set(patch).where(eq(schema.users.id, row.userId));

  await db
    .update(schema.emailChangeRequests)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.emailChangeRequests.id, row.id));

  // Revoke other sessions so devices re-auth with new email
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.sessions.userId, row.userId), isNull(schema.sessions.revokedAt)));

  return { ok: true };
}

export async function verifyEmailChangeWithToken(token: string) {
  const hash = sha256(token);
  const row = await db
    .select()
    .from(schema.emailChangeRequests)
    .where(eq(schema.emailChangeRequests.verifyTokenHash, hash))
    .limit(1)
    .then((r) => r[0]);
  return finalizeNewEmailVerification(row, { token });
}

export async function verifyEmailChangeWithOtp(input: { email: string; otp: string; requestId?: string }) {
  const email = input.email.toLowerCase().trim();
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
      return finalizeNewEmailVerification(row, { otp: input.otp });
    }
  }
  return { ok: false as const, error: "Invalid or expired verification." };
}
