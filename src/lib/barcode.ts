// src/lib/barcode.ts
// Matches PHP format: "PP" . time() . rand(100,999)
export function generateBarcode(): string {
  const rand = Math.floor(Math.random() * 900) + 100; // 100..999
  return `PP${Math.floor(Date.now() / 1000)}${rand}`;
}
