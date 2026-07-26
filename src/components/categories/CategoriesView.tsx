// src/components/categories/CategoriesView.tsx
"use client";
import { useState } from "react";
import { Button, Input, Label, Textarea, Select, Modal, Card, EmptyState } from "@/components/ui";
import { Fab } from "@/components/Fab";
import {
  createCategory, updateCategory, deleteCategory,
  createSubcategory, updateSubcategory, deleteSubcategory,
  createCategoryItem,
} from "@/server/category-actions";
import { ChevronDown, ChevronRight, Plus, FolderOpen, Package, Layers, Printer, Pencil, Trash2 } from "lucide-react";

type MasterCat = { id: number; name: string; description: string | null };
type SubCat = { id: number; name: string; categoryId: number; description: string | null };
type ItemRow = { id: number; name: string; barcode: string; subcategoryId: number | null; categoryId: number | null; quantity: number; description: string | null };

export function CategoriesView({ categories, subcategories, items }: { categories: MasterCat[]; subcategories: SubCat[]; items: ItemRow[] }) {
  const [addType, setAddType] = useState<"master" | "sub" | "item" | null>(null);
  const [editCat, setEditCat] = useState<MasterCat | null>(null);
  const [editSub, setEditSub] = useState<SubCat | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [printItem, setPrintItem] = useState<ItemRow | null>(null);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const subsOf = (catId: number) => subcategories.filter((s) => s.categoryId === catId);
  const itemsOfSub = (subId: number) => items.filter((i) => i.subcategoryId === subId);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Categories</h1>
      <p className="mb-5 text-sm text-gray-500">Master Category → Sub Category → Items</p>

      {categories.length === 0 ? (
        <Card className="p-6"><EmptyState title="No categories yet" hint="Use the + button to create a Master Category." /></Card>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const subs = subsOf(cat.id);
            const isOpen = expanded.has(cat.id);
            return (
              <Card key={cat.id} className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 dark:from-gray-900/40 dark:to-gray-800/40">
                  <button onClick={() => toggle(cat.id)} className="flex flex-1 items-center gap-2 text-left">
                    {isOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
                    <FolderOpen className="h-5 w-5 text-gray-600" />
                    <div>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{cat.name}</span>
                      {cat.description && <span className="ml-2 truncate text-xs text-gray-500 dark:text-gray-400">{cat.description}</span>}
                    </div>
                    <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {subs.length} sub · {subs.reduce((a, s) => a + itemsOfSub(s.id).length, 0)} items
                    </span>
                  </button>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditCat(cat)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <DeleteMasterBtn id={cat.id} name={cat.name} />
                  </div>
                </div>

                {isOpen && (
                  <div className="space-y-2 p-3">
                    {subs.length === 0 && (
                      <p className="px-2 py-3 text-sm text-gray-400">No sub-categories yet. Add a sub-category, then add items under it.</p>
                    )}
                    {subs.map((sub) => {
                      const subItems = itemsOfSub(sub.id);
                      return (
                        <div key={sub.id} className="rounded-lg border border-gray-100">
                          <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Layers className="h-4 w-4 text-gray-500" />
                              <span className="text-sm font-medium text-gray-800">{sub.name}</span>
                              {sub.description && <span className="text-xs text-gray-400">{sub.description}</span>}
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setEditSub(sub)}><Pencil className="h-3 w-3" /></Button>
                              <DeleteSubBtn id={sub.id} name={sub.name} />
                            </div>
                          </div>
                          {subItems.length > 0 && (
                            <div className="divide-y divide-gray-50">
                              {subItems.map((item) => (
                                <ItemRowDisplay key={item.id} item={item} onPrint={() => setPrintItem(item)} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <FabMenu onSelect={setAddType} />

      {addType === "master" && <MasterModal onClose={() => setAddType(null)} />}
      {addType === "sub" && <SubModal categories={categories} onClose={() => setAddType(null)} />}
      {addType === "item" && <ItemModal categories={categories} subcategories={subcategories} onClose={() => setAddType(null)} />}
      {editCat && <EditMasterModal cat={editCat} onClose={() => setEditCat(null)} />}
      {editSub && <EditSubModal sub={editSub} onClose={() => setEditSub(null)} />}
      {printItem && <PrintBarcodeModal item={printItem} onClose={() => setPrintItem(null)} />}
    </div>
  );
}

function ItemRowDisplay({ item, onPrint }: { item: ItemRow; onPrint: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Package className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="truncate text-sm font-medium text-gray-800">{item.name}</span>
        {item.description && <span className="truncate text-xs text-gray-400">{item.description}</span>}
        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-900 dark:bg-gray-800 dark:text-white">Qty: {item.quantity}</span>
        <span className="shrink-0 font-mono text-xs font-medium text-gray-700 dark:text-gray-200">{item.barcode}</span>
      </div>
      <Button size="sm" variant="ghost" onClick={onPrint}><Printer className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

function FabMenu({ onSelect }: { onSelect: (t: "master" | "sub" | "item") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fab text-white"
        aria-label="Add"
      >
        <Plus className="h-7 w-7" />
      </button>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 space-y-2">
          <button onClick={() => { setOpen(false); onSelect("item"); }} className="flex w-44 items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:shadow-gray-900/50 dark:hover:bg-gray-700">
            <Package className="h-4 w-4 text-gray-500 dark:text-gray-400" /> Add Item
          </button>
          <button onClick={() => { setOpen(false); onSelect("sub"); }} className="flex w-44 items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:shadow-gray-900/50 dark:hover:bg-gray-700">
            <Layers className="h-4 w-4 text-gray-500 dark:text-gray-400" /> Add Sub-Category
          </button>
          <button onClick={() => { setOpen(false); onSelect("master"); }} className="flex w-44 items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:shadow-gray-900/50 dark:hover:bg-gray-700">
            <FolderOpen className="h-4 w-4 text-gray-600" /> Add Master Category
          </button>
        </div>
      )}
    </>
  );
}

function MasterModal({ onClose }: { onClose: () => void }) {
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await createCategory({ name: String(f.get("name")), description: String(f.get("description") || "") });
      onClose();
    } catch (err) { alert((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Add Master Category">
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Master Category Name *</Label><Input name="name" required placeholder="e.g. Light, Sound" /></div>
        <div><Label>Description</Label><Textarea name="description" rows={2} /></div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add"}</Button></div>
      </form>
    </Modal>
  );
}

function EditMasterModal({ cat, onClose }: { cat: MasterCat; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await updateCategory(cat.id, { name: String(f.get("name")), description: String(f.get("description") || "") });
      onClose();
    } catch (err) { alert((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Edit Master Category">
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Master Category Name *</Label><Input name="name" required defaultValue={cat.name} /></div>
        <div><Label>Description</Label><Textarea name="description" rows={2} defaultValue={cat.description ?? ""} /></div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>Save</Button></div>
      </form>
    </Modal>
  );
}

function SubModal({ categories, onClose }: { categories: MasterCat[]; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await createSubcategory({ name: String(f.get("name")), categoryId: Number(f.get("categoryId")), description: String(f.get("description") || "") });
      onClose();
    } catch (err) { alert((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Add Sub-Category">
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Master Category *</Label><Select name="categoryId" required>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div><Label>Sub-Category Name *</Label><Input name="name" required placeholder="e.g. VFX, LED" /></div>
        <div><Label>Description</Label><Textarea name="description" rows={2} /></div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add"}</Button></div>
      </form>
    </Modal>
  );
}

function EditSubModal({ sub, onClose }: { sub: SubCat; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await updateSubcategory(sub.id, { name: String(f.get("name")), description: String(f.get("description") || "") });
      onClose();
    } catch (err) { alert((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Edit Sub-Category">
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Sub-Category Name *</Label><Input name="name" required defaultValue={sub.name} /></div>
        <div><Label>Description</Label><Textarea name="description" rows={2} defaultValue={sub.description ?? ""} /></div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>Save</Button></div>
      </form>
    </Modal>
  );
}

function ItemModal({ categories, subcategories, onClose }: { categories: MasterCat[]; subcategories: SubCat[]; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [selCat, setSelCat] = useState<string>("");
  const filteredSubs = subcategories.filter((s) => !selCat || String(s.categoryId) === selCat);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await createCategoryItem({
        name: String(f.get("name")),
        subcategoryId: Number(f.get("subcategoryId")) || 0,
        description: String(f.get("description") || ""),
        quantity: Number(f.get("quantity")) || 1,
      });
      onClose();
    } catch (err) { alert((err as Error).message); setPending(false); }
  }

  return (
    <Modal open onClose={onClose} title="Add Item">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Master Category *</Label>
          <Select name="categoryId" required onChange={(e) => setSelCat(e.target.value)}>
            <option value="">— Select —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Sub-Category *</Label>
          <Select name="subcategoryId" required>
            <option value="">— Select —</option>
            {filteredSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div><Label>Item Name *</Label><Input name="name" required placeholder="e.g. Sony VFX 500W" /></div>
        <div><Label>Description</Label><Input name="description" placeholder="Item description / specs" /></div>
        <div><Label>Quantity *</Label><Input name="quantity" type="number" min={0} defaultValue={1} /></div>
        <p className="text-xs text-gray-400">Barcode is auto-generated on save.</p>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add Item"}</Button></div>
      </form>
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
          <div className="my-3">
            <svg viewBox="0 0 200 60" className="mx-auto h-16 w-48" style={{ imageRendering: "pixelated" }}>
              {generateBarcodeSvg(item.barcode)}
            </svg>
          </div>
          <p className="font-mono text-sm tracking-widest text-gray-700">{item.barcode}</p>
          <p className="mt-1 text-xs text-gray-600">Qty: {item.quantity}</p>
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
      if (pattern[j] === "1") {
        bars.push(<rect key={`${i}-${j}`} x={x} y={0} width={2} height={60} fill="black" />);
      }
      x += 3;
    }
  }
  return bars;
}

function DeleteMasterBtn({ id, name }: { id: number; name: string }) {
  const [pending, setPending] = useState(false);
  async function run() {
    if (!confirm(`Delete master category "${name}" and all its sub-categories?`)) return;
    setPending(true);
    try { await deleteCategory(id); } catch (e) { alert((e as Error).message); setPending(false); }
  }
  return <Button size="sm" variant="ghost" onClick={run} disabled={pending}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>;
}

function DeleteSubBtn({ id, name }: { id: number; name: string }) {
  const [pending, setPending] = useState(false);
  async function run() {
    if (!confirm(`Delete sub-category "${name}"?`)) return;
    setPending(true);
    try { await deleteSubcategory(id); } catch (e) { alert((e as Error).message); setPending(false); }
  }
  return <Button size="sm" variant="ghost" onClick={run} disabled={pending}><Trash2 className="h-3 w-3 text-red-500" /></Button>;
}
