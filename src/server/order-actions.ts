// src/server/order-actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { createNotification } from "./notification-actions";
import { EVENT_CATEGORIES } from "@/drizzle/schema";
import type { OrderStatus } from "@/drizzle/schema";
import { formatOrderNumber } from "@/lib/invoice-number";
import { formatINR } from "@/lib/utils";
import { sendEmail } from "@/lib/email";

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  upcoming: ["ongoing", "completed", "cancelled"],
  ongoing: ["completed", "cancelled"],
  completed: ["cancelled"],
  cancelled: [],
};

async function releaseOrderInventory(orderId: number, mode: "available" | "unlink") {
  const linked = await db
    .select({ itemId: schema.orderItems.itemId })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, orderId));
  const linkedItemIds = linked.map((l) => l.itemId);
  if (!linkedItemIds.length) return;
  if (mode === "available") {
    await db
      .update(schema.items)
      .set({ status: "available", currentOrderId: null })
      .where(inArray(schema.items.id, linkedItemIds));
  } else {
    // Unlink only — still free orphan-busy items that point at this order.
    await db
      .update(schema.items)
      .set({ currentOrderId: null })
      .where(inArray(schema.items.id, linkedItemIds));
    await db
      .update(schema.items)
      .set({ status: "available" })
      .where(
        and(
          inArray(schema.items.id, linkedItemIds),
          eq(schema.items.status, "busy"),
          isNull(schema.items.currentOrderId)
        )
      );
  }
}

export async function createOrder(input: {
  clientName: string;
  contactPerson: string;
  contactPhone?: string;
  contactEmail?: string;
  transportContactName?: string;
  transportContactPhone?: string;
  eventDate?: string;
  eventTime?: string;
  setupDate?: string;
  setupTime?: string;
  address?: string;
  billingAddress?: string;
  totalBudget?: number;
  advancePayment?: number;
  eventCategory?: string;
  gstEnabled?: boolean;
}) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");

  if (!input.clientName || !input.clientName.trim()) throw new Error("Client name is required.");

  const budget = Number(input.totalBudget || 0);
  const advance = Number(input.advancePayment || 0);
  if (budget < 0 || advance < 0) throw new Error("Amounts cannot be negative.");

  const contactEmail = input.contactEmail ? input.contactEmail.trim().toLowerCase() : null;

  let orderId: number | undefined;
  let advanceFailed = false;
  try {
    const [order] = await db
      .insert(schema.orders)
      .values({
        clientName: input.clientName.trim(),
        contactPerson: input.contactPerson.trim() || null,
        contactPhone: input.contactPhone || null,
        contactEmail,
        transportContactName: input.transportContactName || null,
        transportContactPhone: input.transportContactPhone || null,
        eventDate: input.eventDate || null,
        eventTime: input.eventTime || null,
        setupDate: input.setupDate || null,
        setupTime: input.setupTime || null,
        address: input.address || null,
        billingAddress: input.billingAddress || null,
        totalBudget: budget,
        status: "upcoming",
        eventCategory: (EVENT_CATEGORIES as readonly string[]).includes(input.eventCategory || "")
          ? (input.eventCategory as (typeof EVENT_CATEGORIES)[number])
          : "Other",
        gstEnabled: input.gstEnabled ?? false,
      })
      .returning({ id: schema.orders.id });

    if (advance > 0 && order) {
      try {
        await db.insert(schema.finance).values({
          orderId: order.id,
          type: "income",
          category: "Advance Payment",
          amount: advance,
          date: input.eventDate || new Date().toISOString().slice(0, 10),
          description: "Advance at order creation",
        });
      } catch (advanceErr) {
        console.error("createOrder: failed to record advance for order", order.id, advanceErr);
        advanceFailed = true;
      }
    }
    orderId = order?.id;
  } catch (err) {
    console.error("createOrder error:", err);
    throw new Error("Failed to create order. Please try again.");
  }

  revalidatePath("/orders");
  if (advanceFailed) {
    throw new Error(
      `Order #${orderId} was created but the advance payment could not be recorded. Please add it manually in Finance.`
    );
  }
  return orderId;
}

export async function updateOrder(id: number, input: Record<string, unknown>) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  try {
    const patch: Record<string, unknown> = {};
    for (const k of [
      "clientName",
      "contactPerson",
      "contactPhone",
      "transportContactName",
      "transportContactPhone",
      "eventDate",
      "eventTime",
      "setupDate",
      "setupTime",
      "address",
      "billingAddress",
    ]) {
      if (input[k] !== undefined) patch[k] = input[k] || null;
    }
    if (input.contactEmail !== undefined) {
      const e = String(input.contactEmail || "").trim().toLowerCase();
      patch.contactEmail = e || null;
    }
    if (input.totalBudget !== undefined) patch.totalBudget = Number(input.totalBudget || 0);
    if (input.gstEnabled !== undefined) patch.gstEnabled = Boolean(input.gstEnabled);
    if (
      input.eventCategory !== undefined &&
      (EVENT_CATEGORIES as readonly string[]).includes(String(input.eventCategory))
    ) {
      patch.eventCategory = input.eventCategory;
    }
    await db
      .update(schema.orders)
      .set(patch)
      .where(and(eq(schema.orders.id, id), isNull(schema.orders.deletedAt)));
    revalidatePath("/orders");
    revalidatePath(`/orders/${id}`);
  } catch (err) {
    console.error("updateOrder error:", err);
    throw new Error("Failed to update order. Please try again.");
  }
}

