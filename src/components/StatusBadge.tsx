// src/components/StatusBadge.tsx
// Improvement #5: status badges are TEXT ONLY (no tick/check icons).
import { Badge } from "./ui";

const MAP: Record<string, { tone: string; label: string }> = {
  // items
  available: { tone: "green", label: "Available" },
  busy: { tone: "yellow", label: "On Event" },
  damaged: { tone: "red", label: "Damaged" },
  // orders
  upcoming: { tone: "blue", label: "Upcoming" },
  ongoing: { tone: "yellow", label: "Ongoing" },
  completed: { tone: "green", label: "Completed" },
  cancelled: { tone: "red", label: "Cancelled" },
  // finance
  income: { tone: "green", label: "Income" },
  expense: { tone: "red", label: "Expense" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = MAP[status] ?? { tone: "gray", label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}
