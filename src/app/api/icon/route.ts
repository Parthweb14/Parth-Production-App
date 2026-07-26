import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export async function GET() {
  try {
    const logoUrl = await getSetting("logo_url");
    if (!logoUrl) {
      return new NextResponse(null, { status: 204 });
    }

    // Build an SVG that wraps the logo in a square icon.
    // The image fills the full canvas at its natural aspect ratio.
    // Any unused space gets the white background — no distortion, maximum size.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ffffff" rx="96"/>
  <image href="${escapeXml(logoUrl)}" xlink:href="${escapeXml(logoUrl)}" x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