export async function checkEmailDuplicate(email: string, excludeOrderId?: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const emailLower = email.trim().toLowerCase();
  if (!emailLower) return [];
  const conds = [eq(schema.orders.contactEmail, emailLower), isNull(schema.orders.deletedAt)];
  if (excludeOrderId) conds.push(sql`${schema.orders.id} <> ${excludeOrderId}`);
  return db
    .select({ id: schema.orders.id, clientName: schema.orders.clientName })
    .from(schema.orders)
    .where(and(...conds))
    .limit(5);
}

export async function sendInvoiceEmail(orderId: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const order = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), isNull(schema.orders.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!order) throw new Error("Order not found.");
  if (!order.contactEmail) throw new Error("Order has no contact email.");
  const txns = await db
    .select()
    .from(schema.finance)
    .where(and(eq(schema.finance.orderId, orderId), isNull(schema.finance.deletedAt)));
  const paid = txns.filter((t) => t.type === "income").reduce((a, t) => a + Number(t.amount), 0);
  const total = Number(order.totalBudget);
  const due = Math.max(0, total - paid);
  const orderNum = formatOrderNumber(order.id, order.createdAt);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://app.kadamproduction.in";
  const invoiceUrl = `${baseUrl}/invoice/${orderId}`;
  const html = `
    <div style="max-width:500px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
      <div style="text-align:center;padding:24px 0">
        <h2 style="margin:0;color:#1e40af">Kadam Production</h2>
        <p style="color:#6b7280;font-size:13px">Invoice — ${escapeHtml(orderNum)}</p>
      </div>
      <p>Hello <strong>${escapeHtml(order.clientName)}</strong>,</p>
      <p>Thank you for choosing Kadam Production. Here is your invoice summary:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Order</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${orderNum}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Total Amount</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${formatINR(total)}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Advance Paid</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${formatINR(paid)}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Balance Due</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${formatINR(due)}</td></tr>
      </table>
      <a href="${invoiceUrl}" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">View Full Invoice</a>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
      <p style="font-size:12px;color:#6b7280">Kadam Production — ${new Date().getFullYear()}</p>
    </div>
  `;
  await sendEmail({ to: order.contactEmail, subject: `Invoice ${orderNum} — Kadam Production`, html });
}

