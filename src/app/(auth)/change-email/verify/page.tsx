// src/app/(auth)/change-email/verify/page.tsx
import { EmailChangeVerifyView } from "@/components/EmailChangeVerifyView";

/**
 * Verification is OTP-only. Tokens are never accepted from the URL
 * (avoids leaking secrets via Referer, browser history, and logs).
 */
export default function EmailChangeVerifyPage() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black p-4">
      <EmailChangeVerifyView />
    </div>
  );
}
