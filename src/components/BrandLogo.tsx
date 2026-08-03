// src/components/BrandLogo.tsx
// Always render the original brand artwork — never /api/icon crop/resize (that blurs logos).
"use client";

import { BRAND_LOGO_CACHE_BUST, LOCAL_BRAND_LOGO_URL } from "@/lib/brand";

type Variant = "login" | "sidebar";

const SIZE: Record<
  Variant,
  { className: string; width: number; height: number; maxPlate: string }
> = {
  // Display ~7–8rem tall; intrinsic attrs stay high so retina screens stay sharp.
  login: {
    className: "h-28 w-auto max-w-[min(100%,360px)] object-contain sm:h-32",
    width: 1024,
    height: 1024,
    maxPlate: "max-w-[380px]",
  },
  sidebar: {
    className: "h-20 w-auto max-w-full object-contain",
    width: 640,
    height: 640,
    maxPlate: "max-w-[220px]",
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
      className={`logo-plate inline-flex w-full ${s.maxPlate} items-center justify-center rounded-xl p-2 sm:p-3`}
    >
      {/* Native <img> of the full PNG — no Next Image resize, no Sharp crop. */}
      <img
        src={src}
        alt={alt}
        width={s.width}
        height={s.height}
        decoding="async"
        fetchPriority={variant === "login" ? "high" : "auto"}
        className={s.className}
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}
