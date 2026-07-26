import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const TONES: Record<string, string> = {
  primary: "glass bg-gradient-to-br from-gray-800/10 to-gray-900/5 text-gray-900 dark:text-gray-100 border border-gray-200/50 dark:border-gray-700/30",
  success: "glass bg-gradient-to-br from-emerald-500/15 to-emerald-600/8 text-emerald-800 dark:text-emerald-200 border border-emerald-200/40 dark:border-emerald-800/30",
  warning: "glass bg-gradient-to-br from-amber-400/15 to-amber-500/8 text-amber-800 dark:text-amber-200 border border-amber-200/40 dark:border-amber-800/30",
  danger: "glass bg-gradient-to-br from-red-500/15 to-red-600/8 text-red-800 dark:text-red-200 border border-red-200/40 dark:border-red-800/30",
  info: "glass bg-gradient-to-br from-gray-500/15 to-gray-600/8 text-gray-700 dark:text-gray-300 border border-gray-200/40 dark:border-gray-700/30",
  secondary: "glass bg-gradient-to-br from-gray-500/12 to-gray-600/8 text-gray-700 dark:text-gray-300 border border-gray-200/40 dark:border-gray-700/30",
  dark: "glass bg-gradient-to-br from-gray-800/20 to-gray-900/12 text-gray-900 dark:text-gray-100 border border-gray-300/30 dark:border-gray-700/30",
};

export function StatCard({
  label,
  value,
  tone = "primary",
  href,
  icon: Icon,
  smallText,
}: {
  label: string;
  value: number | string;
  tone?: keyof typeof TONES;
  href?: string;
  icon?: LucideIcon;
  smallText?: boolean;
}) {
  const body = (
    <div className={cn("group flex items-center gap-4 rounded-xl p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5", TONES[tone])}>
      {Icon && (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-white/5">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
        <div className={cn("font-bold", smallText ? "text-lg" : "text-2xl")}>{value}</div>
      </div>
    </div>
  );
  if (href) return <Link href={href}>{body}</Link>;
  return body;
}
