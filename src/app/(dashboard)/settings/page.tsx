// src/app/(dashboard)/settings/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLogoUrl, getScanEnabled, getSmtpSettingsPublic, getGstSettings } from "@/lib/settings";
import { SettingsView } from "@/components/settings/SettingsView";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  let logoUrl: string | null = null;
  let scanEnabled = true;
  let smtp = { host: "", port: "", user: "", passConfigured: false, from: "" };
  let gst = { number: "", percentage: 18 };
  try {
    logoUrl = await getLogoUrl();
  } catch {
    logoUrl = null;
  }
  try {
    scanEnabled = await getScanEnabled();
  } catch {
    scanEnabled = true;
  }
  try {
    smtp = await getSmtpSettingsPublic();
  } catch {}
  try {
    gst = await getGstSettings();
  } catch {}
  return <SettingsView logoUrl={logoUrl} scanEnabled={scanEnabled} smtp={smtp} gst={gst} />;
}
