"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { verifyEmailAction } from "@/server/auth-actions";
import { AuthCaptchaFields } from "@/components/auth/AuthCaptchaFields";
import { Film } from "lucide-react";

export function VerifyEmailForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(verifyEmailAction, null);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => router.push("/login"), 1200);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black p-4">
      <div className="w-full max-w-md">
        <div className="glass rounded-2xl p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-700 to-gray-900 text-white shadow-lg">
              <Film className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-extrabold tracking-wide text-gray-100">Verify email</h1>
            <p className="text-sm text-gray-400">Enter the code from your inbox to activate your account.</p>
          </div>

          {state?.error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400">
              {state.error}
            </div>
          )}
          {state?.ok && (
            <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Email verified. Redirecting to login…
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Email</label>
              <input
                name="email"
                type="email"
                required
                className="glass-input h-11 w-full rounded-lg px-3 text-sm text-gray-100 outline-none"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Verification code</label>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                className="glass-input h-11 w-full rounded-lg px-3 text-center text-lg font-bold tracking-[8px] text-gray-100 outline-none"
                placeholder="000000"
              />
            </div>
            <AuthCaptchaFields required={Boolean(state?.captchaRequired)} captcha={state?.captcha} />
            <button
              type="submit"
              disabled={pending || Boolean(state?.ok)}
              className="h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-white disabled:opacity-50 dark:text-gray-900"
            >
              {pending ? "Verifying…" : "Verify & activate"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/login" className="text-xs text-gray-500 hover:text-gray-300">
              Back to login
            </Link>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-white/50">&copy; {year} Kadam Production</p>
      </div>
    </div>
  );
}
