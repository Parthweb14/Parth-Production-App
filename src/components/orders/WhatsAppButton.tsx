// src/components/orders/WhatsAppButton.tsx
"use client";
import { MessageCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { formatINR } from "@/lib/utils";

export function WhatsAppButton({
  phone,
  orderNum,
  clientName,
  total,
  paid,
  due,
  invoiceUrl,
}: {
  phone: string;
  orderNum: string;
  clientName: string;
  total: number;
  paid: number;
  due: number;
  invoiceUrl?: string;
}) {
  const cleaned = phone.replace(/\D/g, "").replace(/^0+/, "");
  let num = cleaned;
  if (num.length === 10) num = "91" + num;
  const valid = num.length >= 12 && num.startsWith("91");

  const msg =
    `Hello ${clientName},\n\n` +
    `Here are your invoice details from Kadam Production:\n` +
    `Order Number: ${orderNum}\n` +
    `Total Amount: ${formatINR(total)}\n` +
    `Advance Paid: ${formatINR(paid)}\n` +
    `Balance Due: ${formatINR(due)}\n\n` +
    `View your invoice online: ${invoiceUrl ?? `https://app.kadamproduction.in`}\n\n` +
    `Thank you for choosing Kadam Production.`;

  const waUrl = valid ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}` : null;

  return (
    <Button
      variant="success"
      disabled={!waUrl}
      onClick={() => {
        if (!waUrl) return;
        window.open(waUrl, "_blank", "noopener,noreferrer");
      }}
      title={!waUrl ? "Add a 10-digit Indian mobile number to this order first" : "Send invoice via WhatsApp"}
    >
      <MessageCircle className="h-4 w-4" />
      WhatsApp
      {!waUrl && <AlertCircle className="h-3 w-3 text-yellow-300" />}
    </Button>
  );
}
