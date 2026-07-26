"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { forgotPasswordAction, verifyOtpAction, resetPasswordAction } from "@/server/auth-actions";
import { AuthCaptchaFields } from "@/components/auth/AuthCaptchaFields";
import { Film, ArrowLeft } from "lucide-react";

export function ForgotPasswordForm({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const year = new Date().getFullYear();
  const [step, setStep] = useState<"email" | "otp" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");

  const [emailState, emailAction, emailPending] = useActionState(forgotPasswordAction, null);
  const [otpState, otpAction, otpPending] = useActionState(verifyOtpAction, null);
  const [resetState, resetAction, resetPending] = useActionState(resetPasswordAction, null);

  useEffect(() => {
    if (emailState?.step === "otp" && emailState.email) {
      setEmail(emailState.email);
      setStep("otp");
    }
  }, [emailState]);

  useEffect(() => {
    if (otpState?.step === "reset" && otpState.token) {
      setToken(otpState.token);
      setStep("reset");
    }
  }, [otpState]);

  useEffect(() => {
    if (resetState?.ok) setStep("done");
  }, [resetState]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black p-4">
      <div className="w-full max-w-md">
        <div className="glass rounded-2xl p-8 shadow-2xl">
          <div className="mb-6 text-center">
            {logoUrl ? (
              <div className="mx-auto mb-4 flex items-center justify-center">
                <img src={logoUrl} alt="Kadam Production" className="kp-logo-zoom mx-auto h-auto w-full max-h-40 rounded-xl object-contain" />
              </div>
            ) : (
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-700 to-gray-900 text-white shadow-lg">
                <Film className="h-8 w-8" />
              </div>
            )}
            <h1 className="text-xl font-extrabold tracking-wide text-gray-100">KADAM PRODUCTION</h1>
            <p className="text-sm text-gray-400">
              {step === "email" && "Forgot your password? Reset it here."}
              {step === "otp" && "Check your email for the OTP."}
              {step === "reset" && "Choose a new password."}
              {step === "done" && "Password reset successful!"}
            </p>
          </div>

          {step === "email" && (
            <>
              {emailState?.error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400">{emailState.error}</div>
              )}
              <form action={emailAction} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Email</label>
                  <input
                    name="email"
                    type="email"
                    required
                    autoFocus
                    className="glass-input h-11 w-full rounded-lg px-3 text-base md:text-sm text-gray-100 placeholder-gray-500 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                    placeholder="you@example.com"
                  />
                </div>
                <AuthCaptchaFields required={Boolean(emailState?.captchaRequired)} captcha={emailState?.captcha} />
                <button
                  type="submit"
                  disabled={emailPending}
                  className="h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-white shadow-sm transition-all hover:bg-[var(--accent-hover)] disabled:opacity-50 dark:text-gray-900"
                >
                  {emailPending ? "Sending\u2026" : "Send OTP"}
                </button>
              </form>
            </>
          )}

          {step === "otp" && (
            <>
              {otpState?.error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400">{otpState.error}</div>
              )}
              <form action={otpAction} className="space-y-4">
                <input type="hidden" name="email" value={email} />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Enter 6-digit OTP</label>
                  <input
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                    className="glass-input h-11 w-full rounded-lg px-3 text-center text-lg font-bold tracking-[8px] text-gray-100 placeholder-gray-600 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                    placeholder="000000"
                  />
                </div>
                <AuthCaptchaFields required={Boolean(otpState?.captchaRequired)} captcha={otpState?.captcha} />
                <button
                  type="submit"
                  disabled={otpPending}
                  className="h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-white shadow-sm transition-all hover:bg-[var(--accent-hover)] disabled:opacity-50 dark:text-gray-900"
                >
                  {otpPending ? "Verifying\u2026" : "Verify OTP"}
                </button>
              </form>
            </>
          )}

          {step === "reset" && (
            <>
              {resetState?.error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400">{resetState.error}</div>
              )}
              <form action={resetAction} className="space-y-4">
                <input type="hidden" name="token" value={token} />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">New Password</label>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoFocus
                    className="glass-input h-11 w-full rounded-lg px-3 text-base md:text-sm text-gray-100 placeholder-gray-500 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                    placeholder="Minimum 8 characters"
                  />
                  <p className="mt-1 text-xs text-gray-400">Minimum 8 characters</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Confirm Password</label>
                  <input
                    name="confirm"
                    type="password"
                    required
                    minLength={8}
                    className="glass-input h-11 w-full rounded-lg px-3 text-base md:text-sm text-gray-100 placeholder-gray-500 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                    placeholder="Repeat password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={resetPending}
                  className="h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-white shadow-sm transition-all hover:bg-[var(--accent-hover)] disabled:opacity-50 dark:text-gray-900"
                >
                  {resetPending ? "Resetting\u2026" : "Reset Password"}
                </button>
              </form>
            </>
          )}

          {step === "done" && (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-400">Your password has been reset successfully.</p>
              <button
                onClick={() => router.push("/login")}
                className="h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-white shadow-sm transition-all hover:bg-[var(--accent-hover)] dark:text-gray-900"
              >
                Go to Login
              </button>
            </div>
          )}

          {step !== "email" && step !== "done" && (
            <button type="button" onClick={() => router.push("/login")} className="mt-4 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <ArrowLeft className="h-3 w-3" /> Back to Login
            </button>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-white/50">
          &copy; {year} Kadam Production / Powered by{" "}
          <a href="https://trishulhub.in" target="_blank" rel="noopener noreferrer" className="font-medium text-white/70 underline hover:text-white">
            Trishulhub
          </a>
        </p>
      </div>
    </div>
  );
}