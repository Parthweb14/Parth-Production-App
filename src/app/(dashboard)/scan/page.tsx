// src/app/(dashboard)/scan/page.tsx
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { ScanView } from "@/components/scan/ScanView";

export default async function ScanPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Show only ongoing events (server rejects checkout to upcoming).
  if (user.role === "employee") {
    const assignedOrders = await db
      .select({ orderId: schema.orderAssignments.orderId })
      .from(schema.orderAssignments)
      .where(eq(schema.orderAssignments.userId, user.id));
    const orderIds = assignedOrders.map((a) => a.orderId);
    const ongoing = orderIds.length
      ? await db
          .select({ id: schema.orders.id, clientName: schema.orders.clientName, contactPerson: schema.orders.contactPerson, eventDate: schema.orders.eventDate })
          .from(schema.orders)
          .where(and(inArray(schema.orders.id, orderIds), isNull(schema.orders.deletedAt), eq(schema.orders.status, "ongoing")))
      : [];
    return <ScanView ongoing={ongoing} />;
  }

  const ongoing = await db
    .select({ id: schema.orders.id, clientName: schema.orders.clientName, contactPerson: schema.orders.contactPerson, eventDate: schema.orders.eventDate })
    .from(schema.orders)
    .where(and(isNull(schema.orders.deletedAt), eq(schema.orders.status, "ongoing")));

  return <ScanView ongoing={ongoing} />;
}
