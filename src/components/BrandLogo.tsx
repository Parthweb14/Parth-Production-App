// src/components/BrandLogo.tsx
// Theme-aware brand artwork — light menu uses light logo; dark/login uses white lockup.
"use client";

import {
  BRAND_LOGO_CACHE_BUST,
  LIGHT_BRAND_LOGO_URL,
  LOCAL_BRAND_LOGO_URL,
} from "@/lib/brand";
import { useTheme } from "@/lib/theme";

type Variant = "login" | "sidebar";

const INTRINSIC = {
  dark: { width: 1921, height: 562 },
  light: { width: 1254, height: 423 },
};

const SIZE: Record<Variant, string> = {
  login: "h-auto w-[min(100%,300px)] object-contain sm:w-[340px]",
  sidebar: "h-auto w-full max-w-[200px] object-contain rounded-[6px]",
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
  const { resolved } = useTheme();
  // Login page is always dark chrome — keep the white lockup.
  // Sidebar/menu: in light mode use the light-friendly logo.
  const useLight = variant === "sidebar" && resolved === "light";
  const src = withCacheBust(useLight ? LIGHT_BRAND_LOGO_URL : resolveSrc(logoUrl));
  const intrinsic = useLight ? INTRINSIC.light : INTRINSIC.dark;

  return (
    <img
      src={src}
      alt={alt}
      width={intrinsic.width}
      height={intrinsic.height}
      decoding="async"
      fetchPriority={variant === "login" ? "high" : "auto"}
      className={SIZE[variant]}
    />
  );
}
