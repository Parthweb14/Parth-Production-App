// src/components/EmailChangeRequestsView.tsx
"use client";

import { useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { approveEmailChangeAction, rejectEmailChangeAction } from "@/server/email-change-actions";

type Row = {
  id: string;
  userId: number;
  userName: string;
  currentEmail: string;
  requestedNewEmail: string | null;
  status: string;
  createdAt: Date;
  expiresAt: Date;
};

export function EmailChangeRequestsView({ rows }: { rows: Row[] }) {
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <Card className="p-5 text-sm text-gray-600 dark:text-gray-400">
        No pending email change requests.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-semibold text-gray-900 dark:text-gray-100">{r.userName}</div>
              <div className="text-gray-600 dark:text-gray-400">
                {r.currentEmail}
                {r.requestedNewEmail ? ` → ${r.requestedNewEmail}` : " (new email chosen later)"}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Requested {new Date(r.createdAt).toLocaleString()} · expires{" "}
                {new Date(r.expiresAt).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-2">
              <form
                action={(fd) => {
                  startTransition(async () => {
                    await approveEmailChangeAction(fd);
                  });
                }}
              >
                <input type="hidden" name="requestId" value={r.id} />
                <Button type="submit" size="sm" disabled={pending}>
                  Approve
                </Button>
              </form>
              <form
                action={(fd) => {
                  startTransition(async () => {
                    await rejectEmailChangeAction(fd);
                  });
                }}
              >
                <input type="hidden" name="requestId" value={r.id} />
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  Reject
                </Button>
              </form>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