export async function updateOrderStatus(id: number, status: string, completeMode?: "automatic" | "manual") {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");

  const [current] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, id), isNull(schema.orders.deletedAt)))
    .limit(1);
  if (!current) throw new Error("Order not found.");
  const fromStatus = current.status;
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status transition from ${fromStatus} to ${status}.`);
  }

  await db.update(schema.orders).set({ status: status as OrderStatus }).where(eq(schema.orders.id, id));

  if (status === "completed" && completeMode === "automatic") {
    await releaseOrderInventory(id, "available");
  } else if (status === "completed" && completeMode !== "automatic") {
    // Manual: keep items busy + linked so they can be checked in via scanner.
    // Do not clear currentOrderId here.
  } else if (status === "cancelled") {
    await releaseOrderInventory(id, "available");
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
}

export async function deleteOrder(id: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const [o] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, id), isNull(schema.orders.deletedAt)))
    .limit(1);
  if (!o) throw new Error("Order not found.");
  if (o.status === "ongoing") throw new Error("Cannot delete an ongoing order. Complete or cancel it first.");

  // Release inventory + clear reservations so soft-deleted orders don't inflate committed qty.
  await releaseOrderInventory(id, "available");
  await db.delete(schema.orderItems).where(eq(schema.orderItems.orderId, id));
  await db.update(schema.orders).set({ deletedAt: new Date() }).where(eq(schema.orders.id, id));
  revalidatePath("/orders");
}

export async function saveAssignments(orderId: number, employeeIds: number[]) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const [order] = await db
    .select({ clientName: schema.orders.clientName })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), isNull(schema.orders.deletedAt)))
    .limit(1)
    .then((r) => r);
  if (!order) throw new Error("Order not found.");

  // Only allow active employees.
  const uniqueIds = Array.from(new Set(employeeIds.filter((id) => typeof id === "number" && id > 0)));
  let validIds: number[] = [];
  if (uniqueIds.length) {
    const emps = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          inArray(schema.users.id, uniqueIds),
          eq(schema.users.role, "employee"),
          eq(schema.users.active, true),
          isNull(schema.users.deletedAt)
        )
      );
    validIds = emps.map((e) => e.id);
  }

  const existing = await db
    .select({ userId: schema.orderAssignments.userId })
    .from(schema.orderAssignments)
    .where(eq(schema.orderAssignments.orderId, orderId))
    .then((r) => r.map((x) => x.userId));

  // Diff-based update to avoid wipe-on-insert-failure.
  const toRemove = existing.filter((id) => !validIds.includes(id));
  const toAdd = validIds.filter((id) => !existing.includes(id));
  if (toRemove.length) {
    await db
      .delete(schema.orderAssignments)
      .where(
        and(eq(schema.orderAssignments.orderId, orderId), inArray(schema.orderAssignments.userId, toRemove))
      );
  }
  if (toAdd.length) {
    await db.insert(schema.orderAssignments).values(toAdd.map((userId) => ({ orderId, userId })));
    for (const uid of toAdd) {
      await createNotification({
        userId: uid,
        orderId,
        type: "order_assigned",
        title: "New Order Assignment",
        message: `You have been assigned to "${order.clientName || "Untitled"}" order.`,
        link: `/orders/${orderId}`,
      });
    }
  }
  revalidatePath(`/orders/${orderId}`);
}

export async function reserveItems(orderId: number, items: { itemId: number; qty: number }[]) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");

  const [order] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), isNull(schema.orders.deletedAt)))
    .limit(1);
  if (!order) throw new Error("Order not found.");
  if (order.status !== "upcoming" && order.status !== "ongoing") {
    throw new Error("Can only reserve items on upcoming or ongoing orders.");
  }

  for (const { itemId, qty } of items) {
    if (typeof qty !== "number" || isNaN(qty) || qty <= 0) continue;
    const [item] = await db
      .select({
        id: schema.items.id,
        quantity: schema.items.quantity,
        status: schema.items.status,
        deletedAt: schema.items.deletedAt,
      })
      .from(schema.items)
      .where(eq(schema.items.id, itemId))
      .limit(1);
    if (!item || item.deletedAt || item.status === "damaged") continue;

    // Committed qty across active non-deleted orders excluding this one.
    const [{ committed }] = await db
      .select({
        committed: sql<number>`coalesce(sum(${schema.orderItems.quantity}), 0)`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(
        and(
          eq(schema.orderItems.itemId, itemId),
          inArray(schema.orders.status, ["upcoming", "ongoing"]),
          isNull(schema.orders.deletedAt),
          ne(schema.orders.id, orderId)
        )
      );

    const existing = await db
      .select()
      .from(schema.orderItems)
      .where(and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.itemId, itemId)))
      .limit(1)
      .then((r) => r[0]);

    const alreadyOnOrder = existing?.quantity ?? 0;
    const free = Math.max(0, item.quantity - Number(committed ?? 0) - alreadyOnOrder);
    const addQty = Math.min(qty, free);
    if (addQty <= 0) continue;

    if (existing) {
      await db
        .update(schema.orderItems)
        .set({ quantity: existing.quantity + addQty })
        .where(eq(schema.orderItems.id, existing.id));
    } else {
      await db.insert(schema.orderItems).values({
        orderId,
        itemId,
        quantity: addQty,
        reservedAt: new Date(),
      });
    }
  }
  revalidatePath(`/orders/${orderId}`);
}

export async function unreserveItem(orderId: number, itemId: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");

  const [item] = await db
    .select({ currentOrderId: schema.items.currentOrderId, status: schema.items.status })
    .from(schema.items)
    .where(eq(schema.items.id, itemId))
    .limit(1);
  if (item?.currentOrderId === orderId) {
    await db
      .update(schema.items)
      .set({ status: "available", currentOrderId: null })
      .where(eq(schema.items.id, itemId));
  }

  await db
    .delete(schema.orderItems)
    .where(and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.itemId, itemId)));
  revalidatePath(`/orders/${orderId}`);
}

export async function markSetupDone(orderId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const [order] = await db
    .select({
      setupDone: schema.orders.setupDone,
      clientName: schema.orders.clientName,
      deletedAt: schema.orders.deletedAt,
    })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (!order || order.deletedAt) throw new Error("Order not found.");
  if (order.setupDone) {
    revalidatePath("/my-tasks");
    revalidatePath(`/orders/${orderId}`);
    return;
  }

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

  // Conditional update for idempotency under concurrency.
  await db
    .update(schema.orders)
    .set({ setupDone: 1 })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.setupDone, 0)));

  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "admin"), isNull(schema.users.deletedAt), eq(schema.users.active, true)));
  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      orderId,
      type: "setup_done",
      title: "Setup Completed",
      message: `${user.name} marked setup as done for "${order.clientName ?? "Untitled"}" order.`,
      link: `/orders/${orderId}`,
    });
  }
  revalidatePath("/my-tasks");
  revalidatePath(`/orders/${orderId}`);
}
