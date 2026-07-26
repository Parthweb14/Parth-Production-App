"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, IndianRupee, Eye, EyeOff, Search, X, Phone, MessageCircle } from "lucide-react";
import { Button, Input, Select, Modal, Card, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { Fab } from "@/components/Fab";
import { createTransaction, deleteTransaction } from "@/server/finance-actions";
import { todayISO, formatDateDMY, formatINR } from "@/lib/utils";

type Tx = { id: number; orderId: number | null; orderLabel: string | null; type: string; category: string; amount: number; description: string | null; date: string | null; contactPhone?: string | null };
type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const SORT_OPTS = [
  { value: "date_desc", label: "Date \u2193 Recent" },
  { value: "date_asc", label: "Date \u2191 Old" },
  { value: "amount_desc", label: "Amount \u2193 High" },
  { value: "amount_asc", label: "Amount \u2191 Low" },
];

export function FinanceView({ summary, transactions, orders, startDate, endDate }: {
  summary: { totalIncome: number; totalExpenses: number; netProfit: number; totalDue: number };
  transactions: Tx[];
  orders: { id: number; clientName: string }[];
  startDate?: string;
  endDate?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [amountsVisible, setAmountsVisible] = useState(false);

  const typeFilter = sp.get("type") || "";
  const sort = (sp.get("sort") || "date_desc") as SortKey;
  const q = sp.get("q") || "";
  const hasDateFilter = Boolean(startDate || endDate);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    startTransition(() => router.replace(`/finance?${next.toString()}`));
  }
  function clearFilters() {
    startTransition(() => router.replace(`/finance?startDate=${startDate || ""}&endDate=${endDate || ""}`.replace(/\&[^=]+=$/g, "")));
  }

  const filtered = useMemo(() => {
    let list = [...transactions];
    if (typeFilter === "income") list = list.filter((t) => t.type === "income");
    else if (typeFilter === "expense") list = list.filter((t) => t.type === "expense");
    if (q) {
      const lq = q.toLowerCase();
      list = list.filter((t) =>
        (t.orderLabel || "").toLowerCase().includes(lq) ||
        t.category.toLowerCase().includes(lq) ||
        (t.description || "").toLowerCase().includes(lq)
      );
    }
    list.sort((a, b) => {
      if (sort === "date_asc") return (a.date || "").localeCompare(b.date || "");
      if (sort === "date_desc") return (b.date || "").localeCompare(a.date || "");
      if (sort === "amount_asc") return a.amount - b.amount;
      return b.amount - a.amount;
    });
    return list;
  }, [transactions, typeFilter, sort, q]);

  const hasActiveFilter = Boolean(typeFilter || q);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Finance</h1>
        <button
          onClick={() => setAmountsVisible(!amountsVisible)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {amountsVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {amountsVisible ? "Hide" : "Show"}
        </button>
      </div>

      {/* Summary cards - clickable */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={TrendingUp} label="Total Income" value={formatINR(summary.totalIncome)} bg="from-gray-800/20 to-gray-900/10 border-gray-200/40 dark:border-gray-700/40 text-gray-900 dark:text-gray-100" visible={amountsVisible} active={typeFilter === "income"} onClick={() => setParam("type", typeFilter === "income" ? "" : "income")} />
        <SummaryCard icon={TrendingDown} label="Total Expenses" value={formatINR(summary.totalExpenses)} bg="from-red-500/20 to-red-600/10 border-red-200/40 dark:border-red-500/20 text-red-700 dark:text-red-300" visible={amountsVisible} active={typeFilter === "expense"} onClick={() => setParam("type", typeFilter === "expense" ? "" : "expense")} />
        <SummaryCard icon={Wallet} label="Total Due" value={formatINR(summary.totalDue)} bg="from-gray-800/20 to-gray-900/10 border-gray-200/40 dark:border-gray-700/40 text-gray-900 dark:text-gray-100" visible={amountsVisible} active={typeFilter === "due"} onClick={() => setParam("type", typeFilter === "due" ? "" : "due")} />
        <SummaryCard icon={IndianRupee} label="Net Profit" value={formatINR(summary.netProfit)} bg="from-gray-800/20 to-gray-900/10 border-gray-200/40 dark:border-gray-700/40 text-gray-900 dark:text-gray-100" visible={amountsVisible} />
      </div>

      {/* Filters */}
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <div className="flex-1 min-w-[160px]"><label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Start</label><Input type="date" value={startDate || ""} onChange={(e) => setParam("startDate", e.target.value)} /></div>
        <div className="flex-1 min-w-[160px]"><label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">End</label><Input type="date" value={endDate || ""} onChange={(e) => setParam("endDate", e.target.value)} /></div>
        <div className="min-w-[140px]"><label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Sort</label>
          <select value={sort} onChange={(e) => setParam("sort", e.target.value)} className="glass-input h-10 w-full rounded-lg px-3 text-sm text-gray-900 outline-none dark:text-gray-100">
            {SORT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </Card>

      {/* Search */}
      {hasDateFilter && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
            placeholder="Search by client, category, or description\u2026"
            className="glass-input h-10 w-full rounded-lg pl-9 pr-8 text-sm outline-none"
          />
          {q && (
            <button onClick={() => setParam("q", "")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Active filter indicator */}
      {hasActiveFilter && (
        <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
          <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
            {typeFilter ? (typeFilter === "due" ? "Due entries" : `${typeFilter} entries`) : "All entries"}
          </span>
          {q && <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">Search: &ldquo;{q}&rdquo;</span>}
          <button onClick={clearFilters} className="ml-auto font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">Clear</button>
        </div>
      )}

      {!hasDateFilter ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a date range to view transactions.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState title="No transactions match" hint="Try adjusting filters or search." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Order / Client</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDateDMY(t.date)}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100 max-w-[180px] truncate">{t.orderLabel ?? "General"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.category}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.type} /></td>
                      <td className={`px-4 py-3 font-semibold whitespace-nowrap ${amountsVisible ? "" : "blur-sm select-none"} ${t.type === "income" ? "text-kp-success" : "text-kp-danger"}`}>
                        {t.type === "income" ? "+" : "\u2212"}{formatINR(t.amount)}
                      </td>
                      <td className="px-4 py-3">
                        {t.contactPhone ? (
                          <div className="flex gap-1.5">
                            <a href={`tel:${t.contactPhone}`} className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition" title="Call">
                              <Phone className="h-4 w-4" />
                            </a>
                            <a href={`https://wa.me/${t.contactPhone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition" title="WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right"><DelBtn id={t.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Fab onClick={() => setAddOpen(true)} label="Add entry" />
      {addOpen && <AddModal orders={orders} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, bg, visible, active, onClick }: {
  icon: typeof TrendingUp; label: string; value: string; bg: string; visible: boolean; active?: boolean; onClick?: () => void;
}) {
  const className = `glass bg-gradient-to-br ${bg} flex items-center gap-3 rounded-xl p-4 shadow-sm text-left transition-all ${onClick ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer" : "cursor-default"} ${active ? "ring-2 ring-gray-900 dark:ring-gray-100" : ""}`;
  const body = (
    <>
      <Icon className="h-8 w-8 opacity-80 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs opacity-80 truncate">{label}</p>
        <p className={`text-xl font-bold ${visible ? "" : "blur-sm select-none"}`}>{value}</p>
      </div>
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function AddModal({ orders, onClose }: { orders: { id: number; clientName: string }[]; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await createTransaction({
        orderId: Number(f.get("orderId")) || undefined,
        type: String(f.get("type")) as "income" | "expense",
        category: String(f.get("category")),
        amount: Number(f.get("amount")),
        description: String(f.get("description") || ""),
        date: String(f.get("date")),
      });
      onClose();
    } catch (err) { alert((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Add Finance Entry">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Order (optional)</label><Select name="orderId" defaultValue=""><option value="">General (no order)</option>{orders.map((o) => <option key={o.id} value={o.id}>#{o.id} {o.clientName}</option>)}</Select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label><Select name="type" defaultValue="income"><option value="income">Income</option><option value="expense">Expense</option></Select></div>
          <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label><Input name="category" placeholder="Advance Payment, Transport\u2026" required defaultValue="Advance Payment" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount (\u20B9)</label><Input name="amount" type="number" min="0.01" step="0.01" required /></div>
          <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label><Input name="date" type="date" required defaultValue={todayISO()} /></div>
        </div>
        <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label><Input name="description" /></div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving\u2026" : "Add Entry"}</Button></div>
      </form>
    </Modal>
  );
}

function DelBtn({ id }: { id: number }) {
  const [pending, setPending] = useState(false);
  return <Button size="sm" variant="danger" disabled={pending} onClick={async () => { if (confirm("Delete this entry?")) { setPending(true); try { await deleteTransaction(id); } catch (e) { alert((e as Error).message); setPending(false); } } }}>{pending ? "\u2026" : "Delete"}</Button>;
}
