"use client";
import { useActionState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/server/auth-actions";
import { AuthCaptchaFields } from "@/components/auth/AuthCaptchaFields";
import { Film } from "lucide-react";

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
        <div className="glass rounded-2xl p-8 shadow-2xl">
          <div className="mb-6 text-center">
            {logoUrl ? (
              <div className="mx-auto mb-5 flex items-center justify-center">
                <div className="logo-plate inline-flex items-center justify-center rounded-xl px-2.5 py-2">
                  <img
                    src="/api/icon?trim=1&h=228&v=5"
                    srcSet="/api/icon?trim=1&h=152&v=5 1x, /api/icon?trim=1&h=304&v=5 2x, /api/icon?trim=1&h=456&v=5 3x"
                    alt="Parth Production"
                    width={280}
                    height={76}
                    decoding="async"
                    fetchPriority="high"
                    className="h-[4.5rem] w-auto max-w-[280px] object-contain sm:h-[4.75rem]"
                  />
                </div>
              </div>
            ) : (
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-700 to-gray-900 text-white shadow-lg">
                <Film className="h-8 w-8" />
              </div>
            )}
            {/* Brand mark is in the logo; keep only a short supporting line under it. */}
            <p className="text-sm text-gray-500 dark:text-gray-400">Professional Event Services</p>
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
            <div className="flex items-center justify-between text-xs">
              <Link href="/forgot-password" className="text-gray-500 hover:text-gray-300 transition-colors dark:text-gray-400 dark:hover:text-gray-200">
                Forgot password?
              </Link>
              <Link href="/verify-email" className="text-gray-500 hover:text-gray-300 transition-colors dark:text-gray-400 dark:hover:text-gray-200">
                Verify email
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
