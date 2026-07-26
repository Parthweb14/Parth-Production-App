// src/app/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLogoUrl, getScanEnabled } from "@/lib/settings";
import { DashboardShell } from "@/components/DashboardShell";
import { logoutAction } from "@/server/auth-actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let logoUrl: string | null = null;
  let scanEnabled = true;
  try {
    [logoUrl, scanEnabled] = await Promise.all([getLogoUrl(), getScanEnabled()]);
  } catch {
    // DB reads must never break the shell
  }

  return (
    <DashboardShell role={user.role} name={user.name} logoUrl={logoUrl} scanEnabled={scanEnabled} logout={logoutAction}>
      {children}
    </DashboardShell>
  );
}
