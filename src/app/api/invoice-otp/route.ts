// src/app/api/invoice-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { randomInt } from "crypto";
import { db, schema } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatOrderNumber } from "@/lib/invoice-number";
import { escapeHtml } from "@/lib/escape-html";
import { checkRateLimit } from "@/lib/rate-limiter";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { getAuthSecretBytes } from "@/lib/auth-secret";

const OTP_EXPIRY = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const COOKIE_NAME = "kp_inv_access";
const GENERIC_SEND_ERR = "Unable to send OTP for this request.";
const OK = NextResponse.json({ ok: true });

function getClientIp(req: NextRequest): string {
  return clientIpFromHeaders(req.headers);
}

export async function POST(req: NextRequest) {
  try {
    const { action, orderId, email, otp } = await req.json();
    if (!orderId || !email) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const normalizedEmail = String(email).toLowerCase().trim();
    const oid = Number(orderId);
    if (!Number.isFinite(oid) || oid <= 0 || !Number.isInteger(oid)) {
      return NextResponse.json({ error: GENERIC_SEND_ERR }, { status: 400 });
    }

    const ip = getClientIp(req);

    // Global IP ceiling first — prevents unbounded settings-row growth via fake orderIds.
    if (action === "send_otp") {
      const globalIp = await checkRateLimit(`inv_otp_global_ip:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 });
      if (!globalIp.allowed) {
        if (globalIp.dbError) {
          return NextResponse.json({ error: "Server temporarily unavailable. Please try again." }, { status: 503 });
        }
        return NextResponse.json(
          { error: "Too many OTP requests. Please try again later.", retryAfter: globalIp.retryAfter },
          { status: 429, headers: globalIp.retryAfter ? { "Retry-After": String(globalIp.retryAfter) } : {} },
        );
      }
    }

    if (action === "verify_otp") {
      if (!otp) return NextResponse.json({ error: "OTP is required" }, { status: 400 });
      const globalIp = await checkRateLimit(`otp_verify_global_ip:${ip}`, { max: 30, windowMs: 15 * 60 * 1000 });
      if (!globalIp.allowed) {
        if (globalIp.dbError) {
          return NextResponse.json({ error: "Server temporarily unavailable. Please try again." }, { status: 503 });
        }
        return NextResponse.json(
          { error: "Too many verification attempts. Please try again later.", retryAfter: globalIp.retryAfter },
          { status: 429, headers: globalIp.retryAfter ? { "Retry-After": String(globalIp.retryAfter) } : {} },
        );
      }
    }

    const order = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, oid), isNull(schema.orders.deletedAt)))
      .limit(1)
      .then((r) => r[0]);

    const orderEmail = (order?.contactEmail ?? "").toLowerCase().trim();
    const emailMatches = Boolean(order && orderEmail && normalizedEmail === orderEmail);

    if (action === "send_otp") {
      // Per-order IP limit only after confirming the order exists (no fake-id settings spam).
      if (order) {
        const ipRl = await checkRateLimit(`inv_otp_ip:${ip}:${oid}`, { max: 8, windowMs: 10 * 60 * 1000 });
        if (!ipRl.allowed) {
          if (ipRl.dbError) {
            return NextResponse.json({ error: "Server temporarily unavailable. Please try again." }, { status: 503 });
          }
          return NextResponse.json(
            { error: "Too many OTP requests. Please try again later.", retryAfter: ipRl.retryAfter },
            { status: 429, headers: ipRl.retryAfter ? { "Retry-After": String(ipRl.retryAfter) } : {} },
          );
        }
      }

      // Anti-enumeration: always { ok: true } for mismatch, lockout, and mailer issues.
      if (!emailMatches) return OK;

      const key = `otp:${oid}`;
      const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1).then((r) => r[0]);
      if (existing) {
        let data: { attempts?: number } = {};
        try { data = JSON.parse(existing.value); } catch { data = { attempts: 0 }; }
        // Same success body as mismatch — do not reveal lockout on send.
        if ((data.attempts || 0) >= MAX_ATTEMPTS) return OK;
      }

      const rl = await checkRateLimit(`inv_otp:${normalizedEmail}`, { max: 3, windowMs: 10 * 60 * 1000 });
      if (!rl.allowed) {
        if (rl.dbError) {
          return NextResponse.json({ error: "Server temporarily unavailable. Please try again." }, { status: 503 });
        }
        // Equal response for spray vs mismatch — avoid email existence oracle via 429.
        return OK;
      }

      const prevAttempts = (() => {
        if (existing) {
          try { return JSON.parse(existing.value).attempts || 0; } catch { return 0; }
        }
        return 0;
      })();

      const otpCode = String(randomInt(100000, 1000000));
      const hashed = await bcrypt.hash(otpCode, 12);
      const value = JSON.stringify({ otp: hashed, email: normalizedEmail, attempts: prevAttempts, createdAt: Date.now() });

      if (existing) {
        await db.update(schema.settings).set({ value }).where(eq(schema.settings.key, key));
      } else {
        await db.insert(schema.settings).values({ key, value });
      }

      const orderNum = formatOrderNumber(order!.id, order!.createdAt);
      const safeName = escapeHtml(order!.clientName || "");
      // Fire-and-forget so SMTP latency cannot distinguish match vs mismatch.
      void sendEmail({
        to: normalizedEmail,
        subject: `Your OTP for Invoice ${orderNum} — Parth Production`,
        html: `
          <div style="max-width:480px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
            <h2 style="color:#1e293b">Invoice Access — Parth Production</h2>
            <p>Hello <strong>${safeName}</strong>,</p>
            <p>Use the following OTP to view your invoice for order <strong>${orderNum}</strong>:</p>
            <div style="margin:20px 0;padding:16px 24px;background:#f1f5f9;border-radius:12px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:6px;color:#0f172a">${otpCode}</div>
            <p style="font-size:13px;color:#64748b">This OTP expires in 10 minutes.</p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0" />
            <p style="font-size:12px;color:#94a3b8">If you did not request this, please ignore this email.</p>
          </div>
        `,
      }).catch((err) => console.error("Invoice OTP email error:", err));

      return OK;
    }

    if (action === "verify_otp") {
      // Per-order verify bucket only for real orders.
      if (order) {
        const verifyRl = await checkRateLimit(`otp_verify:${oid}:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
        if (!verifyRl.allowed) {
          if (verifyRl.dbError) {
            return NextResponse.json({ error: "Server temporarily unavailable. Please try again." }, { status: 503 });
          }
          return NextResponse.json(
            { error: "Too many verification attempts. Please try again later.", retryAfter: verifyRl.retryAfter },
            { status: 429, headers: verifyRl.retryAfter ? { "Retry-After": String(verifyRl.retryAfter) } : {} },
          );
        }
      }

      const INVALID = NextResponse.json({ error: "Invalid OTP" }, { status: 403 });
      if (!emailMatches) return INVALID;

      const key = `otp:${oid}`;
      const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1).then((r) => r[0]);
      if (!row) return INVALID;

      let data: { otp: string; attempts: number; createdAt: number; email?: string };
      try { data = JSON.parse(row.value); } catch {
        await db.delete(schema.settings).where(eq(schema.settings.key, key));
        return INVALID;
      }
      if (!data.otp || typeof data.attempts !== "number" || typeof data.createdAt !== "number") {
        await db.delete(schema.settings).where(eq(schema.settings.key, key));
        return INVALID;
      }
      if (data.email && data.email !== normalizedEmail) return INVALID;
      if (data.attempts >= MAX_ATTEMPTS) {
        await db.delete(schema.settings).where(eq(schema.settings.key, key));
        return INVALID;
      }

      if (Date.now() - data.createdAt > OTP_EXPIRY) {
        await db.delete(schema.settings).where(eq(schema.settings.key, key));
        return INVALID;
      }

      const nextAttempts = data.attempts + 1;
      const attemptedValue = JSON.stringify({ ...data, attempts: nextAttempts });
      const cas = await db
        .update(schema.settings)
        .set({ value: attemptedValue })
        .where(and(eq(schema.settings.key, key), eq(schema.settings.value, row.value)))
        .returning({ key: schema.settings.key });
      if (!cas.length) return INVALID;

      const match = await bcrypt.compare(otp, data.otp);
      if (!match) return INVALID;

      await db.delete(schema.settings).where(eq(schema.settings.key, key));

      const token = await new SignJWT({ orderId: oid, email: orderEmail, verifiedAt: Date.now() })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("24h")
        .sign(getAuthSecretBytes());

      const res = NextResponse.json({ ok: true });
      res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
      return res;
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Invoice OTP error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const orderId = Number(url.searchParams.get("orderId"));
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ verified: false });

    const { payload } = await jwtVerify(token, getAuthSecretBytes());
    if (payload.orderId !== orderId) return NextResponse.json({ verified: false });

    return NextResponse.json({ verified: true });
  } catch {
    return NextResponse.json({ verified: false });
  }
}
