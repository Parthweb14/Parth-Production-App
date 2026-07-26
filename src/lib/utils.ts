// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "₹0";
  // FIX: preserve up to 2 decimal places (paise) instead of always rounding
  // to whole rupees. Uses en-IN digit grouping.
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount);
}

export function formatDateDMY(value?: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export function todayISO(): string {
  // FIX: use local date components instead of UTC toISOString(), which is wrong
  // by one day in IST (UTC+5:30) after 18:30 local time.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
