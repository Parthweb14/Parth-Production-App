// src/server/scan-actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function scanItem(
  barcode: string,
  action: "checkout" | "checkin" | "damaged",
  orderId?: number
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

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

  // damaged
  await db
    .update(schema.items)
    .set({ status: "damaged", currentOrderId: null })
    .where(eq(schema.items.id, item.id));
  revalidatePath("/scan");
  return { ok: true, msg: `${item.name} → marked damaged.` };
}
