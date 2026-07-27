// src/app/(auth)/change-email/complete/page.tsx
import { Suspense } from "react";
import { EmailChangeCompleteView } from "@/components/EmailChangeCompleteView";

/**
 * Form access is OTP-only (email + OTP). Tokens are not accepted from the URL.
 */
export default async function EmailChangeCompletePage() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black p-4">
      <div className="w-full">
        <Suspense>
          <EmailChangeCompleteView initialAccess={null} tokenFromUrl={undefined} />
        </Suspense>
      </div>
    </div>
  );
}
