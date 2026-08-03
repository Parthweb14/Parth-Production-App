// src/app/api/manifest/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const manifest = {
    name: "Parth Production",
    short_name: "ParthProd",
    description: "Professional Event Services — operations dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    orientation: "portrait-primary",
    icons: [
      { src: "/api/icon?size=192&v=6", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/icon?size=512&v=6", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
