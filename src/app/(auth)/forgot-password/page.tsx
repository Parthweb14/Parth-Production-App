import { getLogoUrl } from "@/lib/settings";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  let logoUrl: string | null = null;
  try {
    logoUrl = await getLogoUrl();
  } catch {
    logoUrl = null;
  }
  return <ForgotPasswordForm logoUrl={logoUrl} />;
}