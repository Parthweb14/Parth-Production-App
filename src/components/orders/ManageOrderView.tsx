// src/components/orders/ManageOrderView.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Input, Label, Select, Modal, Card } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { EVENT_CATEGORIES } from "@/drizzle/schema";
import { updateOrderStatus, saveAssignments, reserveItems, unreserveItem, updateOrder } from "@/server/order-actions";
import { formatINR, formatDateDMY } from "@/lib/utils";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
type SubCat = { id: number; name: string; categoryId: number };
type TeamType = { id: number; name: string; description: string | null; members: { userId: number; name: string }[] };

type Detail = {
  order: { id: number; clientName: string; contactPerson: string | null; contactPhone: string | null; contactEmail: string | null; transportContactName: string | null; transportContactPhone: string | null; eventDate: string | null; eventTime: string | null; setupDate: string | null; setupTime: string | null; address: string | null; billingAddress: string | null; totalBudget: number; status: string; eventCategory: string | null; gstEnabled: boolean | null; createdAt: Date | null };
  orderItems: { id: number; itemId: number; name: string; barcode: string; quantity: number; reservedAt: Date | null }[];
  assignments: { userId: number; name: string }[];
  allItems: { id: number; name: string; categoryId: number | null; subcategoryId: number | null; quantity: number; status: string; subcategoryName: string | null }[];
  itemAvail: Record<number, number>;
  paid: number;
  subcategories: { id: number; name: string; categoryId: number }[];
  categories: { id: number; name: string }[];
  employees: { id: number; name: string }[];
  teams: TeamType[];
};

export function ManageOrderView({ detail }: { detail: Detail }) {
  const { order, orderItems = [], assignments = [], allItems = [], itemAvail = {}, paid = 0, subcategories = [], categories = [], teams = [], employees = [] } = detail;
  if (!order) return <Card className="p-8 text-center"><p className="text-sm text-red-500">Order data unavailable.</p></Card>;
  const due = Math.max(0, Number(order.totalBudget) - paid);

  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [amountsVisible, setAmountsVisible] = useState(false);

  return (
    <div>
      <Link href="/orders" className="mb-4 inline-flex items-center gap-2 text-sm text-kp-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Orders
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Order #{order.id}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{order.clientName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAmountsVisible(!amountsVisible)}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/10"
          >
            {amountsVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {amountsVisible ? "Hide" : "Show"}
          </button>
          <StatusBadge status={order.status} />
          <Button variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="primary" onClick={() => setStatusOpen(true)}>Change Status</Button>
          <Link href={`/orders/${order.id}/invoice`}><Button variant="success">Invoice</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left sidebar: Order details + Workforce */}
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Order Details</h3>
            <DetailRow k="Client" v={order.clientName} />
            <DetailRow k="Category" v={order.eventCategory} />
            <DetailRow k="Event Date" v={formatDateDMY(order.eventDate)} />
            <DetailRow k="Event Time" v={order.eventTime} />
            <DetailRow k="Setup" v={`${formatDateDMY(order.setupDate)} ${order.setupTime ?? ""}`} />
            <DetailRow k="Phone" v={order.contactPhone} />
            <DetailRow k="Email" v={order.contactEmail} />
            <DetailRow k="Address" v={order.address} />
            <DetailRow k="Amount" v={formatINR(Number(order.totalBudget))} blur={!amountsVisible} />
            <DetailRow k="Paid" v={formatINR(paid)} blur={!amountsVisible} />
            <DetailRow k="Due" v={formatINR(due)} accent blur={!amountsVisible} />
          </Card>

          <WorkforceSection orderId={order.id} assigned={assignments} employees={employees} teams={teams} />
        </div>

        {/* Main: Inventory assignment (spans 2 cols on desktop) */}
        <div className="lg:col-span-2">
          <InventorySection
            orderId={order.id}
            orderItems={orderItems}
            allItems={allItems}
            itemAvail={itemAvail}
            subcategories={subcategories}
            categories={categories}
          />
        </div>
      </div>

      {editOpen && (
        <EditOrderModal
          order={order}
          onClose={() => setEditOpen(false)}
        />
      )}
      {statusOpen && (
        <ChangeStatusModal
          orderId={order.id}
          current={order.status}
          onClose={() => setStatusOpen(false)}
        />
      )}
    </div>
  );
}

