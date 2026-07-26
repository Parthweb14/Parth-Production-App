// src/components/teams/TeamsView.tsx
"use client";
import { useState } from "react";
import { Button, Input, Label, Modal, Card, EmptyState, Select } from "@/components/ui";
import { Fab } from "@/components/Fab";
import { createTeam, deleteTeam, addMember, removeMember } from "@/server/team-actions";

type Team = { id: number; name: string; description: string | null; members: { userId: number; name: string }[] };

export function TeamsView({ teams, employees }: { teams: Team[]; employees: { id: number; name: string }[] }) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-gray-900">Teams</h1>
      {teams.length === 0 ? (
        <EmptyState title="No teams yet" hint="Use the + button to create a team." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <TeamCard key={t.id} team={t} employees={employees} />
          ))}
        </div>
      )}
      <Fab onClick={() => setAddOpen(true)} label="Add team" />
      {addOpen && <AddModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function TeamCard({ team, employees }: { team: Team; employees: { id: number; name: string }[] }) {
  const [sel, setSel] = useState<string>("");
  const [pending, setPending] = useState(false);
  const available = employees.filter((e) => !team.members.some((m) => m.userId === e.id));

  async function add() {
    if (!sel) return;
    setPending(true);
    try { await addMember(team.id, Number(sel)); setSel(""); } catch (err) { alert((err as Error).message); }
    setPending(false);
  }
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{team.name}</h3>
          <p className="text-xs text-gray-500">{team.description ?? ""}</p>
        </div>
        <Button size="sm" variant="danger" onClick={() => confirm(`Delete team "${team.name}"?`) && deleteTeam(team.id)}>Delete</Button>
      </div>
      <ul className="mb-3 space-y-1">
        {team.members.length === 0 ? <li className="text-xs text-gray-400">No members</li> : team.members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm">
            {m.name}
            <button onClick={() => confirm("Remove this member from the team?") && removeMember(team.id, m.userId)} className="text-xs text-kp-danger hover:underline">remove</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Select value={sel} onChange={(e) => setSel(e.target.value)} className="h-9">
          <option value="">Add member…</option>
          {available.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <Button size="sm" onClick={add} disabled={pending || !sel}>Add</Button>
      </div>
    </Card>
  );
}

function AddModal({ onClose }: { onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      await createTeam({ name: String(f.get("name")), description: String(f.get("description") || "") });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Add Team">
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Name *</Label><Input name="name" required /></div>
        <div><Label>Description</Label><Input name="description" /></div>
        {error && <p className="text-sm text-kp-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add"}</Button></div>
      </form>
    </Modal>
  );
}
