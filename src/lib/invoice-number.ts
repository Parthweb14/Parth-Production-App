// src/lib/invoice-number.ts
// Order number format: KP + year + 4-digit sequence (e.g. KP20260001)
// After 9999, cycles with a base-26 letter suffix: 0001A, 0002A, ... 9999A,
// 0001B, ... 9999Z, 0001AA, 0002AA, ... 9999AA, 0001AB, ... (L19: previously a
// single-letter suffix that wrapped incorrectly and produced non-letter chars
// after the 26th cycle.)
export function formatOrderNumber(orderId: number, createdAt?: Date | string | number): string {
  const date = createdAt ? new Date(createdAt) : new Date();
  const year = date.getFullYear();
  const prefix = `KP${year}`;
  const seq = orderId;
  if (seq <= 9999) {
    return `${prefix}${String(seq).padStart(4, "0")}`;
  }
  const cycle = Math.floor((seq - 1) / 9999); // 1-based: cycle 1 -> A, cycle 26 -> Z, cycle 27 -> AA
  const within = ((seq - 1) % 9999) + 1;
  return `${prefix}${String(within).padStart(4, "0")}${cycleToLetters(cycle)}`;
}

/**
 * Convert a 1-based cycle index to a base-26 (A-Z) letter suffix using the
 * bijective numeration scheme (no zero digit): 1=A, 26=Z, 27=AA, 28=AB, ...
 */
function cycleToLetters(n: number): string {
  let letters = "";
  let x = n;
  while (x > 0) {
    x -= 1;
    letters = String.fromCharCode(65 + (x % 26)) + letters;
    x = Math.floor(x / 26);
  }
  return letters;
}

// Backward-compatible alias
export function invoiceNumber(orderId: number, createdAt?: Date | string | number): string {
  return formatOrderNumber(orderId, createdAt);
}