function DetailRow({ k, v, accent, blur }: { k: string; v: unknown; accent?: boolean; blur?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-50 py-1.5 text-sm">
      <span className="text-gray-500">{k}</span>
      <span className={`text-right ${blur ? "blur-sm select-none" : ""} ${accent ? "font-bold text-kp-danger" : "font-medium text-gray-800"}`}>{(v as string) || "—"}</span>
    </div>
  );
}

function WorkforceSection({ orderId, assigned, employees, teams }: { orderId: number; assigned: { userId: number; name: string }[]; employees: { id: number; name: string }[]; teams: TeamType[] }) {
  const [sel, setSel] = useState<number[]>(assigned.map((a) => a.userId));
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const assignedIds = new Set(assigned.map((a) => a.userId));
  const selectedIds = new Set(sel);

  function toggle(id: number) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function toggleTeam(team: TeamType) {
    const memberIds = team.members.map((m) => m.userId).filter((uid) => uid !== undefined);
    const allSelected = memberIds.every((uid) => sel.includes(uid));
    setSel((s) => {
      if (allSelected) return s.filter((x) => !memberIds.includes(x));
      const add = memberIds.filter((x) => !s.includes(x));
      return [...s, ...add];
    });
  }

  const filtered = employees.filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()));
  const selCount = sel.length;
  const changed = selCount !== assigned.length || sel.some((id) => !assignedIds.has(id)) || assigned.some((a) => !sel.includes(a.userId));

  async function save() {
    setPending(true);
    try {
      await saveAssignments(orderId, sel);
    } catch (err) {
      alert((err as Error).message || "Failed to save assignments.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Assign Workforce</h3>
        {selCount > 0 && (
          <span className="rounded-full bg-kp-primary px-2.5 py-0.5 text-xs font-bold text-white">{selCount} selected</span>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search employees..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-kp-primary dark:border-gray-700 dark:bg-gray-800/30"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: '8px center', backgroundSize: '14px' }}
      />

      {/* Teams */}
      {teams.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Teams</p>
          {teams.filter((t) => t.members.length > 0).map((t) => {
            const memberIds = t.members.map((m) => m.userId);
            const allSelected = memberIds.every((uid) => sel.includes(uid));
            const someSelected = memberIds.some((uid) => sel.includes(uid));
            return (
              <div key={t.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-2.5 dark:border-gray-700 dark:bg-gray-800/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={() => toggleTeam(t)}
                      className="h-4 w-4 shrink-0 accent-kp-primary"
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="ml-1.5 text-xs text-gray-400">{t.members.length} member{t.members.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <div className="ml-6 mt-1.5 flex flex-wrap gap-1">
                  {t.members.map((m) => (
                    <button
                      key={m.userId}
                      onClick={() => toggle(m.userId)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition ${sel.includes(m.userId) ? "bg-kp-primary text-white" : "bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300"}`}
                    >
                      {m.name}
                      {assignedIds.has(m.userId) && <span className="opacity-60">(assigned)</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Individual employees */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">All Employees</p>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400">No employees match your search.</p>
        ) : (
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {filtered.map((e) => {
              const on = sel.includes(e.id);
              const isAssigned = assignedIds.has(e.id);
              const teamNames = teams.filter((t) => t.members.some((m) => m.userId === e.id)).map((t) => t.name);
              return (
                <label key={e.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition ${on ? "bg-kp-primary/5" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(e.id)}
                    className="h-4 w-4 accent-kp-primary"
                  />
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {e.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{e.name}</span>
                    {isAssigned && <span className="ml-1.5 text-xs text-green-600">✓ assigned</span>}
                    <div className="flex flex-wrap gap-1">
                      {teamNames.map((tn) => (
                        <span key={tn} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700">{tn}</span>
                      ))}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <Button className="mt-3 w-full" onClick={save} disabled={pending || !changed}>
        {pending ? "Saving…" : changed ? `Save Assignments (${selCount})` : "No changes"}
      </Button>
    </Card>
  );
}

function InventorySection({
  orderId,
  orderItems,
  allItems,
  itemAvail,
  subcategories,
  categories,
}: {
  orderId: number;
  orderItems: { id: number; itemId: number; name: string; barcode: string; quantity: number }[];
  allItems: { id: number; name: string; categoryId: number | null; subcategoryId: number | null; quantity: number; status: string; subcategoryName: string | null }[];
  itemAvail: Record<number, number>;
  subcategories: SubCat[];
  categories: { id: number; name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [selectedSub, setSelectedSub] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [pending, setPending] = useState(false);
  const [reservedOpen, setReservedOpen] = useState(true);

  const subToCat = new Map<number, number>();
  subcategories.forEach((s) => subToCat.set(s.id, s.categoryId));

  function itemCategoryId(it: (typeof allItems)[number]): number | null {
    return it.categoryId ?? (it.subcategoryId ? subToCat.get(it.subcategoryId) ?? null : null);
  }

  const catsWithItems = categories.filter((c) => allItems.some((i) => itemCategoryId(i) === c.id));
  const subcatsInCat = selectedCat !== null ? subcategories.filter((s) => s.categoryId === selectedCat) : [];

  const filtered = allItems.filter((it) => {
    if (selectedCat !== null && itemCategoryId(it) !== selectedCat) return false;
    if (selectedSub !== null && it.subcategoryId !== selectedSub) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const draftEntries = Object.entries(draft).filter(([, qty]) => qty > 0);
  const draftCount = draftEntries.length;
  const draftTotalQty = draftEntries.reduce((s, [, q]) => s + q, 0);
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  function setQty(itemId: number, qty: number) {
    const avail = itemAvail[itemId] ?? itemMap.get(itemId)?.quantity ?? 0;
    setDraft((d) => {
      const clamped = Math.min(avail, Math.max(0, qty));
      if (clamped === 0) { const n = { ...d }; delete n[itemId]; return n; }
      return { ...d, [itemId]: clamped };
    });
  }

  function clearDraftItem(itemId: number) {
    setDraft((d) => { const n = { ...d }; delete n[itemId]; return n; });
  }

  async function reserve() {
    const payload = draftEntries.map(([itemId, qty]) => ({ itemId: Number(itemId), qty }));
    if (!payload.length) return;
    setPending(true);
    try {
      await reserveItems(orderId, payload);
      setDraft({});
    } catch (err) {
      alert((err as Error).message || "Failed to reserve items.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Assign Inventory</h3>
        {draftCount > 0 && (
          <span className="rounded-full bg-kp-primary px-2.5 py-0.5 text-xs font-bold text-white">
            {draftCount} · {draftTotalQty}
          </span>
        )}
      </div>

      {orderItems.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setReservedOpen(!reservedOpen)}
            className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:bg-gray-800/30"
          >
            Reserved ({orderItems.length})
            <span className="text-gray-300">{reservedOpen ? "▲" : "▼"}</span>
          </button>
          {reservedOpen && (
            <ul className="mt-1.5 space-y-1">
              {orderItems.map((oi) => (
                <li key={oi.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm">
                  <span>{oi.name} <span className="text-gray-400">x{oi.quantity}</span></span>
                  <UnreserveBtn orderId={orderId} itemId={oi.itemId} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {orderItems.length === 0 && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Nothing reserved yet</p>
      )}

      <div className="relative mb-2.5">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-kp-primary dark:border-gray-700 dark:bg-gray-800/30"
        />
        <svg className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <button onClick={() => { setSelectedCat(null); setSelectedSub(null); }} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selectedCat === null ? "border-kp-primary bg-kp-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800/30 dark:text-gray-400"}`}>All</button>
        {catsWithItems.map((c) => (
          <button key={c.id} onClick={() => { setSelectedCat(c.id); setSelectedSub(null); }} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selectedCat === c.id ? "border-kp-primary bg-kp-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800/30 dark:text-gray-400"}`}>{c.name}</button>
        ))}
      </div>

      {selectedCat !== null && subcatsInCat.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button onClick={() => setSelectedSub(null)} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${selectedSub === null ? "border-kp-primary bg-kp-primary/10 text-kp-primary" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800/30 dark:text-gray-400"}`}>All</button>
          {subcatsInCat.map((s) => (
            <button key={s.id} onClick={() => setSelectedSub(s.id)} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${selectedSub === s.id ? "border-kp-primary bg-kp-primary/10 text-kp-primary" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800/30 dark:text-gray-400"}`}>{s.name}</button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No items match your filters.</p>
      ) : (
        <div className="max-h-64 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {filtered.map((it) => {
            const avail = itemAvail[it.id] ?? it.quantity;
            const draftQty = draft[it.id] ?? 0;
            const reservedQty = orderItems.find((oi) => oi.itemId === it.id)?.quantity ?? 0;
            const effectiveAvail = Math.max(0, avail - reservedQty);
            const remaining = effectiveAvail - draftQty;
            const pct = effectiveAvail > 0 ? Math.min(100, (remaining / effectiveAvail) * 100) : 0;
            const barColor = remaining > 5 ? "bg-green-400" : remaining > 2 ? "bg-yellow-400" : remaining > 0 ? "bg-orange-400" : "bg-red-400";
            return (
              <div key={it.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${draftQty > 0 ? "border-kp-primary bg-kp-primary/5" : "border-gray-100 hover:border-gray-200 dark:border-gray-700 dark:hover:border-gray-600"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{it.name}</span>
                    {it.subcategoryName && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700">{it.subcategoryName}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div className={`h-full rounded-full ${barColor} transition-all duration-200`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-xs font-medium ${remaining > 0 ? "text-gray-600" : "text-red-500"}`}>
                      {remaining > 0 ? `${remaining} left` : "out of stock"}
                    </span>
                    {draftQty > 0 && (
                      <span className="text-xs text-kp-primary font-medium">→ {draftQty} selected</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={effectiveAvail}
                    placeholder="qty"
                    value={draftQty || ""}
                    onChange={(e) => setQty(it.id, Number(e.target.value))}
                    className="h-8 w-14 rounded-lg border border-gray-200 bg-white text-center text-sm outline-none focus:border-kp-primary dark:border-gray-600 dark:bg-gray-800/30"
                  />
                  {draftQty > 0 && (
                    <button onClick={() => clearDraftItem(it.id)} className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-red-400 hover:bg-red-50 hover:text-red-600">×</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button className="mt-3 w-full shrink-0" variant="success" onClick={reserve} disabled={pending || draftCount === 0}>
        {pending ? "Reserving..." : `Reserve (${draftCount} item${draftCount !== 1 ? "s" : ""})`}
      </Button>
    </Card>
  );
}

function UnreserveBtn({ orderId, itemId }: { orderId: number; itemId: number }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await unreserveItem(orderId, itemId);
        } catch (err) {
          alert((err as Error).message || "Failed to remove item.");
          setPending(false);
        }
      }}
    >
      {pending ? "…" : "Remove"}
    </Button>
  );
}

function EditOrderModal({ order, onClose }: { order: Detail["order"]; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const f = new FormData(e.currentTarget);
      const input: Record<string, unknown> = {
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
        eventCategory: String(f.get("eventCategory") || ""),
        gstEnabled: f.get("gstEnabled") === "on",
      };
      await updateOrder(order.id, input);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Edit Order #${order.id}`}>
      <form onSubmit={submit} className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>Client Name</Label><Input name="clientName" defaultValue={order.clientName} required /></div>
          <div><Label>Phone</Label><Input name="contactPhone" defaultValue={order.contactPhone ?? ""} /></div>
          <div><Label>Event Name / Contact Person</Label><Input name="contactPerson" defaultValue={order.contactPerson ?? ""} /></div>
          <div><Label>Email</Label><Input name="contactEmail" defaultValue={order.contactEmail ?? ""} type="email" /></div>
          <div><Label>Transport Contact Name</Label><Input name="transportContactName" defaultValue={order.transportContactName ?? ""} /></div>
          <div><Label>Transport Contact Phone</Label><Input name="transportContactPhone" defaultValue={order.transportContactPhone ?? ""} /></div>
          <div><Label>Event Date</Label><Input name="eventDate" defaultValue={order.eventDate ?? ""} type="date" /></div>
          <div><Label>Event Time</Label><Input name="eventTime" defaultValue={order.eventTime ?? ""} type="time" /></div>
          <div><Label>Setup Date</Label><Input name="setupDate" defaultValue={order.setupDate ?? ""} type="date" /></div>
          <div><Label>Setup Time</Label><Input name="setupTime" defaultValue={order.setupTime ?? ""} type="time" /></div>
          <div><Label>Event Category</Label>
            <Select name="eventCategory" defaultValue={order.eventCategory ?? ""}>
              {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div><Label>Total Amount (\u20B9)</Label><Input name="totalBudget" type="number" min={0} defaultValue={order.totalBudget} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="gstEnabled" defaultChecked={!!order.gstEnabled} className="h-4 w-4 accent-kp-primary" />
          GST Invoice
        </label>
        <div><Label>Event Address</Label><textarea name="address" defaultValue={order.address ?? ""} rows={2} className="glass-input w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20" /></div>
        <div><Label>Billing Address</Label><textarea name="billingAddress" defaultValue={order.billingAddress ?? ""} rows={2} className="glass-input w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20" /></div>
        {error && <p className="text-sm text-kp-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving\u2026" : "Save Changes"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeStatusModal({ orderId, current, onClose }: { orderId: number; current: string; onClose: () => void }) {
  const ALLOWED: Record<string, string[]> = {
    upcoming: ["ongoing", "completed", "cancelled"],
    ongoing: ["completed", "cancelled"],
    completed: ["cancelled"],
    cancelled: [],
  };
  const nextOptions = ALLOWED[current] || [];
  const [status, setStatus] = useState(nextOptions[0] || current);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"automatic" | "manual" | null>(null);

  const completing = status === "completed";

  async function submit() {
    if (completing && !mode) { alert("Choose how inventory returns to the warehouse."); return; }
    setPending(true);
    try {
      await updateOrderStatus(orderId, status, mode || undefined);
      onClose();
    } catch (err) {
      alert((err as Error).message || "Failed to update status.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Change Order Status">
      <div className="space-y-4">
        <div>
          <Label>New Status</Label>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setMode(null); }}>
            {nextOptions.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </Select>
          {!nextOptions.length && (
            <p className="mt-2 text-xs text-gray-500">No further status transitions are available.</p>
          )}
        </div>

        {completing && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Take inventory back to warehouse?
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModeCard active={mode === "automatic"} onClick={() => setMode("automatic")} title="Automatic" desc="Immediately mark reserved/checked-out items as available in stock." />
              <ModeCard active={mode === "manual"} onClick={() => setMode("manual")} title="Manual" desc="Keep items checked out — return them later via the Scan Item page." />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !nextOptions.length}>{pending ? "Updating…" : "Update Status"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ModeCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${active ? "border-kp-primary bg-gray-50 ring-2 ring-gray-400/30 dark:bg-gray-800 dark:ring-gray-500/30" : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800/30 dark:hover:bg-gray-800/50"}`}
    >
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{desc}</p>
    </button>
  );
}
