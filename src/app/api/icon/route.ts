import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { DEFAULT_BRAND_LOGO_URL, LOCAL_BRAND_LOGO_URL, getLogoUrl } from "@/lib/settings";

// Avoid build-time page-data collection requiring a live DB connection.
export const dynamic = "force-dynamic";

const ALLOWED = new Set([16, 32, 48, 64, 120, 152, 180, 192, 512]);

/** Dark plate so the white Parth mark stays visible on light browser chrome. */
const FAVICON_BG = { r: 11, g: 18, b: 32, alpha: 1 };

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
  if (logoUrl.startsWith("/") && !logoUrl.startsWith("//") && !logoUrl.includes("..")) {
    try {
      const filePath = path.join(process.cwd(), "public", logoUrl.replace(/^\//, ""));
      return await readFile(filePath);
    } catch {
      return null;
    }
  }
  return null;
}

/** Trim lockup, then keep the left square mark (P icon) for favicon readability. */
async function extractBrandMark(input: Buffer): Promise<Buffer> {
  const trimmed = await sharp(input).trim({ threshold: 12 }).ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const side = Math.min(width, height);
  return sharp(trimmed.data)
    .extract({ left: 0, top: 0, width: side, height })
    .resize(side, side, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function renderFavicon(input: Buffer, size: number): Promise<Buffer> {
  const mark = await extractBrandMark(input);
  const inset = Math.max(2, Math.round(size * 0.11));
  const markSize = Math.max(8, size - inset * 2);
  const markResized = await sharp(mark)
    .resize(markSize, markSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: FAVICON_BG },
  })
    .composite([{ input: markResized, gravity: "centre" }])
    .png()
    .toBuffer();
}

export async function GET(req: NextRequest) {
  try {
    // Favicons only — display logos must use /parth-logo.png (or a custom upload), never this crop path.
    const allowed = new Set(["size", "v"]);
    for (const key of req.nextUrl.searchParams.keys()) {
      if (!allowed.has(key)) {
        return new NextResponse(null, { status: 400 });
      }
    }

    // Always build favicons from the crisp local master (ignore old blurry DB WebPs).
    let input = await logoToBuffer(LOCAL_BRAND_LOGO_URL);
    if (!input) {
      input = await logoToBuffer(DEFAULT_BRAND_LOGO_URL);
    }
    if (!input) {
      const custom = await getLogoUrl();
      if (custom && custom !== LOCAL_BRAND_LOGO_URL) {
        input = await logoToBuffer(custom);
      }
    }
    if (!input) {
      return new NextResponse(null, { status: 204 });
    }

    const raw = Number(req.nextUrl.searchParams.get("size") || "32");
    const size = ALLOWED.has(raw) ? raw : 32;

    const png = await renderFavicon(input, size);

    return new NextResponse(new Uint8Array(png), {
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
