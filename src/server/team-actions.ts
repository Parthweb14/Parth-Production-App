// src/server/team-actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dispatchNotification } from "./notification-dispatcher";

export async function createTeam(input: { name: string; description?: string }) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const dup = await db.select({ id: schema.teams.id }).from(schema.teams).where(and(eq(schema.teams.name, input.name.trim()), isNull(schema.teams.deletedAt))).limit(1);
  if (dup.length) throw new Error("A team with this name already exists.");
  await db.insert(schema.teams).values({ name: input.name.trim(), description: input.description?.trim() || null });
  revalidatePath("/teams");
}

export async function deleteTeam(id: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  await db.update(schema.teams).set({ deletedAt: new Date() }).where(eq(schema.teams.id, id));
  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, id));
  revalidatePath("/teams");
}

export async function addMember(teamId: number, userId: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const [team] = await db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams).where(and(eq(schema.teams.id, teamId), isNull(schema.teams.deletedAt))).limit(1);
  if (!team) throw new Error("Team not found.");
  const [emp] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.role, "employee"),
        eq(schema.users.active, true),
        isNull(schema.users.deletedAt)
      )
    )
    .limit(1);
  if (!emp) throw new Error("Employee not found.");
  await db.insert(schema.teamMembers).values({ teamId, userId }).onConflictDoNothing();
  await dispatchNotification({
    userId,
    type: "team_assigned",
    title: "Assigned to Team",
    message: `You have been added to "${team.name}" team.`,
    link: "/teams",
  });
  revalidatePath("/teams");
}

export async function removeMember(teamId: number, userId: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const [team] = await db.select({ name: schema.teams.name, deletedAt: schema.teams.deletedAt }).from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1);
  await db.delete(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)));
  if (team && !team.deletedAt) {
    const teamName = team.name ?? "Team";
    await dispatchNotification({
      userId,
      type: "team_removed",
      title: "Removed from Team",
      message: `You have been removed from "${teamName}" team.`,
    });
  }
  revalidatePath("/teams");
}
