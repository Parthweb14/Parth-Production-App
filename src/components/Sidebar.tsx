"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  FolderOpen,
  CalendarDays,
  LineChart,
  Users,
  UsersRound,
  Settings,
  ScanLine,
  ListChecks,
  KeyRound,
  Mail,
  Inbox,
  LogOut,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard };

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Categories", href: "/categories", icon: FolderOpen },
  { label: "Orders", href: "/orders", icon: CalendarDays },
  { label: "Finance", href: "/finance", icon: LineChart },
  { label: "Employees", href: "/employees", icon: Users },
  { label: "Teams", href: "/teams", icon: UsersRound },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Email Requests", href: "/email-change-requests", icon: Inbox },
  { label: "Scan Item", href: "/scan", icon: ScanLine },
  { label: "Change Email", href: "/change-email", icon: Mail },
  { label: "Change Password", href: "/change-password", icon: KeyRound },
];

const EMPLOYEE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Scan Item", href: "/scan", icon: ScanLine },
  { label: "My Tasks", href: "/my-tasks", icon: ListChecks },
  { label: "Change Email", href: "/change-email", icon: Mail },
  { label: "Change Password", href: "/change-password", icon: KeyRound },
];

export function Sidebar({
  role,
  name,
  logoUrl,
  scanEnabled = true,
  onLogout,
  onNavClick,
}: {
  role: "admin" | "employee";
  name: string;
  logoUrl?: string | null;
  scanEnabled?: boolean;
  onLogout: () => Promise<void>;
  onNavClick?: () => void;
}) {
  const pathname = usePathname();
  const nav = (role === "admin" ? ADMIN_NAV : EMPLOYEE_NAV).filter(
    (item) => item.href !== "/scan" || role === "admin" || scanEnabled
  );

  return (
    <aside className="glass-sidebar flex h-full w-64 flex-col">
      {/* Brand header */}
      <div className="brand-header px-5 py-5">
        {logoUrl ? (
          <div className="mb-3 flex items-center justify-center">
            <img src={logoUrl} alt="Logo" className="h-auto w-full max-h-28 rounded-xl object-contain" />
          </div>
        ) : (
          <div className="mb-3 flex items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-200 dark:bg-white/15">
              <Film className="h-7 w-7 text-gray-600 dark:text-white" />
            </div>
          </div>
        )}
        <div className="text-center">
          <div className="text-base font-bold text-gray-900 dark:text-white">{role === "admin" ? "KP Admin" : "KP Staff"}</div>
          <div className="text-xs text-gray-500 dark:text-white/60">Kadam Production</div>
        </div>
        <div className="mt-3 truncate rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-500 dark:bg-white/10 dark:text-white/70">
          <span className="text-gray-400 dark:text-white/50">Signed in as </span>
          <span className="font-semibold text-gray-900 dark:text-white">{name}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-[var(--nav-active-bg)] text-[var(--nav-active-text)] shadow-sm"
                  : "text-gray-600 hover:bg-[var(--nav-hover)] hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active && "scale-110")} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle — desktop sidebar only; mobile uses DashboardShell header toggle */}
      <div className="hidden px-3 pb-1 lg:block">
        <ThemeToggle />
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 p-3 dark:border-white/5">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-500 transition-all hover:bg-[var(--nav-hover)] hover:text-[var(--nav-active-text)] dark:text-gray-400"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>
        <p className="mt-2 px-3 text-[10px] text-gray-400 dark:text-gray-600">
          &copy; {new Date().getFullYear()} Kadam Production / Powered by{" "}
          <a href="https://trishulhub.in" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-400">
            Trishulhub
          </a>
        </p>
      </div>
    </aside>
  );
}
