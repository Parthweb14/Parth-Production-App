// src/server/notification-dispatcher.ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

type NotifyInput = {
  userId?: number;
  userIds?: number[];
  teamId?: number;
  orderId?: number;
  type: string;
  title: string;
  message?: string;
  link?: string;
};

export async function dispatchNotification(input: NotifyInput) {
  let recipients: number[] = [];

  if (input.teamId) {
    const members = await db
      .select({ userId: schema.teamMembers.userId })
      .from(schema.teamMembers)
      .where(eq(schema.teamMembers.teamId, input.teamId));
    recipients = members.map((m) => m.userId);
  }

  if (input.userIds) recipients.push(...input.userIds);
  if (input.userId) recipients.push(input.userId);

  recipients = [...new Set(recipients)];
  if (!recipients.length) return;

  const values = recipients.map((uid) => ({
    userId: uid,
    orderId: input.orderId ?? null,
    type: input.type,
    title: input.title,
    message: input.message ?? null,
    link: input.link ?? null,
  }));

  // FIX: try a single batch insert, but if it fails (e.g. FK violation from a
  // stale userId), fall back to inserting one-by-one so one bad recipient does
  // not block notifications for everyone else.
  try {
    await db.insert(schema.notifications).values(values);
  } catch (err) {
    console.error("[dispatcher] batch insert failed, falling back to per-user:", err);
    for (const v of values) {
      try {
        await db.insert(schema.notifications).values(v);
      } catch (e) {
        console.error("[dispatcher] failed to notify user", v.userId, e);
      }
    }
  }
}

const IMPORTANT_TYPES = new Set([
  "password_reset",
  "account_created",
  "team_assigned",
  "setup_done",
]);

export function isImportant(type: string): boolean {
  return IMPORTANT_TYPES.has(type);
}