// src/lib/orders-queries.ts
import { and, eq, gte, lte, like, or, isNull, sql, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import type { OrderStatus } from "@/drizzle/schema";

export type OrderListRow = {
  id: number;
  clientName: string;
  contactPerson: string | null; // event name
  eventDate: string | null;
  setupDate: string | null;
  totalBudget: number;
  due: number;
  status: string;
  eventCategory: string | null;
};

export async function listOrders(filters: {
  status?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}): Promise<OrderListRow[]> {
  const conds = [isNull(schema.orders.deletedAt)];
  if (filters.status && filters.status !== "all") conds.push(eq(schema.orders.status, filters.status as OrderStatus));
  if (filters.year) conds.push(like(schema.orders.eventDate, `${filters.year}%`));
  if (filters.startDate) conds.push(gte(schema.orders.eventDate, filters.startDate));
  if (filters.endDate) conds.push(lte(schema.orders.eventDate, filters.endDate));
  if (filters.search) {
    const q = `%${filters.search}%`;
    conds.push(or(like(schema.orders.clientName, q), like(schema.orders.contactPerson, q), like(schema.orders.address, q))!);
  }

  const rows = await db
    .select({
      id: schema.orders.id,
      clientName: schema.orders.clientName,
      contactPerson: schema.orders.contactPerson,
      eventDate: schema.orders.eventDate,
      setupDate: schema.orders.setupDate,
      totalBudget: schema.orders.totalBudget,
      status: schema.orders.status,
      eventCategory: schema.orders.eventCategory,
      paid: sql<number>`coalesce((select sum(${schema.finance.amount}) from ${schema.finance} where ${schema.finance.orderId} = ${schema.orders.id} and ${schema.finance.type} = 'income' and ${schema.finance.deletedAt} is null),0)`,
    })
    .from(schema.orders)
    .where(and(...conds))
    .orderBy(sql`${schema.orders.eventDate} desc nulls last, ${schema.orders.id} desc`);

  return rows.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    contactPerson: r.contactPerson,
    eventDate: r.eventDate,
    setupDate: r.setupDate,
    totalBudget: Number(r.totalBudget ?? 0),
    due: Math.max(0, Number(r.totalBudget ?? 0) - Number(r.paid ?? 0)),
    status: r.status,
    eventCategory: r.eventCategory,
  }));
}

export async function statusCounts() {
  const rows = await db.select({ status: schema.orders.status, n: sql<number>`count(*)` }).from(schema.orders).where(isNull(schema.orders.deletedAt)).groupBy(schema.orders.status);
  const map: Record<string, number> = { all: 0, upcoming: 0, ongoing: 0, completed: 0, cancelled: 0 };
  for (const r of rows) {
    map[r.status] = Number(r.n);
    map.all += Number(r.n);
  }
  return map;
}

/** Full order detail for the Manage page — OPTIMIZED: single batch for committed quantities. */
export async function getOrderDetail(orderId: number) {
  const order = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), isNull(schema.orders.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!order) return null;

  const [orderItems, assignments, transactions, allItems, employees, subcategories, committedRows, categories, teams, teamMemberRows] = await Promise.all([
    db
      .select({
        id: schema.orderItems.id,
        itemId: schema.orderItems.itemId,
        name: schema.items.name,
        barcode: schema.items.barcode,
        quantity: schema.orderItems.quantity,
        reservedAt: schema.orderItems.reservedAt,
      })
      .from(schema.orderItems)
      .innerJoin(schema.items, eq(schema.orderItems.itemId, schema.items.id))
      .where(eq(schema.orderItems.orderId, orderId)),
    db
      .select({ userId: schema.orderAssignments.userId, name: schema.users.name })
      .from(schema.orderAssignments)
      .innerJoin(schema.users, eq(schema.orderAssignments.userId, schema.users.id))
      .where(eq(schema.orderAssignments.orderId, orderId)),
    db
      .select()
      .from(schema.finance)
      .where(and(eq(schema.finance.orderId, orderId), isNull(schema.finance.deletedAt))),
    db
      .select({
        id: schema.items.id,
        name: schema.items.name,
        categoryId: schema.items.categoryId,
        subcategoryId: schema.items.subcategoryId,
        quantity: schema.items.quantity,
        status: schema.items.status,
        subcategoryName: schema.subcategories.name,
      })
      .from(schema.items)
      .leftJoin(schema.subcategories, eq(schema.items.subcategoryId, schema.subcategories.id))
      .where(and(isNull(schema.items.deletedAt), inArray(schema.items.status, ["available", "busy"]))),
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.role, "employee"),
          eq(schema.users.active, true),
          isNull(schema.users.deletedAt)
        )
      ),
    db
      .select({
        id: schema.subcategories.id,
        name: schema.subcategories.name,
        categoryId: schema.subcategories.categoryId,
      })
      .from(schema.subcategories),
    db
      .select({
        itemId: schema.orderItems.itemId,
        committed: sql<number>`coalesce(sum(${schema.orderItems.quantity}), 0)`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .innerJoin(schema.items, eq(schema.orderItems.itemId, schema.items.id))
      .where(
        and(
          inArray(schema.orders.status, ["upcoming", "ongoing"]),
          isNull(schema.orders.deletedAt),
          sql`${schema.orderItems.orderId} <> ${orderId}`,
          isNull(schema.items.deletedAt),
          inArray(schema.items.status, ["available", "busy"])
        )
      )
      .groupBy(schema.orderItems.itemId),
    db.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories),
    db
      .select({ id: schema.teams.id, name: schema.teams.name, description: schema.teams.description })
      .from(schema.teams)
      .where(isNull(schema.teams.deletedAt)),
    db
      .select({
        teamId: schema.teamMembers.teamId,
        userId: schema.teamMembers.userId,
        name: schema.users.name,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
      .where(and(eq(schema.users.active, true), isNull(schema.users.deletedAt))),
  ]);

  const committedMap = Object.fromEntries(committedRows.map((r) => [r.itemId, Number(r.committed)]));
  const itemAvail: Record<number, number> = {};
  for (const it of allItems) {
    itemAvail[it.id] = Math.max(0, it.quantity - (committedMap[it.id] ?? 0));
  }

  const paid = transactions.filter((t) => t.type === "income").reduce((a, t) => a + Number(t.amount), 0);

  const teamsWithMembers = teams.map((t) => ({
    ...t,
    members: teamMemberRows.filter((m) => m.teamId === t.id).map((m) => ({ userId: m.userId, name: m.name })),
  }));

  return {
    order,
    orderItems,
    assignments,
    transactions,
    allItems,
    employees,
    subcategories,
    itemAvail,
    paid,
    categories,
    teams: teamsWithMembers,
  };
}
