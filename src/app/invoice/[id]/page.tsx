// src/app/invoice/[id]/page.tsx — public invoice with OTP verification
// Thin shell only: no DB lookup (anti-enumeration). Full invoice loads via
// /api/invoice-data after OTP verification.
import { notFound } from "next/navigation";
import { formatOrderNumber } from "@/lib/invoice-number";
import { InvoicePublicView } from "@/components/invoice/InvoicePublicView";

type PageProps = { params: Promise<{ id: string }> };

export default async function PublicInvoicePage({ params }: PageProps) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isInteger(orderId)) notFound();

  // Placeholder number only — real PP-year number comes from invoice-data after OTP.
  const orderNum = formatOrderNumber(orderId);

  return <InvoicePublicView orderId={orderId} orderNum={orderNum} />;
}
