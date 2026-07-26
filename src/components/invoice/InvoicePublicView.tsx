// src/components/invoice/InvoicePublicView.tsx
"use client";
import { useState, useEffect } from "react";
import { formatINR, formatDateDMY } from "@/lib/utils";

type OrderData = {
  id: number;
  clientName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPerson: string | null;
  eventDate: string | null;
  eventCategory: string | null;
  address: string | null;
  billingAddress: string | null;
  totalBudget: number;
  gstEnabled: boolean | null;
  createdAt: string;
};
type InvoiceData = {
  order: OrderData;
  orderNum: string;
  paid: number;
  grandTotal: number;
  gstNumber: string;
  gstPercentage: number;
  gstAmount: number;
  total: number;
  due: number;
  sameAddress: boolean;
  billingAddr: string;
  eventAddr: string;
};

export function InvoicePublicView({ orderId, orderNum }: { orderId: number; orderNum: string }) {
  const [step, setStep] = useState<"checking" | "verify" | "otp" | "view" | "loading_invoice">("checking");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);

  // Check if already verified (valid cookie)
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    fetch(`/api/invoice-otp?orderId=${orderId}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => setStep(data.verified ? "loading_invoice" : "verify"))
      .catch(() => setStep("verify"))
      .finally(() => clearTimeout(t));
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [orderId]);

  // Load invoice data when verified
  useEffect(() => {
    if (step !== "loading_invoice") return;
    const ctrl = new AbortController();
    fetch(`/api/invoice-data/${orderId}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.invoice) {
          setInvoice(data.invoice as InvoiceData);
          setStep("view");
        } else {
          // Access denied (cookie invalid/expired) — go back to verify
          setStep("verify");
        }
      })
      .catch(() => setStep("verify"));
    return () => ctrl.abort();
  }, [step, orderId]);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const r = await fetch("/api/invoice-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_otp", orderId, email: email.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error); setPending(false); return; }
      setStep("otp");
    } catch { setError("Network error. Try again."); }
    setPending(false);
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const r = await fetch("/api/invoice-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_otp", orderId, email: email.trim(), otp: otp.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error); setPending(false); return; }
      setStep("loading_invoice");
    } catch { setError("Network error. Try again."); }
    setPending(false);
  }

  async function resendOtp() {
    setError("");
    setPending(true);
    try {
      const r = await fetch("/api/invoice-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_otp", orderId, email: email.trim() }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error);
      else setError("");
    } catch { setError("Network error."); }
    setPending(false);
  }

  if (step === "checking" || step === "loading_invoice") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-800 border-t-transparent dark:border-gray-300 dark:border-t-transparent" />
      </div>
    );
  }

  if (step === "verify" || step === "otp") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-gray-900 dark:to-gray-950">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white/70 p-8 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Kadam Production</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Invoice Access — {orderNum}</p>
          </div>

          {step === "verify" && (
            <form onSubmit={sendOtp} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Enter your email to receive a one-time passcode.</p>
              <input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 w-full rounded-lg border border-gray-200 bg-white/70 px-3 text-sm text-gray-900 outline-none backdrop-blur-lg transition focus:border-gray-800 dark:border-white/10 dark:bg-white/10 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-white/30"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={pending} className="h-11 w-full rounded-lg bg-gray-900 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white/15 dark:text-gray-100 dark:hover:bg-white/20">
                {pending ? "Sending…" : "Send OTP"}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Enter the 6-digit code sent to <strong className="text-gray-900 dark:text-gray-100">{email}</strong></p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                className="h-11 w-full rounded-lg border border-gray-200 bg-white/70 px-3 text-center text-lg font-bold tracking-[8px] text-gray-900 outline-none backdrop-blur-lg transition placeholder:text-gray-300 focus:border-gray-800 dark:border-white/10 dark:bg-white/10 dark:text-gray-100 dark:placeholder-gray-600 dark:focus:border-white/30"
              />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button type="submit" disabled={pending || otp.length !== 6} className="h-11 w-full rounded-lg bg-gray-900 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white/15 dark:text-gray-100 dark:hover:bg-white/20">
                {pending ? "Verifying…" : "View Invoice"}
              </button>
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => setStep("verify")} className="text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  Use a different email
                </button>
                <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
                <button type="button" disabled={pending} onClick={resendOtp} className="text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50">
                  Resend OTP
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // step === "view" — render the invoice from fetched data
  if (!invoice) return null;
  const { order, paid, gstNumber, gstPercentage, gstAmount, total, due, sameAddress, billingAddr, eventAddr } = invoice;

  return (
    <div className="mx-auto max-w-3xl p-3 sm:p-8">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">Invoice — {orderNum}</p>
        <button onClick={() => window.print()} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
          Print / Download PDF
        </button>
      </div>

      <div className="print-area rounded-lg border border-gray-800 bg-white p-5 text-black sm:p-8">
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

        <table className="mt-6 w-full border border-black text-sm">
          <thead className="bg-black text-white">
            <tr><th className="p-2 text-left text-xs sm:text-sm">Description</th><th className="p-2 text-right text-xs sm:text-sm">Amount</th></tr>
          </thead>
          <tbody>
            <tr className="border-b border-black">
              <td className="p-2 text-xs sm:text-sm">Total Amount</td>
              <td className="p-2 text-right text-xs sm:text-sm">{formatINR(total)}</td>
            </tr>
            {gstPercentage > 0 && (
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

        {gstNumber && <p className="mt-2 text-xs text-gray-600">GST Number: {gstNumber}</p>}

        <div className="mt-6 border-t border-black pt-4 text-center text-xs text-gray-600">
          <p>Thank you for choosing Kadam Production.</p>
          <p className="mt-1">&copy; {new Date().getFullYear()} Kadam Production — kadamproduction.in</p>
        </div>
      </div>
    </div>
  );
}
