import { Suspense } from "react";
import { and, desc, asc, eq, gte, isNull, lte, sql, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { FinanceView } from "@/components/finance/FinanceView";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ startDate?: string; endDate?: string; type?: string; sort?: string; q?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  const sp = await searchParams;

  const conds = [isNull(schema.finance.deletedAt)];
  if (sp.startDate) conds.push(gte(schema.finance.date, sp.startDate));
  if (sp.endDate) conds.push(lte(schema.finance.date, sp.endDate));
  if (sp.type === "income") conds.push(eq(schema.finance.type, "income"));
  if (sp.type === "expense") conds.push(eq(schema.finance.type, "expense"));
  if (sp.q) {
    const q = `%${sp.q}%`;
    conds.push(sql`(${schema.finance.category} LIKE ${q} OR COALESCE(${schema.finance.description},'') LIKE ${q} OR COALESCE(${schema.orders.clientName},'') LIKE ${q})`);
  }

  const sortField = sp.sort || "date_desc";
  const orderBy = sortField === "date_asc" ? asc(schema.finance.date) : sortField === "amount_desc" ? desc(schema.finance.amount) : sortField === "amount_asc" ? asc(schema.finance.amount) : desc(schema.finance.date);

  // Due: filter differently — find orders with outstanding balance
  if (sp.type === "due") {
    const dueOrders = await db
      .select({
        id: schema.orders.id,
        totalBudget: schema.orders.totalBudget,
        paid: sql<number>`coalesce((select sum(${schema.finance.amount}) from ${schema.finance} where ${schema.finance.orderId} = ${schema.orders.id} and ${schema.finance.type} = 'income' and ${schema.finance.deletedAt} is null), 0)`,
        contactPhone: schema.orders.contactPhone,
      })
      .from(schema.orders)
      .where(and(isNull(schema.orders.deletedAt), sql`${schema.orders.status} != 'cancelled'`, sql`${schema.orders.totalBudget} > 0`));
    const dueOrderIds = dueOrders.filter((o) => Number(o.paid) < Number(o.totalBudget)).map((o) => o.id);
    if (dueOrderIds.length > 0) {
      conds.push(inArray(schema.finance.orderId, dueOrderIds));
    } else {
      conds.push(eq(schema.finance.id, 0)); // no results
    }
  }

  const [allResults, finOrders, summaryRows, dueRow] = await Promise.all([
    db
      .select({
        id: schema.finance.id,
        orderId: schema.finance.orderId,
        type: schema.finance.type,
        category: schema.finance.category,
        amount: schema.finance.amount,
        description: schema.finance.description,
        date: schema.finance.date,
        contactPhone: schema.orders.contactPhone,
        orderLabel: schema.orders.clientName,
      })
      .from(schema.finance)
      .leftJoin(schema.orders, eq(schema.finance.orderId, schema.orders.id))
      .where(and(...conds))
      .orderBy(orderBy),

    db.select({ id: schema.orders.id, clientName: schema.orders.clientName }).from(schema.orders).where(isNull(schema.orders.deletedAt)),

    (() => {
      const summaryConds = [isNull(schema.finance.deletedAt)];
      if (sp.startDate) summaryConds.push(gte(schema.finance.date, sp.startDate));
      if (sp.endDate) summaryConds.push(lte(schema.finance.date, sp.endDate));
      return db
        .select({
          totalIncome: sql<number>`coalesce(sum(case when ${schema.finance.type} = 'income' then ${schema.finance.amount} end), 0)`,
          totalExpense: sql<number>`coalesce(sum(case when ${schema.finance.type} = 'expense' then ${schema.finance.amount} end), 0)`,
        })
        .from(schema.finance)
        .where(and(...summaryConds));
    })(),

    db
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
      .where(and(isNull(schema.orders.deletedAt), sql`${schema.orders.status} != 'cancelled'`)),
  ]);

  const totalIncome = Number(summaryRows[0]?.totalIncome ?? 0);
  const totalExpense = Number(summaryRows[0]?.totalExpense ?? 0);
  const totalDue = Number(dueRow[0]?.v ?? 0);
  const summary = { totalIncome, totalExpenses: totalExpense, netProfit: totalIncome - totalExpense, totalDue };

  const transactions = allResults.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    orderLabel: r.orderLabel ?? null,
    type: r.type,
    category: r.category,
    amount: Number(r.amount),
    description: r.description,
    date: r.date,
    contactPhone: r.contactPhone,
  }));

  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading finance\u2026</div>}>
      <FinanceView
        transactions={transactions}
        summary={summary}
        orders={finOrders}
        startDate={sp.startDate}
        endDate={sp.endDate}
      />
    </Suspense>
  );
}
