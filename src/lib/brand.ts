// src/lib/brand.ts — client-safe brand constants (no DB / server imports)

/** Canonical display logo: local full-quality PNG in /public (dark / transparent lockup). */
export const LOCAL_BRAND_LOGO_URL = "/parth-logo.png";

/** Light-mode menu logo (readable on light sidebar backgrounds). */
export const LIGHT_BRAND_LOGO_URL = "/parth-logo-light.png";

/** Remote master copy of the dark lockup. Kept for reference / fallbacks. */
export const DEFAULT_BRAND_LOGO_URL =
  "https://pub-f7e582206f9d4cf49fa1d710c6c8b5e9.r2.dev/Parth%20logo%20bg%20.png";

/** Bumped when the default brand asset changes so old DB uploads are replaced. */
export const BRAND_LOGO_VERSION = "2026-08-parth-lockup-crop-v1";

/** Cache-bust query for <img src> — bump when the file on disk changes. */
export const BRAND_LOGO_CACHE_BUST = "v15";
