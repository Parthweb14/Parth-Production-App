// src/app/(dashboard)/change-email/page.tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyEmailChangeRequests } from "@/lib/email-change";
import { AdminChangeEmailView, EmployeeChangeEmailView } from "@/components/ChangeEmailView";

export default async function ChangeEmailPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role === "admin") {
    return (
      <div>
        <h1 className="mb-5 text-2xl font-bold text-gray-900 dark:text-gray-100">Change Email</h1>
        <Suspense>
          <AdminChangeEmailView currentEmail={user.email} />
        </Suspense>
      </div>
    );
  }

  const recent = await listMyEmailChangeRequests(user.id);
  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-gray-900 dark:text-gray-100">Change Email</h1>
      <EmployeeChangeEmailView
        currentEmail={user.email}
        recent={recent.map((r) => ({
          id: r.id,
          status: r.status,
          requestedNewEmail: r.requestedNewEmail,
          createdAt: r.createdAt,
        }))}
      />
    </div>
  );
}
