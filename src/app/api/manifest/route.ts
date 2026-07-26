// src/app/api/manifest/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const manifest = {
    name: "Kadam Production",
    short_name: "KadamProd",
    description: "Professional Event Services — operations dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    orientation: "portrait-primary",
    icons: [
      { src: "/api/icon", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/api/icon", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
