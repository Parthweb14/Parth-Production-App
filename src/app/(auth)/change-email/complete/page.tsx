// src/app/(auth)/change-email/complete/page.tsx
import { Suspense } from "react";
import { resolveApprovedFormAccess } from "@/lib/email-change";
import { EmailChangeCompleteView } from "@/components/EmailChangeCompleteView";

export default async function EmailChangeCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token?.trim();

  let initialAccess: {
    requestId: string;
    currentEmail: string;
    requestedNewEmail: string | null;
    accessToken?: string;
  } | null = null;
  let initialError: string | undefined;

  if (token) {
    const res = await resolveApprovedFormAccess({ token });
    if (res.ok) {
      initialAccess = {
        requestId: res.requestId,
        currentEmail: res.currentEmail,
        requestedNewEmail: res.requestedNewEmail,
        accessToken: token,
      };
    } else {
      initialError = res.error;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black p-4">
      <div className="w-full">
        {initialError && !initialAccess && (
          <div className="mx-auto mb-4 max-w-md rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {initialError}
          </div>
        )}
        <Suspense>
          <EmailChangeCompleteView initialAccess={initialAccess} tokenFromUrl={token} />
        </Suspense>
      </div>
    </div>
  );
}
