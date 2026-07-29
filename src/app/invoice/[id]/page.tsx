// src/app/invoice/[id]/page.tsx — public invoice with OTP verification
// SECURITY FIX: This page is now a thin shell. It loads ONLY the order number
// (not PII) and passes just the orderId + orderNum to the client component.
// The client component fetches the full invoice data via /api/invoice-data only
// AFTER OTP verification succeeds. This prevents PII from leaking in the RSC
// payload before OTP verification.
//
// Anti-enumeration: valid numeric IDs always render the OTP shell (no 404 vs
// shell distinction for missing/soft-deleted orders).
import { eq, and, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { formatOrderNumber } from "@/lib/invoice-number";
import { InvoicePublicView } from "@/components/invoice/InvoicePublicView";

type PageProps = { params: Promise<{ id: string }> };

export default async function PublicInvoicePage({ params }: PageProps) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isInteger(orderId)) notFound();

  // Load ONLY the minimal data needed to show the verification screen.
  // Do NOT load client name, email, phone, address, or amounts here.
  const order = await db
    .select({ id: schema.orders.id, createdAt: schema.orders.createdAt })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), isNull(schema.orders.deletedAt)))
    .limit(1)
    .then((r) => r[0]);

  const orderNum = order
    ? formatOrderNumber(order.id, order.createdAt)
    : formatOrderNumber(orderId);

  return <InvoicePublicView orderId={orderId} orderNum={orderNum} />;
}
