import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatOrderNumber } from "@/lib/invoice-number";
import { formatINR, formatDateDMY } from "@/lib/utils";
import { getGstSettings } from "@/lib/settings";
import { PrintButton } from "@/components/orders/PrintButton";
import { WhatsAppButton } from "@/components/orders/WhatsAppButton";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { id } = await params;

  const order = await db.select().from(schema.orders).where(eq(schema.orders.id, Number(id))).limit(1).then((r) => r[0]);
  if (!order) notFound();

  const txns = await db.select().from(schema.finance).where(eq(schema.finance.orderId, Number(id)));
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
    try { const g = await getGstSettings(); gstNumber = g.number; gstPercentage = g.percentage; gstAmount = Math.round(total * gstPercentage / 100); } catch {}
  }
  const grandTotal = total + gstAmount;
  const due = Math.max(0, grandTotal - paid);

  return (
    <div className="mx-auto max-w-3xl p-3 sm:p-8">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <a href={`/orders/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:underline">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Order
        </a>
        <div className="flex gap-2">
          <WhatsAppButton phone={order.contactPhone ?? ""} orderNum={orderNum} clientName={order.clientName} total={grandTotal} paid={paid} due={due} invoiceUrl={`${process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.kadamproduction.in"}/invoice/${id}`} />
          <PrintButton />
        </div>
      </div>

      <div className="print-area rounded-lg border border-gray-800 bg-white p-5 text-black sm:p-8">
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-4 border-b-2 border-black pb-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-black tracking-wide sm:text-3xl">KADAM PRODUCTION</h1>
            <p className="mt-0.5 text-xs text-gray-500">kadamproduction.in</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-2xl font-black tracking-widest sm:text-3xl">INVOICE</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Order Number</p>
            <p className="text-sm font-bold">{orderNum}</p>
          </div>
        </div>

        {/* Bill To + Details */}
        <div className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 sm:gap-6">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Bill To</p>
            <p className="font-semibold">{order.clientName}</p>
            {order.contactPhone && <p className="text-gray-700">{order.contactPhone}</p>}
            {order.contactEmail && <p className="text-gray-700">{order.contactEmail}</p>}
            <p className="mt-1 text-gray-700">{billingAddr || eventAddr || "\u2014"}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-gray-700"><span className="text-gray-500">Invoice Date:</span> {formatDateDMY(new Date().toISOString().slice(0, 10))}</p>
            {order.eventDate && <p className="text-gray-700"><span className="text-gray-500">Event Date:</span> {formatDateDMY(order.eventDate)}</p>}
            {order.eventCategory && <p className="text-gray-700"><span className="text-gray-500">Category:</span> {order.eventCategory}</p>}
          </div>
        </div>

        {/* Addresses — smart same-as logic */}
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Billing Address</p>
            <p className="text-gray-700">{billingAddr || eventAddr || "\u2014"}</p>
          </div>
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Event Address</p>
            <p className="text-gray-700">
              {sameAddress ? <span className="italic text-gray-500">Same as billing address</span> : (eventAddr || "\u2014")}
            </p>
          </div>
        </div>

        {/* Financial Table — advance & due only */}
        <table className="mt-6 w-full border border-black text-sm">
          <thead className="bg-black text-white">
            <tr><th className="p-2 text-left text-xs sm:text-sm">Description</th><th className="p-2 text-right text-xs sm:text-sm">Amount</th></tr>
          </thead>
          <tbody>
            <tr className="border-b border-black">
              <td className="p-2 text-xs sm:text-sm">Total Amount</td>
              <td className="p-2 text-right text-xs sm:text-sm">{formatINR(total)}</td>
            </tr>
            {showGst && gstPercentage > 0 && (
              <tr className="border-b border-black">
                <td className="p-2 text-xs sm:text-sm">GST ({gstPercentage}%)</td>
                <td className="p-2 text-right text-xs sm:text-sm">{formatINR(gstAmount)}</td>
              </tr>
            )}
            <tr className="border-b border-black">
              <td className="p-2 text-xs sm:text-sm">Advance Paid</td>
              <td className="p-2 text-right text-xs sm:text-sm">{formatINR(paid)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black bg-gray-100">
              <td className="p-2 text-sm font-black sm:text-base">Balance Due</td>
              <td className="p-2 text-right text-sm font-black sm:text-base">{formatINR(due)}</td>
            </tr>
          </tfoot>
        </table>

        {showGst && gstNumber && (
          <p className="mt-2 text-xs text-gray-600">GST Number: {gstNumber}</p>
        )}

        {/* Footer */}
        <div className="mt-6 border-t border-black pt-4 text-center text-xs text-gray-600">
          <p>Thank you for choosing Kadam Production.</p>
          <p className="mt-1">{new Date().getFullYear()} Kadam Production — <a href="https://kadamproduction.in" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-gray-800">kadamproduction.in</a></p>
        </div>
      </div>
    </div>
  );
}
