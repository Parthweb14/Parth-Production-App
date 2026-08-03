// src/components/BrandLogo.tsx
// Always render the original brand artwork — never /api/icon crop/resize (that blurs logos).
"use client";

import { DEFAULT_BRAND_LOGO_URL } from "@/lib/brand";

type Variant = "login" | "sidebar";

const SIZE: Record<
  Variant,
  { className: string; width: number; height: number; maxPlate: string }
> = {
  login: {
    className: "h-28 w-auto max-w-[320px] object-contain sm:h-32",
    width: 640,
    height: 640,
    maxPlate: "max-w-[340px]",
  },
  sidebar: {
    className: "h-20 w-auto max-w-full object-contain",
    width: 420,
    height: 420,
    maxPlate: "max-w-[220px]",
  },
};

function withCacheBust(url: string) {
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}v=8`;
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
  // Prefer provided URL (R2 original / admin upload). Fall back to brand default.
  const src = withCacheBust(logoUrl || DEFAULT_BRAND_LOGO_URL);
  const s = SIZE[variant];

  return (
    <div className={`logo-plate inline-flex w-full ${s.maxPlate} items-center justify-center overflow-hidden rounded-xl`}>
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
