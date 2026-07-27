import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getSetting } from "@/lib/settings";

// Avoid build-time page-data collection requiring a live DB connection.
export const dynamic = "force-dynamic";

const ALLOWED = new Set([16, 32, 48, 64, 120, 152, 180, 192, 512]);

async function logoToBuffer(logoUrl: string): Promise<Buffer | null> {
  if (logoUrl.startsWith("data:")) {
    const comma = logoUrl.indexOf(",");
    if (comma < 0) return null;
    return Buffer.from(logoUrl.slice(comma + 1), "base64");
  }
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    const res = await fetch(logoUrl, { cache: "force-cache" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const logoUrl = await getSetting("logo_url");
    if (!logoUrl) {
      return new NextResponse(null, { status: 204 });
    }

    const input = await logoToBuffer(logoUrl);
    if (!input) {
      return new NextResponse(null, { status: 204 });
    }

    const trim = req.nextUrl.searchParams.get("trim") === "1";

    // Trim mode: strip empty/black padding so the wide brand lockup fills auth/sidebar frames.
    if (trim) {
      const rawH = Number(req.nextUrl.searchParams.get("h") || "128");
      const height = Number.isFinite(rawH) ? Math.min(256, Math.max(48, Math.round(rawH))) : 128;
      const png = await sharp(input)
        .trim({ threshold: 12 })
        .resize({ height, fit: "inside", withoutEnlargement: false })
        .png()
        .toBuffer();

      return new NextResponse(png, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      });
    }

    const raw = Number(req.nextUrl.searchParams.get("size") || "32");
    const size = ALLOWED.has(raw) ? raw : 32;

    // Square favicon/app-icon: contain + white pad.
    const png = await sharp(input)
      .resize(size, size, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();

    return new NextResponse(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
