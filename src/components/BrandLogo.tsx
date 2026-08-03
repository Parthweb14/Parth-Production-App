// src/components/BrandLogo.tsx
// Always render the original brand artwork — never /api/icon crop/resize (that blurs logos).
"use client";

import { BRAND_LOGO_CACHE_BUST, LOCAL_BRAND_LOGO_URL } from "@/lib/brand";

type Variant = "login" | "sidebar";

const SIZE: Record<
  Variant,
  {
    className: string;
    width: number;
    height: number;
    maxPlate: string;
    /** Mild CSS zoom into the mark (source is 2048px — stays sharp on retina). */
    zoom: number;
  }
> = {
  login: {
    className: "h-36 w-auto max-w-[min(100%,420px)] object-contain sm:h-40",
    width: 2048,
    height: 2048,
    maxPlate: "max-w-[420px]",
    zoom: 1.22,
  },
  sidebar: {
    className: "h-24 w-auto max-w-full object-contain",
    width: 2048,
    height: 2048,
    maxPlate: "max-w-[240px]",
    zoom: 1.18,
  },
};

function withCacheBust(url: string) {
  // Don't append to data: URLs (custom admin uploads).
  if (url.startsWith("data:")) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}${BRAND_LOGO_CACHE_BUST}`;
}

/** Prefer local HQ PNG; ignore empty / broken values. */
function resolveSrc(logoUrl?: string | null) {
  const raw = (logoUrl || "").trim();
  if (!raw) return LOCAL_BRAND_LOGO_URL;
  // Old auto-cropped icon pipeline — never use for brand display.
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
    <div
      className={`logo-plate inline-flex w-full ${s.maxPlate} items-center justify-center overflow-hidden rounded-xl p-1.5 sm:p-2`}
    >
      {/* Full 2048 PNG + CSS zoom only — no Sharp/WebP recompress. */}
      <img
        src={src}
        alt={alt}
        width={s.width}
        height={s.height}
        decoding="async"
        fetchPriority={variant === "login" ? "high" : "auto"}
        className={s.className}
        style={{
          imageRendering: "auto",
          transform: `scale(${s.zoom})`,
          transformOrigin: "center center",
        }}
      />
    </div>
  );
}
