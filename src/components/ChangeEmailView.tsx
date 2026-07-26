// src/components/ChangeEmailView.tsx
"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Label, Card } from "@/components/ui";
import {
  adminConfirmEmailChangeAction,
  adminStartEmailChangeAction,
  employeeRequestEmailChangeAction,
  type EmailChangeActionState,
} from "@/server/email-change-actions";

export function AdminChangeEmailView({ currentEmail }: { currentEmail: string }) {
  const searchParams = useSearchParams();
  const changed = searchParams.get("changed") === "1";
  const [startState, startAction, startPending] = useActionState(
    adminStartEmailChangeAction,
    {} as EmailChangeActionState
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    adminConfirmEmailChangeAction,
    {} as EmailChangeActionState
  );

  const requestId = startState.requestId;
  const otpSent = Boolean(startState.otpSent && requestId);

  return (
    <div className="max-w-lg space-y-5">
      {changed && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Email updated. Sign in again with your new address if prompted.
        </div>
      )}

      <Card className="p-5">
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Current email: <span className="font-semibold text-gray-900 dark:text-gray-100">{currentEmail}</span>
        </p>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          You must be logged in. We send a one-time OTP and link to the new inbox (1 hour, single-use). Your email only changes after verification.
        </p>
        <form action={startAction} className="space-y-4">
          <div>
            <Label>Current password</Label>
            <Input name="currentPassword" type="password" required autoComplete="current-password" />
          </div>
          <div>
            <Label>New email</Label>
            <Input name="newEmail" type="email" required autoComplete="email" />
          </div>
          {startState.error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-kp-danger">{startState.error}</div>
          )}
          {startState.success && (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {startState.success}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={startPending}>
            {startPending ? "Sending…" : "Send verification OTP"}
          </Button>
        </form>
      </Card>

      {otpSent && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">Enter OTP</h2>
          <form action={confirmAction} className="space-y-4">
            <input type="hidden" name="requestId" value={requestId} />
            <div>
              <Label>OTP from new email</Label>
              <Input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="6-digit code" />
            </div>
            {confirmState.error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-kp-danger">{confirmState.error}</div>
            )}
            <Button type="submit" className="w-full" disabled={confirmPending}>
              {confirmPending ? "Verifying…" : "Confirm email change"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

export function EmployeeChangeEmailView({
  currentEmail,
  recent,
}: {
  currentEmail: string;
  recent: { id: string; status: string; requestedNewEmail: string | null; createdAt: Date }[];
}) {
  const [state, formAction, pending] = useActionState(
    employeeRequestEmailChangeAction,
    {} as EmailChangeActionState
  );

  return (
    <div className="max-w-lg space-y-5">
      <Card className="p-5">
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Current email: <span className="font-semibold text-gray-900 dark:text-gray-100">{currentEmail}</span>
        </p>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          You cannot change email directly. Submit a request; after an admin approves, you will receive a one-time email to complete the change (current password + new email/password, then new-inbox verification).
        </p>
        <form action={formAction} className="space-y-4">
          <div>
            <Label>Requested new email (optional)</Label>
            <Input name="newEmail" type="email" placeholder="new@example.com" />
          </div>
          {state.error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-kp-danger">{state.error}</div>
          )}
          {state.success && (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {state.success}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Submitting…" : "Request email change"}
          </Button>
        </form>
      </Card>

      {recent.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Recent requests</h2>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            {recent.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 border-b border-gray-100 pb-2 dark:border-gray-800">
                <span>{r.requestedNewEmail || "—"}</span>
                <span className="font-medium capitalize text-gray-900 dark:text-gray-200">{r.status.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
