// src/server/finance-actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { eq, gte, lte, isNull, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function createTransaction(input: { orderId?: number; type: "income" | "expense"; category: string; amount: number; description?: string; date: string }) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const amt = Number(input.amount);
  if (isNaN(amt) || amt <= 0) throw new Error("Amount must be a positive number.");
  if (input.type !== "income" && input.type !== "expense") throw new Error("Invalid transaction type.");
  if (!input.date) throw new Error("Date is required.");
  if (input.orderId) {
    const [order] = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, input.orderId), isNull(schema.orders.deletedAt)))
      .limit(1);
    if (!order) throw new Error("Order not found.");
  }
  await db.insert(schema.finance).values({
    orderId: input.orderId || null,
    type: input.type,
    category: input.category.trim() || "General",
    amount: amt,
    description: input.description || null,
    date: input.date,
  });
  revalidatePath("/finance");
}

export async function deleteTransaction(id: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  await db.update(schema.finance).set({ deletedAt: new Date() }).where(eq(schema.finance.id, id));
  revalidatePath("/finance");
}

export async function financeSummary(startDate?: string, endDate?: string) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const conds = [isNull(schema.finance.deletedAt)];
  if (startDate) conds.push(gte(schema.finance.date, startDate));
  if (endDate) conds.push(lte(schema.finance.date, endDate));
  const rows = await db.select().from(schema.finance).where(and(...conds));
  let income = 0, expense = 0;
  for (const r of rows) { if (r.type === "income") income += Number(r.amount); else expense += Number(r.amount); }
  return { totalIncome: income, totalExpenses: expense, netProfit: income - expense, transactions: rows };
}
