// src/app/api/invoice-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { randomInt } from "crypto";
import { db, schema } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatOrderNumber } from "@/lib/invoice-number";
import { checkRateLimit } from "@/lib/rate-limiter";

const OTP_EXPIRY = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const COOKIE_NAME = "kp_inv_access";

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required.");
  return new TextEncoder().encode(s);
}

export async function POST(req: NextRequest) {
  try {
    const { action, orderId, email, otp } = await req.json();
    if (!orderId || !email) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const normalizedEmail = String(email).toLowerCase().trim();
    const order = await db.select().from(schema.orders).where(eq(schema.orders.id, Number(orderId))).limit(1).then((r) => r[0]);
    // Generic error — avoid order-existence / email-match oracles.
    if (!order) return NextResponse.json({ error: "Unable to send OTP for this request." }, { status: 400 });

    const orderEmail = (order.contactEmail ?? "").toLowerCase().trim();
    if (normalizedEmail !== orderEmail) {
      return NextResponse.json({ error: "Unable to send OTP for this request." }, { status: 400 });
    }

    if (action === "send_otp") {
      const key = `otp:${orderId}`;
      const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1).then((r) => r[0]);
      if (existing) {
        let data: { attempts?: number } = {};
        try { data = JSON.parse(existing.value); } catch { data = { attempts: 0 }; }
        if ((data.attempts || 0) >= MAX_ATTEMPTS) {
          return NextResponse.json({ error: "Too many OTP attempts. Please try again later." }, { status: 429 });
        }
      }

      // Rate-limit with normalized email key.
      const rl = await checkRateLimit(`inv_otp:${normalizedEmail}`, { max: 3, windowMs: 10 * 60 * 1000 });
      if (!rl.allowed) {
        if (rl.dbError) {
          return NextResponse.json({ error: "Server temporarily unavailable. Please try again." }, { status: 503 });
        }
        return NextResponse.json(
          { error: "Too many OTP requests. Please try again later.", retryAfter: rl.retryAfter },
          { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} },
        );
      }

      // SECURITY FIX: do NOT reset attempts on resend. Preserve the existing
      // attempt count so the lockout cannot be defeated by simply requesting a
      // new OTP. Only generate a new OTP code + reset the creation time.
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

      const orderNum = formatOrderNumber(order.id, order.createdAt);
      const safeName = String(order.clientName || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      await sendEmail({
        to: normalizedEmail,
        subject: `Your OTP for Invoice ${orderNum} — Kadam Production`,
        html: `
          <div style="max-width:480px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
            <h2 style="color:#1e293b">Invoice Access — Kadam Production</h2>
            <p>Hello <strong>${safeName}</strong>,</p>
            <p>Use the following OTP to view your invoice for order <strong>${orderNum}</strong>:</p>
            <div style="margin:20px 0;padding:16px 24px;background:#f1f5f9;border-radius:12px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:6px;color:#0f172a">${otpCode}</div>
            <p style="font-size:13px;color:#64748b">This OTP expires in 10 minutes.</p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0" />
            <p style="font-size:12px;color:#94a3b8">If you did not request this, please ignore this email.</p>
          </div>
        `,
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "verify_otp") {
      if (!otp) return NextResponse.json({ error: "OTP is required" }, { status: 400 });

      const verifyRl = await checkRateLimit(`otp_verify:${orderId}`, { max: 5, windowMs: 15 * 60 * 1000 });
      if (!verifyRl.allowed) {
        if (verifyRl.dbError) {
          return NextResponse.json({ error: "Server temporarily unavailable. Please try again." }, { status: 503 });
        }
        return NextResponse.json(
          { error: "Too many verification attempts. Please try again later.", retryAfter: verifyRl.retryAfter },
          { status: 429, headers: verifyRl.retryAfter ? { "Retry-After": String(verifyRl.retryAfter) } : {} },
        );
      }

      const key = `otp:${orderId}`;
      const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1).then((r) => r[0]);
      if (!row) return NextResponse.json({ error: "No OTP was sent. Request a new one." }, { status: 400 });

      let data: { otp: string; attempts: number; createdAt: number };
      try { data = JSON.parse(row.value); } catch {
        await db.delete(schema.settings).where(eq(schema.settings.key, key));
        return NextResponse.json({ error: "OTP record corrupted. Please request a new one." }, { status: 400 });
      }
      if (!data.otp || typeof data.attempts !== "number" || typeof data.createdAt !== "number") {
        await db.delete(schema.settings).where(eq(schema.settings.key, key));
        return NextResponse.json({ error: "OTP record invalid. Please request a new one." }, { status: 400 });
      }
      if (data.attempts >= MAX_ATTEMPTS) {
        await db.delete(schema.settings).where(eq(schema.settings.key, key));
        return NextResponse.json({ error: "Too many failed attempts. Request a new OTP." }, { status: 429 });
      }

      if (Date.now() - data.createdAt > OTP_EXPIRY) {
        await db.delete(schema.settings).where(eq(schema.settings.key, key));
        return NextResponse.json({ error: "OTP has expired. Request a new one." }, { status: 410 });
      }

      const match = await bcrypt.compare(otp, data.otp);
      if (!match) {
        data.attempts += 1;
        await db.update(schema.settings).set({ value: JSON.stringify(data) }).where(eq(schema.settings.key, key));
        return NextResponse.json({ error: "Invalid OTP" }, { status: 403 });
      }

      await db.delete(schema.settings).where(eq(schema.settings.key, key));

      const token = await new SignJWT({ orderId: Number(orderId), email: orderEmail, verifiedAt: Date.now() })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("24h")
        .sign(getSecret());

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

    const { payload } = await jwtVerify(token, getSecret());
    if (payload.orderId !== orderId) return NextResponse.json({ verified: false });

    return NextResponse.json({ verified: true, email: payload.email });
  } catch {
    return NextResponse.json({ verified: false });
  }
}
