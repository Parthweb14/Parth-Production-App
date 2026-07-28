import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getSetting } from "@/lib/settings";

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
      const height = Number.isFinite(rawH) ? Math.min(1024, Math.max(48, Math.round(rawH))) : 128;

      const trimmed = await sharp(input)
        .trim({ threshold: 12 })
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });

      const nativeH = trimmed.info.height || height;
      let pipeline = sharp(trimmed.data);
      if (height !== nativeH) {
        pipeline = pipeline.resize({
          height,
          fit: "inside",
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: false,
        });
        // Mild sharpen only when enlarging — reduces soft/blurry upscales from small sources.
        if (height > nativeH) {
          pipeline = pipeline.sharpen({ sigma: 0.7, m1: 0.9, m2: 0.45 });
        }
      }

      const png = await pipeline.png({ compressionLevel: 6, quality: 100 }).toBuffer();

      return new NextResponse(new Uint8Array(png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      });
    }

    const raw = Number(req.nextUrl.searchParams.get("size") || "32");
    const size = ALLOWED.has(raw) ? raw : 32;

    // Square favicon: P mark on dark navy so white artwork is visible in light tabs.
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
