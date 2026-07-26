// src/components/ChangePasswordView.tsx
"use client";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Label, Card } from "@/components/ui";
import { changePasswordAction } from "@/server/auth-actions";

export function ChangePasswordView() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);
  const searchParams = useSearchParams();
  const forced = searchParams.get("force") === "1";

  return (
    <Card className="max-w-md p-5">
      {forced && (
        <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700 font-medium dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">
          Your password must be changed before continuing.
        </div>
      )}
      <form action={formAction} className="space-y-4">
        <div><Label>Current Password</Label><Input name="current" type="password" required /></div>
        <div>
          <Label>New Password</Label>
          <Input name="new" type="password" required minLength={8} />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Minimum 8 characters</p>
        </div>
        <div><Label>Confirm New Password</Label><Input name="confirm" type="password" required minLength={8} /></div>
        {state && !state.ok && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-kp-danger">{state.error}</div>}
        {state && state.ok && <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">Password changed successfully.</div>}
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Updating…" : "Update Password"}</Button>
      </form>
    </Card>
  );
}
