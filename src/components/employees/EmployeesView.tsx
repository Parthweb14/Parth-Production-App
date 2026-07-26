// src/components/employees/EmployeesView.tsx
"use client";
import { useState, useEffect } from "react";
import { Button, Input, Label, Modal, Card, Select, EmptyState } from "@/components/ui";
import { Fab } from "@/components/Fab";
import { createEmployee, updateEmployee, resetPassword, deleteEmployee, toggleEmployeeActive } from "@/server/employee-actions";

type Emp = { id: number; name: string; email: string; phone: string | null; active: boolean };

export function EmployeesView({ employees }: { employees: Emp[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Emp | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: number; name: string } | null>(null);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!errMsg) return;
    const t = setTimeout(() => setErrMsg(null), 4000);
    return () => clearTimeout(t);
  }, [errMsg]);

  const filtered = employees.filter((e) => {
    const matchesQ = !q || e.name.toLowerCase().includes(q.toLowerCase()) || e.email.toLowerCase().includes(q.toLowerCase()) || (e.phone || "").includes(q);
    const matchesActive = activeFilter === "all" || (activeFilter === "active" ? e.active : !e.active);
    return matchesQ && matchesActive;
  });

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-gray-900">Employees</h1>
      {errMsg && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <span>{errMsg}</span>
          <button onClick={() => setErrMsg(null)} className="ml-3 text-red-500 hover:text-red-700" aria-label="Dismiss">×</button>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="sm:max-w-xs"
          aria-label="Search employees"
        />
        <Select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as "all" | "active" | "inactive")}
          className="sm:w-44"
          aria-label="Filter by status"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>
      <Card className="overflow-hidden pb-16 sm:pb-0">
        {employees.length === 0 ? (
          <EmptyState title="No employees" hint="Use the + button to add one." />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matching employees" hint="Try a different search or filter." />
        ) : (
          <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <p className="px-4 pt-3 text-xs text-gray-500 md:hidden">Swipe sideways to see all columns</p>
            <table className="w-full min-w-[520px] text-left text-sm md:min-w-[700px]">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Email</th>
                  <th className="hidden px-4 py-3 md:table-cell">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {e.name}
                      <div className="mt-0.5 break-all text-xs font-normal text-gray-500 sm:hidden">{e.email}</div>
                      {e.phone && <div className="text-xs font-normal text-gray-500 md:hidden sm:block">{e.phone}</div>}
                    </td>
                    <td className="hidden px-4 py-3 font-semibold text-gray-800 dark:text-gray-100 sm:table-cell">{e.email}</td>
                    <td className="hidden px-4 py-3 font-semibold text-gray-800 dark:text-gray-100 md:table-cell">{e.phone ?? "—"}</td>
                    <td className="px-4 py-3">{e.active ? <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">Active</span> : <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">Deactivated</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <EditBtn onClick={() => setEditTarget(e)} />
                        <ToggleBtn id={e.id} name={e.name} active={e.active} onError={setErrMsg} />
                        <ResetBtn onOpen={() => setResetTarget({ id: e.id, name: e.name })} />
                        <DeleteBtn id={e.id} name={e.name} onError={setErrMsg} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Fab onClick={() => setAddOpen(true)} label="Add employee" />
      {addOpen && <AddModal onClose={() => setAddOpen(false)} onError={setErrMsg} />}
      {editTarget && <EditModal emp={editTarget} onClose={() => setEditTarget(null)} onError={setErrMsg} />}
      {resetTarget && <ResetPwdModal target={resetTarget} onClose={() => setResetTarget(null)} onError={setErrMsg} />}
    </div>
  );
}

function AddModal({ onClose, onError }: { onClose: () => void; onError: (msg: string) => void }) {
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await createEmployee({
        name: String(f.get("name")),
        email: String(f.get("email")),
        phone: String(f.get("phone") || ""),
        password: String(f.get("password")),
      });
      onClose();
    } catch (err) { onError((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Add Employee">
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Name *</Label><Input name="name" required /></div>
        <div><Label>Email *</Label><Input name="email" type="email" required /></div>
        <div><Label>Phone</Label><Input name="phone" /></div>
        <div><Label>Password *</Label><Input name="password" type="password" required minLength={8} /></div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add"}</Button></div>
      </form>
    </Modal>
  );
}

function ToggleBtn({ id, name, active, onError }: { id: number; name: string; active: boolean; onError: (msg: string) => void }) {
  const [pending, setPending] = useState(false);
  return <Button size="sm" variant="outline" disabled={pending} onClick={async () => { setPending(true); try { await toggleEmployeeActive(id); } catch (err) { onError((err as Error).message); } finally { setPending(false); } }}>{pending ? "…" : active ? "Deactivate" : "Reactivate"}</Button>;
}

function ResetBtn({ onOpen }: { onOpen: () => void }) {
  return <Button size="sm" variant="warning" onClick={onOpen}>Reset Password</Button>;
}

function ResetPwdModal({ target, onClose, onError }: { target: { id: number; name: string }; onClose: () => void; onError: (msg: string) => void }) {
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password") || "");
    if (pw.length < 8) { onError("Password must be at least 8 characters."); return; }
    setPending(true);
    try { await resetPassword(target.id, pw); onClose(); } catch (err) { onError((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Reset password — ${target.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>New password</Label>
          <div className="relative">
            <Input name="password" type={show ? "text" : "password"} required minLength={8} autoFocus className="pr-16" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-gray-500 hover:text-gray-700">
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">Must be at least 8 characters.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Confirm"}</Button></div>
      </form>
    </Modal>
  );
}

function DeleteBtn({ id, name, onError }: { id: number; name: string; onError: (msg: string) => void }) {
  const [pending, setPending] = useState(false);
  return <Button size="sm" variant="danger" disabled={pending} onClick={async () => { if (confirm(`Remove ${name}?`)) { setPending(true); try { await deleteEmployee(id); } catch (err) { onError((err as Error).message); setPending(false); } } }}>{pending ? "…" : "Delete"}</Button>;
}

function EditBtn({ onClick }: { onClick: () => void }) {
  return <Button size="sm" variant="outline" onClick={onClick}>Edit</Button>;
}

function EditModal({ emp, onClose, onError }: { emp: Emp; onClose: () => void; onError: (msg: string) => void }) {
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      await updateEmployee({ id: emp.id, name: String(f.get("name")), phone: String(f.get("phone") || "") });
      onClose();
    } catch (err) { onError((err as Error).message); setPending(false); }
  }
  return (
    <Modal open onClose={onClose} title="Edit Employee">
      <form onSubmit={submit} className="space-y-4">
        <input type="hidden" name="id" value={emp.id} />
        <div><Label>Name *</Label><Input name="name" defaultValue={emp.name} required /></div>
        <div>
          <Label>Email</Label>
          <Input name="email" type="email" defaultValue={emp.email} disabled readOnly />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Email changes require employee request + admin approval (Email Requests).
          </p>
        </div>
        <div><Label>Phone</Label><Input name="phone" defaultValue={emp.phone ?? ""} /></div>
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
      </form>
    </Modal>
  );
}
