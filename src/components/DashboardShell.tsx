// src/components/DashboardShell.tsx  (client wrapper for mobile menu + sidebar)
"use client";
import { useState } from "react";
import { NotificationBell } from "./NotificationBell";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

export function DashboardShell({
  role,
  name,
  logoUrl,
  scanEnabled = true,
  logout,
  children,
}: {
  role: "admin" | "employee";
  name: string;
  logoUrl?: string | null;
  scanEnabled?: boolean;
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <Sidebar role={role} name={name} logoUrl={logoUrl} scanEnabled={scanEnabled} onLogout={logout} />
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full">
            <Sidebar role={role} name={name} logoUrl={logoUrl} scanEnabled={scanEnabled} onLogout={logout} onNavClick={() => setOpen(false)} />
          </div>
          <button
            className="absolute right-4 top-4 rounded-lg bg-white p-2 shadow dark:bg-gray-800"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-[80] flex items-center gap-3 bg-gradient-to-br from-gray-800 to-gray-950 px-4 py-3 text-white shadow-lg lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 hover:bg-white/10">
            <Menu className="h-6 w-6" />
          </button>
          <span className="flex-1 font-bold">Kadam Production</span>
          <div className="flex items-center gap-1 [&_button]:text-white [&_button]:hover:bg-white/10 [&_button]:hover:text-white">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        {/* Desktop top bar */}
        <header className="sticky top-0 z-[80] hidden items-center justify-end gap-3 border-b border-gray-200 bg-white/80 px-6 py-2 backdrop-blur-lg dark:border-gray-800 dark:bg-black lg:flex">
          <NotificationBell />
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
