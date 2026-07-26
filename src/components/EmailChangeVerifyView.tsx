// src/components/EmailChangeVerifyView.tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Input, Label, Card } from "@/components/ui";
import {
  verifyEmailChangeOtpAction,
  type EmailChangeActionState,
} from "@/server/email-change-actions";

export function EmailChangeVerifyView({
  tokenResult,
}: {
  tokenResult?: { ok: true } | { ok: false; error: string } | null;
}) {
  const [state, formAction, pending] = useActionState(
    verifyEmailChangeOtpAction,
    {} as EmailChangeActionState
  );

  if (tokenResult?.ok) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">Email verified</h1>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Your account email and password have been updated. Sign in with the new credentials.
        </p>
        <Link href="/login?emailChanged=1" className="text-sm font-semibold text-[var(--accent)] underline">
          Go to login
        </Link>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">Verify new email</h1>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Enter the one-time OTP from your new inbox. Codes expire in 1 hour and work only once.
      </p>
      {tokenResult && !tokenResult.ok && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-kp-danger">{tokenResult.error}</div>
      )}
      <form action={formAction} className="space-y-4">
        <div>
          <Label>New email address</Label>
          <Input name="email" type="email" required />
        </div>
        <div>
          <Label>OTP</Label>
          <Input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
        </div>
        {state.error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-kp-danger">{state.error}</div>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Verifying…" : "Verify and finish"}
        </Button>
      </form>
    </Card>
  );
}
