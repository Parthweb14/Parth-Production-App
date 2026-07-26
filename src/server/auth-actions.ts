// src/server/auth-actions.ts
"use server";
import { redirect } from "next/navigation";
import {
  login,
  logout,
  getCurrentUser,
  changePassword,
  sendForgotOtp,
  verifyForgotOtp,
  resetPasswordWithToken,
  verifyEmailOwnership,
} from "@/lib/auth";
import { createAuthCaptcha } from "@/lib/auth-security";

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function loginAction(
  _prev: {
    error?: string;
    ok?: boolean;
    mustChangePwd?: boolean;
    captchaRequired?: boolean;
    captcha?: { id: string; question: string };
  } | null,
  formData: FormData
) {
  try {
    const email = String(formData.get("email") || "").toLowerCase().trim();
    const password = String(formData.get("password") || "");
    const captchaId = String(formData.get("captchaId") || "");
    const captchaAnswer = String(formData.get("captchaAnswer") || "");
    const res = await login(email, password, { id: captchaId, answer: captchaAnswer });
    if (!res.ok) {
      return {
        error: res.error,
        captchaRequired: res.captchaRequired,
        captcha: res.captcha,
      };
    }
    return { ok: true, mustChangePwd: res.mustChangePwd ?? false };
  } catch (err) {
    console.error("[auth-actions] loginAction unexpected error");
    return { error: "Server error (action). Please try again." };
  }
}

export async function changePasswordAction(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Session expired. Please log in again." };
  const current = String(formData.get("current") || "");
  const next = String(formData.get("new") || "");
  const confirmPw = String(formData.get("confirm") || "");
  if (next.length < 8) return { ok: false, error: "New password must be at least 8 characters." };
  if (next !== confirmPw) return { ok: false, error: "Passwords do not match." };
  if (current === next) return { ok: false, error: "New password must be different from your current password." };
  const res = await changePassword(user.id, current, next);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function forgotPasswordAction(
  _prev: {
    ok?: boolean;
    error?: string;
    step?: string;
    email?: string;
    message?: string;
    captchaRequired?: boolean;
    captcha?: { id: string; question: string };
  } | null,
  formData: FormData
) {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  if (!email) return { error: "Email is required." };
  const captchaId = String(formData.get("captchaId") || "");
  const captchaAnswer = String(formData.get("captchaAnswer") || "");
  const res = await sendForgotOtp(email, { id: captchaId, answer: captchaAnswer });
  if (!res.ok) {
    return { error: res.error, captchaRequired: res.captchaRequired, captcha: res.captcha };
  }
  // Always advance with identical messaging whether or not the inbox exists.
  return { ok: true, step: "otp", email, message: res.message };
}

export async function verifyOtpAction(
  _prev: {
    ok?: boolean;
    error?: string;
    step?: string;
    token?: string;
    captchaRequired?: boolean;
    captcha?: { id: string; question: string };
  } | null,
  formData: FormData
) {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const otp = String(formData.get("otp") || "");
  if (!email || !otp) return { error: "Missing fields." };
  const captchaId = String(formData.get("captchaId") || "");
  const captchaAnswer = String(formData.get("captchaAnswer") || "");
  const res = await verifyForgotOtp(email, otp, { id: captchaId, answer: captchaAnswer });
  if (!res.ok) {
    return { error: res.error, captchaRequired: res.captchaRequired, captcha: res.captcha };
  }
  // Token stays in POST body / React state — never in a URL or server log.
  return { ok: true, step: "reset", token: res.token };
}

export async function resetPasswordAction(_prev: { ok?: boolean; error?: string } | null, formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };
  const res = await resetPasswordWithToken(token, password);
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function refreshCaptchaAction() {
  return createAuthCaptcha();
}

export async function verifyEmailAction(
  _prev: {
    ok?: boolean;
    error?: string;
    captchaRequired?: boolean;
    captcha?: { id: string; question: string };
  } | null,
  formData: FormData
) {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const code = String(formData.get("code") || "");
  if (!email || !code) return { error: "Missing fields." };
  const captchaId = String(formData.get("captchaId") || "");
  const captchaAnswer = String(formData.get("captchaAnswer") || "");
  const res = await verifyEmailOwnership(email, code, { id: captchaId, answer: captchaAnswer });
  if (!res.ok) {
    return { error: res.error, captchaRequired: res.captchaRequired, captcha: res.captcha };
  }
  return { ok: true };
}
