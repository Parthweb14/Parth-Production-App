// src/app/(dashboard)/page.tsx — Dashboard
import { redirect } from "next/navigation";
import { Plus, CalendarClock, CalendarCheck, Users, FolderOpen, ClipboardList } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardStats, countAssignedOrders } from "@/lib/queries";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // If the session can't be verified (DB hiccup, missing session row, revoked),
  // send the user back to login instead of crashing on a null user.
  if (!user) redirect("/login");

  const isAdmin = user.role === "admin";

  if (!isAdmin) {
    const assigned = await countAssignedOrders(user.id);
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Kadam Production</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="My Assigned Orders" value={assigned} tone="primary" href="/my-tasks" icon={ClipboardList} />
        </div>
        <Card className="mt-6 p-5">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Welcome! Use the <span className="font-semibold">Scan Item</span> feature to check items in/out for your assigned events.
            Check <span className="font-semibold">My Tasks</span> to see your upcoming events.
          </p>
        </Card>
      </div>
    );
  }

  let s;
  try { s = await getDashboardStats(); } catch { s = { busy: 0, ongoingOrders: 0, upcomingOrders: 0, employees: 0, totalItems: 0 }; }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Kadam Production</h1>
        <span className="rounded-lg bg-kp-primary px-3 py-1.5 text-sm font-semibold text-white">ADMIN</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Create New Order" value="New" tone="primary" href="/orders?new=1" icon={Plus} smallText />
        <StatCard label="On Events" value={s.busy} tone="warning" href="/inventory" icon={CalendarClock} />
        <StatCard label="Ongoing Orders" value={s.ongoingOrders} tone="info" href="/orders?status=ongoing" icon={CalendarClock} />
        <StatCard label="Upcoming" value={s.upcomingOrders} tone="secondary" href="/orders?status=upcoming" icon={CalendarCheck} />
        <StatCard label="Employees" value={s.employees} tone="dark" href="/employees" icon={Users} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="overflow-hidden border-l-4 border-l-gray-400 p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Active Events</p>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-500/20">
              <CalendarClock className="h-6 w-6 text-gray-600" />
            </div>
            <div className="text-sm text-gray-600">
              <StatusBadge status="ongoing" /> <span className="font-semibold text-gray-900">{s.ongoingOrders}</span> ongoing<br />
              <StatusBadge status="upcoming" /> <span className="font-semibold text-gray-900">{s.upcomingOrders}</span> upcoming
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden border-l-4 border-l-kp-primary p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Inventory</p>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-500/20">
              <FolderOpen className="h-6 w-6 text-gray-600" />
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{s.busy}</span> on events<br />
              <span className="font-semibold text-gray-900">{s.totalItems}</span> total items
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden border-l-4 border-l-gray-400 p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Team</p>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-500/20">
              <Users className="h-6 w-6 text-gray-600" />
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{s.employees}</span> employees on staff
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
