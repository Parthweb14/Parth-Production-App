// src/app/(dashboard)/error.tsx
"use client";
import Link from "next/link";
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-semibold text-red-700">Something went wrong</h2>
        <p className="mt-1 text-sm text-gray-600">Could not load this page. It may be a temporary network issue.</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button onClick={reset} className="rounded-lg bg-kp-primary px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
            Try Again
          </button>
          <Link href="/" className="text-sm font-medium text-kp-primary underline underline-offset-2 hover:text-gray-700">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
