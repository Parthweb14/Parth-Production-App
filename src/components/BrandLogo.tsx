// src/components/BrandLogo.tsx
// Original brand artwork only — no plate/rectangle, no CSS zoom, no /api/icon crop.
"use client";

import { BRAND_LOGO_CACHE_BUST, LOCAL_BRAND_LOGO_URL } from "@/lib/brand";

type Variant = "login" | "sidebar";

const SIZE: Record<Variant, { className: string; width: number; height: number }> = {
  login: {
    className: "h-56 w-auto max-w-[min(100%,480px)] object-contain sm:h-64",
    width: 2048,
    height: 2048,
  },
  sidebar: {
    className: "h-44 w-auto max-w-full object-contain",
    width: 2048,
    height: 2048,
  },
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
  const s = SIZE[variant];

  return (
    <img
      src={src}
      alt={alt}
      width={s.width}
      height={s.height}
      decoding="async"
      fetchPriority={variant === "login" ? "high" : "auto"}
      className={s.className}
    />
  );
}
