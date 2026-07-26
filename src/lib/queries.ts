// src/lib/queries.ts — data fetchers (Turso reads) - OPTIMIZED
import { count, eq, and, isNull, inArray, sql, ne } from "drizzle-orm";
import { db, schema } from "./db";
import type { ItemStatus, OrderStatus } from "@/drizzle/schema";

/** Committed quantity of an item across active orders (optionally on a given event date). */
export async function committedQty(itemId: number, onDate?: string): Promise<number> {
  const activeStatuses: OrderStatus[] = ["upcoming", "ongoing"];
  const conditions = [
    eq(schema.orderItems.itemId, itemId),
    inArray(schema.orders.status, activeStatuses),
    isNull(schema.orders.deletedAt),
  ];
  if (onDate) conditions.push(eq(schema.orders.eventDate, onDate));

  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${schema.orderItems.quantity}),0)` })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(and(...conditions));

  return Number(rows[0]?.total ?? 0);
}

export type ItemRow = {
  id: number;
  name: string;
  barcode: string;
  categoryId: number | null;
  categoryName: string | null;
  subcategoryId: number | null;
  subcategoryName: string | null;
  description: string | null;
  quantity: number;
  status: ItemStatus;
  committed: number; // across active orders (all dates)
  available: number;
};

/** Inventory list with computed availability - OPTIMIZED: single query with LEFT JOIN */
export async function listItems(opts?: { categoryId?: number; subcategoryId?: number; search?: string; onDate?: string }): Promise<ItemRow[]> {
  const conds = [isNull(schema.items.deletedAt)];
  if (opts?.categoryId) conds.push(eq(schema.items.categoryId, opts.categoryId));
  if (opts?.subcategoryId) conds.push(eq(schema.items.subcategoryId, opts.subcategoryId));
  if (opts?.search) conds.push(sql`upper(${schema.items.name}) like ${"%" + opts.search.toUpperCase() + "%"}`);

  const activeStatuses: OrderStatus[] = ["upcoming", "ongoing"];
  const committedConds = [inArray(schema.orders.status, activeStatuses), isNull(schema.orders.deletedAt)];
  if (opts?.onDate) committedConds.push(eq(schema.orders.eventDate, opts.onDate));

  // Single query with LEFT JOINs to get committed quantities.
  // C6 fix: the orderItems JOIN is unfiltered, so an item's orderItems from
  // cancelled/completed orders also match. The status filter lives on the
  // orders LEFT JOIN ON, which NULLs out orders.* for non-active orders but
  // leaves the orderItem row in place. We therefore gate the summed quantity
  // on orders.id being non-null so only orderItems tied to active orders count.
  const rows = await db
    .select({
      id: schema.items.id,
      name: schema.items.name,
      barcode: schema.items.barcode,
      categoryId: schema.items.categoryId,
      categoryName: schema.categories.name,
      subcategoryId: schema.items.subcategoryId,
      subcategoryName: schema.subcategories.name,
      description: schema.items.description,
      quantity: schema.items.quantity,
      status: schema.items.status,
      committed: sql<number>`coalesce(sum(case when ${schema.orders.id} is not null then ${schema.orderItems.quantity} else 0 end), 0)`,
    })
    .from(schema.items)
    .leftJoin(schema.categories, eq(schema.items.categoryId, schema.categories.id))
    .leftJoin(schema.subcategories, eq(schema.items.subcategoryId, schema.subcategories.id))
    .leftJoin(schema.orderItems, eq(schema.items.id, schema.orderItems.itemId))
    .leftJoin(schema.orders, and(eq(schema.orderItems.orderId, schema.orders.id), ...committedConds))
    .where(and(...conds))
    .groupBy(
      schema.items.id,
      schema.items.name,
      schema.items.barcode,
      schema.items.categoryId,
      schema.categories.name,
      schema.items.subcategoryId,
      schema.subcategories.name,
      schema.items.description,
      schema.items.quantity,
      schema.items.status
    );

  return rows.map((r) => ({
    ...r,
    committed: Number(r.committed ?? 0),
    // FIX: damaged items report 0 available — they cannot be booked regardless
    // of quantity, preventing operators from reserving out-of-service stock.
    available: r.status === "damaged" ? 0 : Math.max(0, r.quantity - Number(r.committed ?? 0)),
  }));
}

/** Dashboard stats - OPTIMIZED: single query with conditional aggregation */
export async function getDashboardStats() {
  const [itemsAgg, ordersAgg, employeesAgg, categoriesAgg] = await Promise.all([
    db
      .select({
        totalItems: count(),
        available: sql<number>`count(case when ${schema.items.status} = 'available' then 1 end)`,
        busy: sql<number>`count(case when ${schema.items.status} = 'busy' then 1 end)`,
        damaged: sql<number>`count(case when ${schema.items.status} = 'damaged' then 1 end)`,
      })
      .from(schema.items)
      .where(isNull(schema.items.deletedAt)),
    db
      .select({
        ongoingOrders: sql<number>`count(case when ${schema.orders.status} = 'ongoing' then 1 end)`,
        upcomingOrders: sql<number>`count(case when ${schema.orders.status} = 'upcoming' then 1 end)`,
      })
      .from(schema.orders)
      .where(isNull(schema.orders.deletedAt)),
    db
      .select({ v: count() })
      .from(schema.users)
      .where(and(isNull(schema.users.deletedAt), eq(schema.users.role, "employee"), eq(schema.users.active, true))),
    db.select({ v: count() }).from(schema.categories),
  ]);

  return {
    totalItems: Number(itemsAgg[0]?.totalItems ?? 0),
    available: Number(itemsAgg[0]?.available ?? 0),
    busy: Number(itemsAgg[0]?.busy ?? 0),
    damaged: Number(itemsAgg[0]?.damaged ?? 0),
    ongoingOrders: Number(ordersAgg[0]?.ongoingOrders ?? 0),
    upcomingOrders: Number(ordersAgg[0]?.upcomingOrders ?? 0),
    employees: Number(employeesAgg[0]?.v ?? 0),
    categories: Number(categoriesAgg[0]?.v ?? 0),
  };
}

export async function countAssignedOrders(userId: number) {
  const [r] = await db
    .select({ v: count() })
    .from(schema.orderAssignments)
    .innerJoin(schema.orders, eq(schema.orderAssignments.orderId, schema.orders.id))
    .where(and(eq(schema.orderAssignments.userId, userId), ne(schema.orders.status, "cancelled")));
  return r?.v ?? 0;
}

/** Finance totals - OPTIMIZED: single query with conditional aggregation */
export async function getFinanceTotals() {
  const [row] = await db
    .select({
      totalIncome: sql<number>`coalesce(sum(case when ${schema.finance.type} = 'income' then ${schema.finance.amount} end), 0)`,
      totalExpense: sql<number>`coalesce(sum(case when ${schema.finance.type} = 'expense' then ${schema.finance.amount} end), 0)`,
    })
    .from(schema.finance)
    .where(isNull(schema.finance.deletedAt));

  const totalIncome = Number(row?.totalIncome ?? 0);
  const totalExpense = Number(row?.totalExpense ?? 0);

  // Total Due = sum of (budget - paid) across non-cancelled orders
  const [dueRow] = await db
    .select({
      v: sql<number>`coalesce(sum(
        case when ${schema.orders.totalBudget} > 0
        then max(0, ${schema.orders.totalBudget} - coalesce((
          select sum(${schema.finance.amount}) from ${schema.finance}
          where ${schema.finance.orderId} = ${schema.orders.id}
          and ${schema.finance.type} = 'income'
          and ${schema.finance.deletedAt} is null
        ), 0))
        else 0 end
      ), 0)`,
    })
    .from(schema.orders)
    .where(and(isNull(schema.orders.deletedAt), sql`${schema.orders.status} != 'cancelled'`));

  const totalDue = Number(dueRow?.v ?? 0);
  const netProfit = totalIncome - totalExpense;

  return { totalIncome, totalExpense, totalDue, netProfit };
}