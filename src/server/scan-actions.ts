// src/server/scan-actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getScanEnabled } from "@/lib/settings";

export async function scanItem(
  barcode: string,
  action: "checkout" | "checkin" | "damaged",
  orderId?: number
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Enforce scan_enabled for employees (admins may always scan for ops recovery).
  if (user.role !== "admin") {
    const enabled = await getScanEnabled();
    if (!enabled) throw new Error("Scanning is currently disabled.");
  }

  const code = barcode.trim();
  if (!code) throw new Error("Enter a barcode.");
  const item = await db
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.barcode, code), isNull(schema.items.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!item) throw new Error("Item not found for this barcode.");

  if (action !== "checkout" && action !== "checkin" && action !== "damaged") {
    throw new Error("Invalid scan action.");
  }

  if (action === "checkout") {
    if (!orderId) throw new Error("Select an ongoing event.");
    if (item.status === "damaged") throw new Error("This item is marked damaged and cannot be checked out.");
    if (item.status === "busy" && item.currentOrderId && item.currentOrderId !== orderId) {
      throw new Error("This item is already checked out to another order. Check it in first.");
    }
    // Repair orphan busy (busy with null order) before allowing checkout.
    if (item.status === "busy" && !item.currentOrderId) {
      // treat as available for this checkout
    } else if (item.status !== "available" && !(item.status === "busy" && item.currentOrderId === orderId)) {
      if (item.status === "busy") {
        throw new Error("This item is already checked out to another order. Check it in first.");
      }
    }

    const order = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), isNull(schema.orders.deletedAt)))
      .limit(1)
      .then((r) => r[0]);
    if (!order) throw new Error("Order not found.");
    if (order.status !== "ongoing") {
      throw new Error(`Cannot check out to a "${order.status}" order. Only ongoing events are eligible.`);
    }

    // Employees may only scan for orders they are assigned to (IDOR fix).
    if (user.role !== "admin") {
      const assigned = await db
        .select({ id: schema.orderAssignments.id })
        .from(schema.orderAssignments)
        .where(
          and(eq(schema.orderAssignments.orderId, orderId), eq(schema.orderAssignments.userId, user.id))
        )
        .limit(1);
      if (!assigned.length) throw new Error("You are not assigned to this order.");
    }

    await db
      .update(schema.items)
      .set({ status: "busy", currentOrderId: orderId })
      .where(eq(schema.items.id, item.id));

    // Upsert order_items — never create duplicates.
    const existing = await db
      .select()
      .from(schema.orderItems)
      .where(and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.itemId, item.id)))
      .limit(1)
      .then((r) => r[0]);
    if (existing) {
      await db
        .update(schema.orderItems)
        .set({ scannedOutAt: new Date(), scannedInAt: null })
        .where(eq(schema.orderItems.id, existing.id));
    } else {
      await db.insert(schema.orderItems).values({
        orderId,
        itemId: item.id,
        quantity: 1,
        scannedOutAt: new Date(),
      });
    }
    revalidatePath("/scan");
    return { ok: true, msg: `${item.name} → checked out to ${order.clientName}.` };
  }

  if (action === "checkin") {
    // Employees may only check in items tied to an order they are assigned to.
    if (user.role !== "admin" && item.currentOrderId) {
      const assigned = await db
        .select({ id: schema.orderAssignments.id })
        .from(schema.orderAssignments)
        .where(
          and(
            eq(schema.orderAssignments.orderId, item.currentOrderId),
            eq(schema.orderAssignments.userId, user.id)
          )
        )
        .limit(1);
      if (!assigned.length) throw new Error("You are not assigned to this order.");
    }

    await db
      .update(schema.items)
      .set({ status: "available", currentOrderId: null })
      .where(eq(schema.items.id, item.id));
    if (item.currentOrderId) {
      const existing = await db
        .select()
        .from(schema.orderItems)
        .where(and(eq(schema.orderItems.itemId, item.id), eq(schema.orderItems.orderId, item.currentOrderId)))
        .limit(1)
        .then((r) => r[0]);
      if (existing) {
        await db
          .update(schema.orderItems)
          .set({ scannedInAt: new Date() })
          .where(eq(schema.orderItems.id, existing.id));
      }
    }
    revalidatePath("/scan");
    return { ok: true, msg: `${item.name} → returned to stock.` };
  }

  // damaged — employees may only mark damaged for items on their assigned order
  if (user.role !== "admin" && item.currentOrderId) {
    const assigned = await db
      .select({ id: schema.orderAssignments.id })
      .from(schema.orderAssignments)
      .where(
        and(
          eq(schema.orderAssignments.orderId, item.currentOrderId),
          eq(schema.orderAssignments.userId, user.id)
        )
      )
      .limit(1);
    if (!assigned.length) throw new Error("You are not assigned to this order.");
  }

  await db
    .update(schema.items)
    .set({ status: "damaged", currentOrderId: null })
    .where(eq(schema.items.id, item.id));
  revalidatePath("/scan");
  return { ok: true, msg: `${item.name} → marked damaged.` };
}
