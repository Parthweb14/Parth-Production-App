// src/lib/settings.ts
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { unstable_cache as nextCache } from "next/cache";
import { decryptSecret } from "./crypto-secret";

async function _getSetting(key: string): Promise<string | null> {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1).then((r) => r[0]);
  return row?.value ?? null;
}

export const getSetting = nextCache(_getSetting, ["settings"], { revalidate: 30 });

export async function getLogoUrl(): Promise<string | null> {
  const v = await getSetting("logo_url");
  return v && v.length > 0 ? v : null;
}

export async function getScanEnabled(): Promise<boolean> {
  const v = await getSetting("scan_enabled");
  return v !== "false";
}

export async function getGstSettings() {
  const [number, percentage] = await Promise.all([
    getSetting("gst_number"),
    getSetting("gst_percentage"),
  ]);
  return { number: number ?? "", percentage: percentage ? Number(percentage) : 0 };
}

/** Public-safe SMTP view — never returns the raw password to the client. */
export async function getSmtpSettingsPublic() {
  const [host, port, user, pass, from] = await Promise.all([
    getSetting("smtp_host"),
    getSetting("smtp_port"),
    getSetting("smtp_user"),
    getSetting("smtp_pass"),
    getSetting("smtp_from"),
  ]);
  return {
    host: host ?? "",
    port: port ?? "",
    user: user ?? "",
    passConfigured: Boolean(pass && pass.length > 0),
    from: from ?? "",
  };
}

/** Server-only: decrypted SMTP credentials for sending mail. */
export async function getSmtpCredentials() {
  const [host, port, user, pass, from] = await Promise.all([
    getSetting("smtp_host"),
    getSetting("smtp_port"),
    getSetting("smtp_user"),
    getSetting("smtp_pass"),
    getSetting("smtp_from"),
  ]);
  return {
    host: host ?? "",
    port: port ?? "",
    user: user ?? "",
    pass: decryptSecret(pass),
    from: from ?? "",
  };
}

/** @deprecated Prefer getSmtpSettingsPublic / getSmtpCredentials */
export async function getSmtpSettings() {
  return getSmtpSettingsPublic();
}
