// src/lib/brand.ts — client-safe brand constants (no DB / server imports)
/** Original high-resolution logo (no crop/resize). */
export const DEFAULT_BRAND_LOGO_URL =
  "https://pub-f7e582206f9d4cf49fa1d710c6c8b5e9.r2.dev/Parth%20logo%20bg%20.png";
/** Local copy in /public for offline / fallback. */
export const LOCAL_BRAND_LOGO_URL = "/parth-logo.png";
/** Bumped when the default brand asset changes so old DB uploads are replaced. */
export const BRAND_LOGO_VERSION = "2026-08-parth-bg-hq";
