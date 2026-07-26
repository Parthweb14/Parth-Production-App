// src/app/(auth)/change-email/verify/page.tsx
import { Suspense } from "react";
import { verifyEmailChangeWithToken } from "@/lib/email-change";
import { EmailChangeVerifyView } from "@/components/EmailChangeVerifyView";

export default async function EmailChangeVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token?.trim();

  let tokenResult: { ok: true } | { ok: false; error: string } | null = null;
  if (token) {
    tokenResult = await verifyEmailChangeWithToken(token);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black p-4">
      <Suspense>
        <EmailChangeVerifyView tokenResult={tokenResult} />
      </Suspense>
    </div>
  );
}
