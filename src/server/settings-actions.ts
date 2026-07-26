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

const MAX_BYTES = 300_000;
const ALLOWED_LOGO_PREFIXES = ["data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/webp"];

export async function setLogo(dataUrl: string) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  if (!ALLOWED_LOGO_PREFIXES.some((p) => dataUrl.startsWith(p))) {
    throw new Error("Only PNG, JPEG, or WebP images are allowed.");
  }
  if (dataUrl.length > MAX_BYTES) throw new Error("Logo too large. Please use an image under ~220KB.");
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
  if (!admin) throw new Error("Unauthorized");
  // Restrict test recipient to the admin's own email (or configured smtp_from).
  const from = (await getSetting("smtp_from")) || admin.email;
  const target = (toEmail || admin.email).trim().toLowerCase();
  const allowed = new Set([admin.email.toLowerCase(), from.toLowerCase()]);
  if (!allowed.has(target)) {
    throw new Error("Test email may only be sent to your admin email or the configured From address.");
  }
  const { sendEmail } = await import("@/lib/email");
  await sendEmail({ to: target, subject: "Kadam Production — SMTP Test", html: "<p>SMTP is working correctly.</p>" });
}
