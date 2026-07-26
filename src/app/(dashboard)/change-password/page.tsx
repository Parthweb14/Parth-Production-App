// src/app/(dashboard)/change-password/page.tsx
import { ChangePasswordView } from "@/components/ChangePasswordView";
import { Suspense } from "react";

export default function ChangePasswordPage() {
  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-gray-900">Change Password</h1>
      <Suspense><ChangePasswordView /></Suspense>
    </div>
  );
}
