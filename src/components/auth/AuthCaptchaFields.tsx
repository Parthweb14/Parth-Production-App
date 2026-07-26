"use client";
import { useEffect, useState, useTransition } from "react";
import { refreshCaptchaAction } from "@/server/auth-actions";

type Captcha = { id: string; question: string };

export function AuthCaptchaFields({
  captcha,
  required,
}: {
  captcha?: Captcha | null;
  required?: boolean;
}) {
  const [local, setLocal] = useState<Captcha | null>(captcha ?? null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setLocal(captcha ?? null);
  }, [captcha]);

  useEffect(() => {
    if (required && !local) {
      startTransition(async () => {
        const next = await refreshCaptchaAction();
        setLocal(next);
      });
    }
  }, [required, local]);

  if (!required && !local) return null;

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <label className="block text-sm font-medium text-amber-100">
        Security check {local ? `— ${local.question}` : pending ? "Loading…" : ""}
      </label>
      <input type="hidden" name="captchaId" value={local?.id || ""} />
      <input
        name="captchaAnswer"
        type="text"
        inputMode="numeric"
        required={Boolean(required || local)}
        autoComplete="off"
        className="glass-input h-10 w-full rounded-lg px-3 text-sm text-gray-100 outline-none"
        placeholder="Answer"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const next = await refreshCaptchaAction();
            setLocal(next);
          })
        }
        className="text-xs text-amber-200/80 underline hover:text-amber-100"
      >
        New challenge
      </button>
    </div>
  );
}
