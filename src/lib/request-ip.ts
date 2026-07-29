// src/lib/request-ip.ts — trusted client IP extraction for rate limiting
export function clientIpFromHeaders(h: Headers): string {
  const real =
    h.get("x-real-ip")?.trim() ||
    h.get("cf-connecting-ip")?.trim() ||
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const xfParts = (h.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Rightmost XFF hop is typically appended by the trusted edge proxy.
  const xfTrusted = xfParts.length ? xfParts[xfParts.length - 1] : undefined;
  const ip = real || xfTrusted || xfParts[0] || "unknown";
  return ip.slice(0, 64);
}
