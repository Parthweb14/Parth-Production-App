// src/server/settings-actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto-secret";
import { getSetting } from "@/lib/settings";

async function upsertSetting(key: string, value: string) {
  await db
    .insert(schema.settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

const MAX_BYTES = 1_200_000;
const ALLOWED_LOGO_PREFIXES = ["data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/webp"];

export async function setLogo(dataUrl: string) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  if (!ALLOWED_LOGO_PREFIXES.some((p) => dataUrl.startsWith(p))) {
    throw new Error("Only PNG, JPEG, or WebP images are allowed.");
  }
  if (dataUrl.length > MAX_BYTES) throw new Error("Logo too large. Please use an image under ~900KB.");
  await upsertSetting("logo_url", dataUrl);
  revalidatePath("/", "layout");
}

export async function removeLogo() {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  await db.delete(schema.settings).where(eq(schema.settings.key, "logo_url"));
  revalidatePath("/", "layout");
}

export async function setScanEnabled(enabled: boolean) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  await upsertSetting("scan_enabled", enabled ? "true" : "false");
  revalidatePath("/", "layout");
}

export async function saveSmtpSettings(input: {
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
}) {
  const admin = await requireAdmin();
  if (!admin) throw new Error("Unauthorized");
  await upsertSetting("smtp_host", input.host.trim());
  await upsertSetting("smtp_port", input.port.trim());
  await upsertSetting("smtp_user", input.user.trim());
  await upsertSetting("smtp_from", input.from.trim());
  // Empty password means "keep existing" — never overwrite with blank.
  if (input.pass && input.pass.trim() && input.pass !== "********") {
    await upsertSetting("smtp_pass", encryptSecret(input.pass));
  }
  revalidatePath("/settings");
}

export async function saveGstSettings(input: { number: string; percentage: number }) {
  const admin = await requireAdmin();
  if (!admin) throw new Error("Unauthorized");
  await upsertSetting("gst_number", input.number.trim());
  await upsertSetting("gst_percentage", String(input.percentage));
  revalidatePath("/settings");
}

export async function testSmtpSettings(toEmail?: string) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "Unauthorized" };

  const target = (toEmail || admin.email).trim().toLowerCase();
  if (!target) return { ok: false as const, error: "Enter a recipient email address." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    return { ok: false as const, error: "Enter a valid recipient email address." };
  }

  try {
    const { sendEmail } = await import("@/lib/email");
    await sendEmail({
      to: target,
      subject: "Parth Production — SMTP Test",
      html: "<p>SMTP is working correctly.</p>",
    });
    return { ok: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send test email.";
    if (message.includes("SMTP not configured")) {
      return { ok: false as const, error: "Fill in SMTP host, port, username, password, and From email first." };
    }
    if (message.toLowerCase().includes("authentication")) {
      return { ok: false as const, error: "SMTP login failed. Recheck username and password/app password." };
    }
    return { ok: false as const, error: message || "Could not send test email. Please recheck your SMTP details." };
  }
}
