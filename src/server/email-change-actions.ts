"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  adminApproveEmailChange,
  adminConfirmEmailChangeOtp,
  adminRejectEmailChange,
  adminStartEmailChange,
  employeeRequestEmailChange,
  resolveApprovedFormAccess,
  submitEmailChangeCredentials,
  verifyEmailChangeWithOtp,
  verifyEmailChangeWithToken,
} from "@/lib/email-change";

export type EmailChangeActionState = {
  error?: string;
  success?: string;
  otpSent?: boolean;
  requestId?: string;
};

export async function adminStartEmailChangeAction(
  _prev: EmailChangeActionState,
  formData: FormData
): Promise<EmailChangeActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { error: "Admin access required." };
  }

  const currentPassword = String(formData.get("currentPassword") || "");
  const newEmail = String(formData.get("newEmail") || "").trim();
  const result = await adminStartEmailChange({
    adminId: user.id,
    currentPassword,
    newEmail,
  });
  if (!result.ok) return { error: result.error };
  return {
    success: "OTP sent to your new email. Enter the OTP or open the link to confirm.",
    otpSent: true,
    requestId: result.requestId,
  };
}

export async function adminConfirmEmailChangeAction(
  _prev: EmailChangeActionState,
  formData: FormData
): Promise<EmailChangeActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { error: "Admin access required." };
  }

  const requestId = String(formData.get("requestId") || "");
  const otp = String(formData.get("otp") || "");
  const result = await adminConfirmEmailChangeOtp({
    adminId: user.id,
    requestId,
    otp,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/");
  revalidatePath("/change-email");
  redirect("/login?emailChanged=1");
}

export async function employeeRequestEmailChangeAction(
  _prev: EmailChangeActionState,
  formData: FormData
): Promise<EmailChangeActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "employee") {
    return { error: "Employees only. Admins change email from the admin form." };
  }

  const newEmail = String(formData.get("newEmail") || "").trim();
  const result = await employeeRequestEmailChange({
    userId: user.id,
    requestedNewEmail: newEmail || undefined,
  });
  if (!result.ok) return { error: result.error };
  return {
    success:
      "Request submitted. An admin must approve it before you can complete the change.",
  };
}

export async function approveEmailChangeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");

  const requestId = String(formData.get("requestId") || "");
  const result = await adminApproveEmailChange(user.id, requestId);
  if (!result.ok) throw new Error(result.error);
  revalidatePath("/email-change-requests");
}

export async function rejectEmailChangeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");

  const requestId = String(formData.get("requestId") || "");
  const result = await adminRejectEmailChange(user.id, requestId);
  if (!result.ok) throw new Error(result.error);
  revalidatePath("/email-change-requests");
}

export async function openEmailChangeFormWithOtpAction(
  _prev: EmailChangeActionState,
  formData: FormData
): Promise<EmailChangeActionState & { requestId?: string; currentEmail?: string; requestedNewEmail?: string | null; accessOtp?: string }> {
  const email = String(formData.get("email") || "");
  const otp = String(formData.get("otp") || "");
  const result = await resolveApprovedFormAccess({ email, otp });
  if (!result.ok) return { error: result.error };
  return {
    success: "Access granted. Complete the form below.",
    requestId: result.requestId,
    currentEmail: result.currentEmail,
    requestedNewEmail: result.requestedNewEmail,
    accessOtp: otp,
  };
}

export async function submitEmailChangeCredentialsAction(
  _prev: EmailChangeActionState,
  formData: FormData
): Promise<EmailChangeActionState> {
  const requestId = String(formData.get("requestId") || "");
  const accessToken = String(formData.get("accessToken") || "") || undefined;
  const accessOtp = String(formData.get("accessOtp") || "") || undefined;
  const currentEmail = String(formData.get("currentEmail") || "");
  const currentPassword = String(formData.get("currentPassword") || "");
  const newEmail = String(formData.get("newEmail") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword !== confirmPassword) {
    return { error: "New password and confirmation do not match." };
  }

  const result = await submitEmailChangeCredentials({
    requestId,
    accessToken,
    accessOtp,
    currentEmail,
    currentPassword,
    newEmail,
    newPassword,
  });
  if (!result.ok) return { error: result.error };

  return {
    success:
      "Credentials verified. Check your new email for a one-time link and OTP to finish. Your old email stays active until verification.",
  };
}

export async function verifyEmailChangeTokenAction(token: string) {
  return verifyEmailChangeWithToken(token);
}

export async function verifyEmailChangeOtpAction(
  _prev: EmailChangeActionState,
  formData: FormData
): Promise<EmailChangeActionState> {
  const email = String(formData.get("email") || "");
  const otp = String(formData.get("otp") || "");
  const requestId = String(formData.get("requestId") || "") || undefined;
  const result = await verifyEmailChangeWithOtp({ email, otp, requestId });
  if (!result.ok) return { error: result.error };
  redirect("/login?emailChanged=1");
}
