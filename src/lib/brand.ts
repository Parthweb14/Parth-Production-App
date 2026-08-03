// src/lib/brand.ts — client-safe brand constants (no DB / server imports)

/**
 * Canonical display logo: local full-quality PNG in /public (identical to the R2 master).
 * Prefer this over /api/icon (crop/resize blurs) and over old DB WebP data-URLs.
 */
export const LOCAL_BRAND_LOGO_URL = "/parth-logo.png";

/** Remote master copy (same bytes as public/parth-logo.png). Kept for reference / fallbacks. */
export const DEFAULT_BRAND_LOGO_URL =
  "https://pub-f7e582206f9d4cf49fa1d710c6c8b5e9.r2.dev/Parth%20logo%20bg%20.png";

/** Bumped when the default brand asset changes so old DB uploads are replaced. */
export const BRAND_LOGO_VERSION = "2026-08-parth-bg-hq-v2";

/** Cache-bust query for <img src> — bump when the file on disk changes. */
export const BRAND_LOGO_CACHE_BUST = "v10";
