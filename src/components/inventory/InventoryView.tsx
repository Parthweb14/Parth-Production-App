// src/components/inventory/InventoryView.tsx
"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FolderOpen, Layers, Search, Printer } from "lucide-react";
import { useState } from "react";
import { Button, Input, Label, Select, Modal, Card, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { Fab } from "@/components/Fab";
import { createItem, updateItem, quickUpdateQty, deleteItem } from "@/server/inventory-actions";
import type { ItemRow } from "@/lib/queries";

type SubCat = { id: number; name: string; categoryId: number };
type Props = {
  categories: { id: number; name: string }[];
  subcategories: SubCat[];
  items: ItemRow[];
  date: string;
};

export function InventoryView({ categories, subcategories, items, date }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("");
  const [subFilter, setSubFilter] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ItemRow | null>(null);
  const [qtyItem, setQtyItem] = useState<ItemRow | null>(null);
  const [printItem, setPrintItem] = useState<ItemRow | null>(null);

  function setDate(d: string) {
    startTransition(() => router.replace(`/inventory?date=${d}`));
  }

  const filteredSubs = catFilter ? subcategories.filter((s) => String(s.categoryId) === catFilter) : subcategories;

  const filtered = items.filter(
    (i) =>
      (!search || i.name.includes(search.toUpperCase())) &&
      (!catFilter || String(i.categoryId) === catFilter) &&
      (!subFilter || String(i.subcategoryId) === subFilter)
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">Stock availability as of the selected date</p>
        </div>
        <div>
          <Label className="mb-1">Availability Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-48" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={FolderOpen} tone="primary" label="Total Categories" value={categories.length} />
        <SummaryCard icon={Layers} tone="success" label="Total Subcategories" value={subcategories.length} />
      </div>

      {/* Filters */}
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setSubFilter(""); }} className="sm:w-48">
            <option value="">All categories</option>
            {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </Select>
          <Select value={subFilter} onChange={(e) => setSubFilter(e.target.value)} className="sm:w-48">
            <option value="">All sub-categories</option>
            {filteredSubs.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden pb-16 sm:pb-0">
        {filtered.length === 0 ? (
          <EmptyState title="No items found" hint="Use the + button to add inventory." />
        ) : (
          <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <p className="px-4 pt-3 text-xs text-gray-500 md:hidden">Swipe sideways to see all columns</p>
            <table className="w-full min-w-[640px] text-left text-sm md:min-w-[860px]">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Category</th>
                  <th className="hidden px-4 py-3 md:table-cell">Sub-Category</th>
                  <th className="px-4 py-3">Barcode</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Available</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((it) => (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{it.name}</div>
                      {it.description && <div className="text-xs text-gray-400">{it.description}</div>}
                      <div className="mt-1 text-xs text-gray-500 sm:hidden">{it.categoryName ?? "—"}{it.subcategoryName ? ` · ${it.subcategoryName}` : ""}</div>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">{it.categoryName ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-gray-600 md:table-cell">{it.subcategoryName ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      <span className="break-all">{it.barcode}</span>
                      <button onClick={() => setPrintItem(it)} className="ml-1 text-gray-500 hover:text-gray-700" title="Print barcode"><Printer className="inline h-3.5 w-3.5" /></button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold">{it.quantity}</span>
                        <button onClick={() => setQtyItem(it)} className="ml-1 rounded px-1.5 text-xs font-bold text-kp-primary hover:bg-gray-50 dark:hover:bg-gray-800">±</button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${it.available === 0 ? "text-kp-danger" : "text-kp-success"}`}>{it.available}</span>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell"><StatusBadge status={it.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="warning" onClick={() => setEditItem(it)}>Edit</Button>
                        <DeleteBtn id={it.id} name={it.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Fab onClick={() => setAddOpen(true)} label="Add item" />

      {addOpen && <AddModal categories={categories} subcategories={subcategories} onClose={() => setAddOpen(false)} />}
      {editItem && <EditModal item={editItem} categories={categories} subcategories={subcategories} onClose={() => setEditItem(null)} />}
      {qtyItem && <QtyModal item={qtyItem} onClose={() => setQtyItem(null)} />}
      {printItem && <PrintBarcodeModal item={printItem} onClose={() => setPrintItem(null)} />}
    </div>
  );
}

function SummaryCard({ icon: Icon, tone, label, value }: { icon: React.ComponentType<{ className?: string }>; tone: string; label: string; value: number }) {
  const tones: Record<string, string> = { primary: "bg-kp-primary text-white", success: "bg-kp-success text-white", warning: "bg-kp-warning text-black", danger: "bg-kp-danger text-white" };
  return (
    <div className={`flex items-center gap-3 rounded-xl p-4 ${tones[tone]}`}>
      <Icon className="h-7 w-7 opacity-80" />
      <div><div className="text-xs opacity-80">{label}</div><div className="text-xl font-bold">{value}</div></div>
    </div>
  );
}

function AddModal({ categories, subcategories, onClose }: { categories: { id: number; name: string }[]; subcategories: { id: number; name: string; categoryId: number }[]; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [selCat, setSelCat] = useState("");
  const filteredSubs = selCat ? subcategories.filter((s) => String(s.categoryId) === selCat) : subcategories;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await createItem({
        name: String(f.get("name")),
        categoryId: Number(f.get("categoryId")) || undefined,
        subcategoryId: Number(f.get("subcategoryId")) || undefined,
        description: String(f.get("description") || ""),
        quantity: Number(f.get("quantity")),
      });
      onClose();
    } catch (err) { alert((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Add New Item">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Master Category</Label>
          <Select name="categoryId" onChange={(e) => setSelCat(e.target.value)}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </div>
        <div>
          <Label>Sub-Category</Label>
          <Select name="subcategoryId"><option value="">—</option>{filteredSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </div>
        <div><Label>Item Name *</Label><Input name="name" required placeholder="e.g. SPEAKER JBL" /></div>
        <div><Label>Description</Label><Input name="description" placeholder="Item description / specs" /></div>
        <div><Label>Quantity *</Label><Input name="quantity" type="number" min={0} required defaultValue={1} /></div>
        <p className="text-xs text-gray-400">Barcode is auto-generated (KP…) on save.</p>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add Item"}</Button></div>
      </form>
    </Modal>
  );
}

function EditModal({ item, categories, subcategories, onClose }: { item: ItemRow; categories: { id: number; name: string }[]; subcategories: { id: number; name: string; categoryId: number }[]; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [selCat, setSelCat] = useState(String(item.categoryId ?? ""));
  const filteredSubs = selCat ? subcategories.filter((s) => String(s.categoryId) === selCat) : subcategories;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await updateItem(item.id, {
        name: String(f.get("name")),
        categoryId: Number(f.get("categoryId")) || null,
        subcategoryId: Number(f.get("subcategoryId")) || null,
        description: String(f.get("description") || ""),
        quantity: Number(f.get("quantity")),
        status: String(f.get("status")),
        newBarcode: String(f.get("newBarcode") || ""),
      });
      onClose();
    } catch (err) { alert((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Edit Item">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Master Category</Label>
          <Select name="categoryId" defaultValue={item.categoryId ?? ""} onChange={(e) => setSelCat(e.target.value)}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </div>
        <div>
          <Label>Sub-Category</Label>
          <Select name="subcategoryId" defaultValue={item.subcategoryId ?? ""}><option value="">—</option>{filteredSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </div>
        <div><Label>Item Name</Label><Input name="name" required defaultValue={item.name} /></div>
        <div><Label>Description</Label><Input name="description" defaultValue={item.description ?? ""} /></div>
        <div><Label>Current Barcode (read-only)</Label><Input value={item.barcode} readOnly className="bg-gray-50 font-mono text-xs" /></div>
        <div><Label>New Barcode (optional)</Label><Input name="newBarcode" placeholder="Leave blank to keep current" /></div>
        <div><Label>Total Quantity</Label><Input name="quantity" type="number" min={0} defaultValue={item.quantity} /></div>
        <div><Label>Status</Label><Select name="status" defaultValue={item.status}><option value="available">Available</option><option value="busy">On Event</option><option value="damaged">Damaged</option></Select></div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
      </form>
    </Modal>
  );
}

function QtyModal({ item, onClose }: { item: ItemRow; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [val, setVal] = useState(item.quantity);
  async function save() {
    setPending(true);
    try { await quickUpdateQty(item.id, val); onClose(); } catch (err) { alert((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Quick Quantity Update">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{item.name}</p>
        <div className="flex items-center gap-3">
          <Button variant="outline" type="button" onClick={() => setVal((v) => Math.max(0, v - 1))}>−</Button>
          <Input type="number" min={0} value={val} onChange={(e) => { const n = Number(e.target.value); setVal(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0); }} className="text-center" />
          <Button variant="outline" type="button" onClick={() => setVal((v) => v + 1)}>+</Button>
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={pending}>Save</Button></div>
      </div>
    </Modal>
  );
}

function PrintBarcodeModal({ item, onClose }: { item: ItemRow; onClose: () => void }) {
  function doPrint() { window.print(); }
  return (
    <Modal open onClose={onClose} title="Print Barcode">
      <div className="space-y-4">
        <div className="print-area barcode-print-sheet rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 text-center text-black">
          <p className="text-lg font-bold text-gray-900">{item.name}</p>
          {item.description && <p className="text-xs text-gray-600">{item.description}</p>}
          <div className="my-3">
            <svg viewBox="0 0 200 60" className="mx-auto h-16 w-48" style={{ imageRendering: "pixelated" }}>
              {generateBarcodeSvg(item.barcode)}
            </svg>
          </div>
          <p className="font-mono text-sm tracking-widest text-gray-700">{item.barcode}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Close</Button>
          <Button onClick={doPrint}><Printer className="h-4 w-4" /> Print</Button>
        </div>
      </div>
    </Modal>
  );
}

function generateBarcodeSvg(code: string): React.ReactNode {
  const bars: React.ReactNode[] = [];
  let x = 0;
  for (let i = 0; i < code.length; i++) {
    const charCode = code.charCodeAt(i);
    const pattern = charCode.toString(2).padStart(7, "0");
    for (let j = 0; j < pattern.length; j++) {
      if (pattern[j] === "1") bars.push(<rect key={`${i}-${j}`} x={x} y={0} width={2} height={60} fill="black" />);
      x += 3;
    }
  }
  return bars;
}

function DeleteBtn({ id, name }: { id: number; name: string }) {
  const [pending, setPending] = useState(false);
  async function run() {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setPending(true);
    try { await deleteItem(id); } catch (e) { alert((e as Error).message); setPending(false); }
  }
  return <Button size="sm" variant="danger" onClick={run} disabled={pending}>{pending ? "…" : "Delete"}</Button>;
}
