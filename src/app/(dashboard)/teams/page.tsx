// src/app/(dashboard)/teams/page.tsx
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { TeamsView } from "@/components/teams/TeamsView";

export default async function TeamsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");

  let data: (typeof schema.teams.$inferSelect & { members: { userId: number; name: string }[] })[] = [];
  let employees: { id: number; name: string }[] = [];
  let loadError = false;
  try {
    const [teams, allMembers, emps] = await Promise.all([
      db.select().from(schema.teams).where(isNull(schema.teams.deletedAt)),
      db.select().from(schema.teamMembers),
      db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(and(eq(schema.users.role, "employee"), eq(schema.users.active, true), isNull(schema.users.deletedAt))),
    ]);
    employees = emps;
    data = teams.map((t) => ({
      ...t,
      members: allMembers
        .filter((m) => m.teamId === t.id)
        .map((m) => ({ userId: m.userId, name: employees.find((e) => e.id === m.userId)?.name }))
        .filter((m): m is { userId: number; name: string } => typeof m.name === "string"),
    }));
  } catch {
    loadError = true;
  }

  if (loadError) {
    return (
      <div className="glass-card rounded-xl p-8 text-center">
        <p className="text-sm font-semibold text-red-500">Failed to load teams.</p>
        <p className="text-xs text-gray-400">Please try refreshing the page.</p>
      </div>
    );
  }

  return <TeamsView teams={data} employees={employees} />;
}
