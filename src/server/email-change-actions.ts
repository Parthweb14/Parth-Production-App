"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMutableUser } from "@/lib/auth";
import {
  adminApproveEmailChange,
  adminConfirmEmailChangeOtp,
  adminRejectEmailChange,
  adminStartEmailChange,
  employeeRequestEmailChange,
  resolveApprovedFormAccess,
  submitEmailChangeCredentials,
  verifyEmailChangeWithOtp,
} from "@/lib/email-change";

export type EmailChangeActionState = {
  error?: string;
  success?: string;
  otpSent?: boolean;
  requestId?: string;
  captchaRequired?: boolean;
  captcha?: { id: string; question: string };
};

export async function adminStartEmailChangeAction(
  _prev: EmailChangeActionState,
  formData: FormData
): Promise<EmailChangeActionState> {
  const user = await getMutableUser();
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
  if (!result.ok) {
    return {
      error: result.error,
      captchaRequired: result.captchaRequired,
      captcha: result.captcha,
    };
  }
  // Identical success copy whether the address was free or taken (anti-enumeration).
  return {
    success: result.message,
    otpSent: true,
    requestId: result.requestId,
  };
}

export async function adminConfirmEmailChangeAction(
  _prev: EmailChangeActionState,
  formData: FormData
): Promise<EmailChangeActionState> {
  const user = await getMutableUser();
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
  const user = await getMutableUser();
  if (!user || user.role !== "employee") {
    return { error: "Employees only. Admins change email from the admin form." };
  }

  const newEmail = String(formData.get("newEmail") || "").trim();
  const result = await employeeRequestEmailChange({
    userId: user.id,
    requestedNewEmail: newEmail || undefined,
  });
  if (!result.ok) return { error: result.error };
  return { success: result.message };
}

export async function approveEmailChangeAction(formData: FormData) {
  const user = await getMutableUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");

  const requestId = String(formData.get("requestId") || "");
  const result = await adminApproveEmailChange(user.id, requestId);
  if (!result.ok) throw new Error(result.error);
  revalidatePath("/email-change-requests");
}

export async function rejectEmailChangeAction(formData: FormData) {
  const user = await getMutableUser();
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

export async function verifyEmailChangeOtpAction(
  _prev: EmailChangeActionState,
  formData: FormData
): Promise<EmailChangeActionState> {
  const email = String(formData.get("email") || "");
  const otp = String(formData.get("otp") || "");
  const requestId = String(formData.get("requestId") || "") || undefined;
  const result = await verifyEmailChangeWithOtp({ email, otp, requestId });
  if (!result.ok) {
    return {
      error: result.error,
      captchaRequired: "captchaRequired" in result ? Boolean(result.captchaRequired) : undefined,
      captcha:
        "captcha" in result && result.captcha
          ? (result.captcha as { id: string; question: string })
          : undefined,
    };
  }
  redirect("/login?emailChanged=1");
}
