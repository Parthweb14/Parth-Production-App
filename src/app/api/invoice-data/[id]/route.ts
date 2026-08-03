// src/app/api/invoice-data/[id]/route.ts
// SECURITY: Returns invoice PII ONLY when the client holds a valid kp_inv_access
// JWT cookie for this specific order (set by /api/invoice-otp after OTP verification).
import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { jwtVerify } from "jose";
import { db, schema } from "@/lib/db";
import { formatOrderNumber } from "@/lib/invoice-number";
import { getGstSettings } from "@/lib/settings";
import { getAuthSecretBytes } from "@/lib/auth-secret";

const COOKIE_NAME = "kp_inv_access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) return NextResponse.json({ error: "Invalid order" }, { status: 400 });

    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Not verified" }, { status: 403 });

    let payloadEmail = "";
    try {
      const { payload } = await jwtVerify(token, getAuthSecretBytes());
      if (payload.orderId !== orderId) {
        return NextResponse.json({ error: "Not verified for this order" }, { status: 403 });
      }
      payloadEmail = String(payload.email || "")
        .toLowerCase()
        .trim();
    } catch {
      return NextResponse.json({ error: "Invalid or expired access" }, { status: 403 });
    }

    const order = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), isNull(schema.orders.deletedAt)))
      .limit(1)
      .then((r) => r[0]);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Bind JWT to current contact email so old recipients lose access after email changes.
    const currentEmail = (order.contactEmail ?? "").toLowerCase().trim();
    if (!payloadEmail || !currentEmail || payloadEmail !== currentEmail) {
      return NextResponse.json({ error: "Not verified for this order" }, { status: 403 });
    }

    const txns = await db
      .select({ type: schema.finance.type, amount: schema.finance.amount })
      .from(schema.finance)
      .where(and(eq(schema.finance.orderId, orderId), isNull(schema.finance.deletedAt)));
    const paid = txns.filter((t) => t.type === "income").reduce((a, t) => a + Number(t.amount), 0);
    const total = Number(order.totalBudget);

    const orderNum = formatOrderNumber(order.id, order.createdAt);
    const billingAddr = (order.billingAddress ?? "").trim();
    const eventAddr = (order.address ?? "").trim();
    const sameAddress = !billingAddr || !eventAddr || billingAddr.toLowerCase() === eventAddr.toLowerCase();
    const showGst = !!order.gstEnabled;

    let gstNumber = "";
    let gstPercentage = 0;
    let gstAmount = 0;
    if (showGst) {
      try {
        const g = await getGstSettings();
        gstNumber = g.number;
        gstPercentage = Number(g.percentage) || 0;
        if (gstPercentage > 0) gstAmount = Math.round((total * gstPercentage) / 100);
      } catch (err) {
        console.error("[invoice-data] GST settings error:", err);
      }
    }
    const grandTotal = total + gstAmount;
    const due = Math.max(0, grandTotal - paid);

    return NextResponse.json({
      ok: true,
      invoice: {
        order: {
          id: order.id,
          clientName: order.clientName,
          contactEmail: order.contactEmail,
          contactPhone: order.contactPhone,
          contactPerson: order.contactPerson,
          eventDate: order.eventDate,
          eventCategory: order.eventCategory,
          address: order.address,
          billingAddress: order.billingAddress,
          totalBudget: order.totalBudget,
          gstEnabled: order.gstEnabled,
          createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
        },
        orderNum,
        paid,
        grandTotal,
        gstNumber,
        gstPercentage,
        gstAmount,
        total,
        due,
        sameAddress,
        billingAddr,
        eventAddr,
      },
    });
  } catch (err) {
    console.error("Invoice data error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
