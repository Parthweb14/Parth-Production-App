// src/app/(dashboard)/email-change-requests/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPendingEmailChangeRequests } from "@/lib/email-change";
import { EmailChangeRequestsView } from "@/components/EmailChangeRequestsView";

export default async function EmailChangeRequestsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");

  const rows = await listPendingEmailChangeRequests();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Email Change Requests</h1>
      <p className="mb-5 text-sm text-gray-600 dark:text-gray-400">
        Approve employee requests to send them a one-time form link and OTP.
      </p>
      <EmailChangeRequestsView
        rows={rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: r.userName,
          currentEmail: r.currentEmail,
          requestedNewEmail: r.requestedNewEmail,
          status: r.status,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
        }))}
      />
    </div>
  );
}
