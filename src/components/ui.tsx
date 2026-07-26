// src/components/ui.tsx — minimal primitives (shadcn-style, no external dep)
"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "success" | "warning" | "danger" | "info" | "dark" | "outline" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
}) {
  const variants: Record<string, string> = {
    primary: "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-sm",
    secondary: "bg-gray-500 hover:bg-gray-600 text-white dark:bg-gray-600 dark:hover:bg-gray-500",
    success: "bg-kp-success hover:bg-emerald-700 text-white",
    warning: "bg-kp-warning hover:bg-amber-600 text-white",
    danger: "bg-kp-danger hover:bg-red-700 text-white",
    info: "bg-kp-info hover:bg-cyan-700 text-white",
    dark: "bg-kp-dark hover:bg-black text-white",
    outline: "border border-gray-200 bg-white/50 hover:bg-white text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10",
    ghost: "hover:bg-[var(--nav-hover)] text-gray-600 dark:text-gray-400",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
    icon: "h-10 w-10",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "glass-input h-10 w-full rounded-lg px-3 text-base md:text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 dark:text-gray-100 dark:placeholder-gray-500",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "glass-input w-full rounded-lg px-3 py-2 text-base md:text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 dark:text-gray-100 dark:placeholder-gray-500",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "glass-input h-10 w-full rounded-lg px-3 text-base md:text-sm text-gray-900 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 dark:text-gray-100",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300", className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass-card rounded-xl", className)} {...props} />;
}

export function Badge({ className, tone = "gray", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: string }) {
  const tones: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    yellow: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    dark: "bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone] ?? tones.gray, className)} {...props} />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Focus first focusable control in the panel
    const t = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      el?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={cn("glass relative my-8 w-full max-w-lg rounded-2xl", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="glass-card rounded-xl py-12 text-center">
      <p className="text-sm font-semibold text-gray-600 dark:text-gray-200">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-400">{hint}</p>}
    </div>
  );
}
