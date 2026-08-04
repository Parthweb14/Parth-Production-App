"use client";
import { useActionState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/server/auth-actions";
import { AuthCaptchaFields } from "@/components/auth/AuthCaptchaFields";
import { BrandLogo } from "@/components/BrandLogo";

export function LoginForm({ logoUrl }: { logoUrl: string | null }) {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailChanged = searchParams.get("emailChanged") === "1";
  const year = new Date().getFullYear();
  useEffect(() => {
    if (state?.ok) {
      if (state.mustChangePwd) {
        router.push("/change-password?force=1");
      } else {
        router.push("/");
      }
    }
  }, [state, router]);

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black p-4">
      <div className="w-full max-w-md">
        <div className="glass rounded-2xl px-6 pb-8 pt-5 shadow-2xl sm:px-8 sm:pt-6">
          <div className="mb-5 text-center">
            <div className="mx-auto flex items-center justify-center leading-none">
              <BrandLogo logoUrl={logoUrl} variant="login" />
            </div>
            <h1 className="mt-1.5 text-xl font-bold leading-tight tracking-wide text-gray-100 sm:mt-2 sm:text-2xl">
              Parth Production
            </h1>
          </div>

          {emailChanged && (
            <div className="mb-4 rounded-lg bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              Email updated successfully. Sign in with your new email.
            </div>
          )}

          {state?.error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400">
              {state.error}
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input
                name="email"
                type="email"
                required
                autoFocus
                className="glass-input h-11 w-full rounded-lg px-3 text-base md:text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 dark:text-gray-100 dark:placeholder-gray-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
              <input
                name="password"
                type="password"
                required
                className="glass-input h-11 w-full rounded-lg px-3 text-base md:text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 dark:text-gray-100 dark:placeholder-gray-500"
                placeholder="••••••••"
              />
            </div>
            <AuthCaptchaFields required={Boolean(state?.captchaRequired)} captcha={state?.captcha} />
            <button
              type="submit"
              disabled={pending}
              className="h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-white shadow-sm transition-all hover:bg-[var(--accent-hover)] disabled:opacity-50 dark:text-gray-900"
            >
              {pending ? "Signing in\u2026" : "LOGIN"}
            </button>
            <div className="text-center text-xs">
              <Link href="/forgot-password" className="text-gray-500 hover:text-gray-300 transition-colors dark:text-gray-400 dark:hover:text-gray-200">
                Forgot password?
              </Link>
            </div>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-white/50">
          &copy; {year} Parth Production / Powered by{" "}
          <a href="https://trishulhub.in" target="_blank" rel="noopener noreferrer" className="font-medium text-white/70 underline hover:text-white">
            Trishulhub
          </a>
        </p>
      </div>
    </div>
  );
}
