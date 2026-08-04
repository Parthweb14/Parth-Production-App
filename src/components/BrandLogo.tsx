// src/components/BrandLogo.tsx
// Cropped lockup artwork — no plate, no CSS zoom, no /api/icon crop.
"use client";

import { BRAND_LOGO_CACHE_BUST, LOCAL_BRAND_LOGO_URL } from "@/lib/brand";

type Variant = "login" | "sidebar";

/** Intrinsic size of public/parth-logo.png (padding already cropped). */
const INTRINSIC = { width: 1921, height: 562 };

const SIZE: Record<Variant, string> = {
  // Width-led so the wide lockup stays tight (no empty top/bottom).
  login: "h-auto w-[min(100%,300px)] object-contain sm:w-[340px]",
  sidebar: "h-auto w-full max-w-[200px] object-contain",
};

function withCacheBust(url: string) {
  if (url.startsWith("data:")) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}${BRAND_LOGO_CACHE_BUST}`;
}

function resolveSrc(logoUrl?: string | null) {
  const raw = (logoUrl || "").trim();
  if (!raw) return LOCAL_BRAND_LOGO_URL;
  if (raw.includes("/api/icon")) return LOCAL_BRAND_LOGO_URL;
  return raw;
}

export function BrandLogo({
  logoUrl,
  variant,
  alt = "Parth Production",
}: {
  logoUrl?: string | null;
  variant: Variant;
  alt?: string;
}) {
  const src = withCacheBust(resolveSrc(logoUrl));

  return (
    <img
      src={src}
      alt={alt}
      width={INTRINSIC.width}
      height={INTRINSIC.height}
      decoding="async"
      fetchPriority={variant === "login" ? "high" : "auto"}
      className={SIZE[variant]}
    />
  );
}
