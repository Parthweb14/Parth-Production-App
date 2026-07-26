// src/components/EmailChangeCompleteView.tsx
"use client";

import { useActionState, useState } from "react";
import { Button, Input, Label, Card } from "@/components/ui";
import {
  openEmailChangeFormWithOtpAction,
  submitEmailChangeCredentialsAction,
  type EmailChangeActionState,
} from "@/server/email-change-actions";

type Access = {
  requestId: string;
  currentEmail: string;
  requestedNewEmail: string | null;
  accessToken?: string;
  accessOtp?: string;
};

export function EmailChangeCompleteView({
  initialAccess,
  tokenFromUrl,
}: {
  initialAccess: Access | null;
  tokenFromUrl?: string;
  initialError?: string;
}) {
  const [access, setAccess] = useState<Access | null>(initialAccess);
  const [otpState, otpAction, otpPending] = useActionState(
    async (prev: EmailChangeActionState, fd: FormData) => {
      const res = await openEmailChangeFormWithOtpAction(prev, fd);
      if (res.requestId && res.currentEmail) {
        setAccess({
          requestId: res.requestId,
          currentEmail: res.currentEmail,
          requestedNewEmail: res.requestedNewEmail ?? null,
          accessOtp: res.accessOtp,
        });
      }
      return res;
    },
    {} as EmailChangeActionState
  );
  const [credState, credAction, credPending] = useActionState(
    submitEmailChangeCredentialsAction,
    {} as EmailChangeActionState
  );

  if (credState.success) {
    return (
      <Card className="mx-auto max-w-md p-6">
        <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">Check your new email</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">{credState.success}</p>
      </Card>
    );
  }

  if (!access) {
    return (
      <Card className="mx-auto max-w-md p-6">
        <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">Open email change form</h1>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Use the one-time OTP from your approval email (link access is preferred when available).
        </p>
        <form action={otpAction} className="space-y-4">
          <div>
            <Label>Current account email</Label>
            <Input name="email" type="email" required />
          </div>
          <div>
            <Label>One-time OTP</Label>
            <Input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
          </div>
          {otpState.error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-kp-danger">{otpState.error}</div>
          )}
          <Button type="submit" className="w-full" disabled={otpPending}>
            {otpPending ? "Checking…" : "Continue"}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">Complete email change</h1>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Confirm your current credentials, then set the new email and password. Nothing changes until the new inbox is verified.
      </p>
      <form action={credAction} className="space-y-4">
        <input type="hidden" name="requestId" value={access.requestId} />
        {access.accessToken || tokenFromUrl ? (
          <input type="hidden" name="accessToken" value={access.accessToken || tokenFromUrl} />
        ) : null}
        {access.accessOtp ? <input type="hidden" name="accessOtp" value={access.accessOtp} /> : null}
        <div>
          <Label>Current email</Label>
          <Input name="currentEmail" type="email" defaultValue={access.currentEmail} required />
        </div>
        <div>
          <Label>Current password</Label>
          <Input name="currentPassword" type="password" required autoComplete="current-password" />
        </div>
        <div>
          <Label>New email</Label>
          <Input
            name="newEmail"
            type="email"
            defaultValue={access.requestedNewEmail || ""}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <Label>New password</Label>
          <Input name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div>
          <Label>Confirm new password</Label>
          <Input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        {credState.error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-kp-danger">{credState.error}</div>
        )}
        <Button type="submit" className="w-full" disabled={credPending}>
          {credPending ? "Submitting…" : "Continue to new-email verification"}
        </Button>
      </form>
    </Card>
  );
}
