"use server";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type Notification = {
  id: number;
  userId: number;
  orderId: number | null;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: number;
  createdAt: number;
};

export async function fetchNotifications(limit = 10) {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
  return rows as unknown as Notification[];
}

export async function getUnreadCount() {
  const user = await getCurrentUser();
  if (!user) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), eq(schema.notifications.read, false)));
  return Number(rows[0]?.n ?? 0);
}

export async function markNotificationRead(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  await db
    .update(schema.notifications)
    .set({ read: true })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, user.id)));
}

export async function markAllRead() {
  const user = await getCurrentUser();
  if (!user) return;
  await db
    .update(schema.notifications)
    .set({ read: true })
    .where(and(eq(schema.notifications.userId, user.id), eq(schema.notifications.read, false)));
}

export async function createNotification(input: {
  userId: number;
  orderId?: number;
  type: string;
  title: string;
  message?: string;
  link?: string;
}) {
  await db.insert(schema.notifications).values({
    userId: input.userId,
    orderId: input.orderId ?? null,
    type: input.type,
    title: input.title,
    message: input.message ?? null,
    link: input.link ?? null,
  });
}
