// src/components/orders/OrdersView.tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button, Input, Select, Modal, Label, Card, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { Fab } from "@/components/Fab";
import { EVENT_CATEGORIES } from "@/drizzle/schema";
import { createOrder, deleteOrder, checkEmailDuplicate, sendInvoiceEmail } from "@/server/order-actions";
import type { OrderListRow } from "@/lib/orders-queries";
import { formatINR, formatDateDMY } from "@/lib/utils";

type Props = {
  orders: OrderListRow[];
  counts: Record<string, number>;
  filters: Record<string, string>;
  hasFilter: boolean;
  openNew: boolean;
};

const STATUS_OPTS: { value: string; label: string }[] = [
  { value: "all", label: "All Orders" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function OrdersView({ orders, counts, filters, hasFilter, openNew }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(openNew);
  const [filterOpen, setFilterOpen] = useState(false);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`/orders?${next.toString()}`));
  }
  function clearFilters() {
    startTransition(() => router.replace("/orders"));
  }
  function closeCreateForm() {
    setCreateOpen(false);
    const next = new URLSearchParams(sp.toString());
    if (next.has("new")) { next.delete("new"); router.replace(`/orders?${next.toString()}`); }
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Orders</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Filter by status, date, or search — defaults to all orders</p>
        </div>
      </div>

      {/* Filter bar — collapsible on mobile */}
      <Card className="mb-4 p-3">
        <button onClick={() => setFilterOpen(!filterOpen)} className="flex w-full items-center justify-between text-left lg:hidden">
          <span className="text-sm font-semibold text-gray-700">
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
          </span>
          <svg className={`h-5 w-5 text-gray-500 transition-transform ${filterOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        <div className={`${filterOpen || "hidden"} mt-3 lg:mt-0 lg:block`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label>Status</Label>
            <Select value={filters.status || "all"} onChange={(e) => setFilter("status", e.target.value)}>
              {STATUS_OPTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label} ({counts[s.value] ?? 0})</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Start Date</Label>
            <Input type="date" value={filters.startDate || ""} onChange={(e) => setFilter("startDate", e.target.value)} />
          </div>
          <div>
            <Label>End Date</Label>
            <Input type="date" value={filters.endDate || ""} onChange={(e) => setFilter("endDate", e.target.value)} />
          </div>
          <div>
            <Label>Year</Label>
            <Select value={filters.year || ""} onChange={(e) => setFilter("year", e.target.value)}>
              <option value="">All years</option>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="client / address" className="pl-9" defaultValue={filters.search || ""} onBlur={(e) => setFilter("search", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setFilter("search", e.currentTarget.value); }} />
            </div>
          </div>
        </div>
        {activeFilterCount > 0 && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4" /> Clear Filters</Button>
          </div>
        )}
        </div>
      </Card>

      {/* Empty / list */}
      {!hasFilter ? (
        <EmptyState title="Select a status or date to view orders" hint="Filters keep the list fast and focused." />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders match your filters" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <p className="px-4 pt-3 text-xs text-gray-500 md:hidden">Swipe sideways to see all columns</p>
            <table className="w-full min-w-[640px] text-left text-sm md:min-w-[900px]">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Event Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">#{o.id}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{o.clientName}</td>
                    <td className="px-4 py-3 text-gray-600">{o.eventCategory ?? "Other"}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateDMY(o.eventDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatINR(o.totalBudget)}</td>
                    <td className="px-4 py-3 font-semibold text-kp-danger">{o.status === "cancelled" ? "—" : formatINR(o.due)}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3">
                      {/* Improvement #7: actions (incl. Delete) always visible, incl. mobile */}
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Link href={`/orders/${o.id}/invoice`}><Button size="sm" variant="success">Invoice</Button></Link>
                        <Link href={`/orders/${o.id}`}><Button size="sm" variant="primary">Manage</Button></Link>
                        <DeleteOrderBtn id={o.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Fab onClick={() => setCreateOpen(true)} label="New order" />
      {createOpen && <CreateModal onClose={closeCreateForm} />}
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSend, setAutoSend] = useState(false);
  const [gstEnabled, setGstEnabled] = useState(false);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DRAFT_KEY = "kp_new_order_draft";
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const form = document.querySelector<HTMLFormElement>("#create-order-form");
        if (form) {
          Object.entries(data).forEach(([name, value]) => {
            const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
            if (el) el.value = String(value);
          });
        }
      } catch { /* ignore corrupt draft */ }
    }
  }, []);
  function saveDraft() {
    const form = document.querySelector<HTMLFormElement>("#create-order-form");
    if (!form) return;
    const fd = new FormData(form);
    const data: Record<string, string> = {};
    fd.forEach((v, k) => { data[k] = String(v); });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    localStorage.removeItem(DRAFT_KEY);
    try {
      const f = new FormData(e.currentTarget);
      const id = await createOrder({
        clientName: String(f.get("clientName")),
        contactPerson: String(f.get("contactPerson") || ""),
        contactPhone: String(f.get("contactPhone") || ""),
        contactEmail: String(f.get("contactEmail") || ""),
        transportContactName: String(f.get("transportContactName") || ""),
        transportContactPhone: String(f.get("transportContactPhone") || ""),
        eventDate: String(f.get("eventDate") || ""),
        eventTime: String(f.get("eventTime") || ""),
        setupDate: String(f.get("setupDate") || ""),
        setupTime: String(f.get("setupTime") || ""),
        address: String(f.get("address") || ""),
        billingAddress: String(f.get("billingAddress") || ""),
        totalBudget: Number(f.get("totalBudget") || 0),
        advancePayment: Number(f.get("advancePayment") || 0),
        eventCategory: String(f.get("eventCategory") || "Other"),
        gstEnabled,
      });
      if (id) {
        if (autoSend && String(f.get("contactEmail") || "").trim()) {
          try { await sendInvoiceEmail(id); } catch { /* email send failure is non-blocking */ }
        }
        router.push(`/orders/${id}`);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Create New Order" className="max-w-2xl">
      <form id="create-order-form" onSubmit={submit} className="space-y-4" onChange={() => saveDraft()}>
        {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>Client Name *</Label><Input name="clientName" required /></div>
          <div><Label>Contact Phone</Label><Input name="contactPhone" /></div>
          <div><Label>Event Name / Contact Person</Label><Input name="contactPerson" /></div>
          <div className="sm:col-span-2">
            <Label>Contact Email</Label>
            <Input name="contactEmail" type="email" onBlur={(e) => {
              const v = e.target.value;
              if (v && v.toLowerCase() !== v) {
                e.target.value = v.toLowerCase();
                const warn = document.getElementById("email-case-warn");
                if (warn) warn.textContent = "Converted to lowercase. Please use all lowercase letters for email.";
              }
            }} onChange={(e) => {
              const v = e.target.value.trim().toLowerCase();
              const warn = document.getElementById("email-dup-warn");
              if (!warn) return;
              if (v.length < 5 || !v.includes("@")) { warn.textContent = ""; return; }
              if (emailTimer.current) clearTimeout(emailTimer.current);
              emailTimer.current = setTimeout(async () => {
                try {
                  const res = await checkEmailDuplicate(v);
                  if (res.length > 0) {
                    warn.textContent = `This email is used for order #${res[0].id} (${res[0].clientName}).`;
                  } else {
                    warn.textContent = "";
                  }
                } catch { warn.textContent = ""; }
              }, 400);
            }} />
            <p id="email-case-warn" className="mt-1 text-xs text-kp-warning"></p>
            <p id="email-dup-warn" className="mt-1 text-xs text-kp-warning"></p>
            <label className="mt-1 flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="h-4 w-4 accent-kp-primary" />
              Auto-send invoice to this email on creation
            </label>
          </div>
          <div><Label>Transport Contact Name</Label><Input name="transportContactName" /></div>
          <div><Label>Transport Contact Phone</Label><Input name="transportContactPhone" /></div>
          <div><Label>Event Date</Label><Input name="eventDate" type="date" /></div>
          <div><Label>Event Time</Label><Input name="eventTime" type="time" /></div>
          <div><Label>Setup Date</Label><Input name="setupDate" type="date" /></div>
          <div><Label>Setup Time</Label><Input name="setupTime" type="time" /></div>
          {/* Improvement #6 — event categories */}
          <div>
            <Label>Event Category</Label>
            <Select name="eventCategory" defaultValue="Other">
              {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div><Label>Total Amount (₹)</Label><Input name="totalBudget" type="number" min={0} defaultValue={0} /></div>
          <div><Label>Advance Payment (₹)</Label><Input name="advancePayment" type="number" min={0} defaultValue={0} /></div>
        </div>
        <div><Label>Billing Address</Label><Input name="billingAddress" /></div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} className="h-4 w-4 accent-kp-primary" />
          GST Invoice
        </label>
        <div><Label>Event Address</Label><Input name="address" /></div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create Order"}</Button></div>
      </form>
    </Modal>
  );
}

function DeleteOrderBtn({ id }: { id: number }) {
  const [pending, setPending] = useState(false);
  async function run() {
    if (!confirm(`Delete order #${id}?`)) return;
    setPending(true);
    try { await deleteOrder(id); } catch (e) { alert((e as Error).message); setPending(false); }
  }
  return <Button size="sm" variant="danger" onClick={run} disabled={pending}>{pending ? "…" : "Delete"}</Button>;
}
