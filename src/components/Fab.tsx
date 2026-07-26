// src/components/Fab.tsx
// Improvement #4: bigger, mobile-accessible floating action button.
"use client";
import { Plus } from "lucide-react";

export function Fab({ onClick, label = "Add" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="fab text-white" aria-label={label}>
      <Plus className="h-7 w-7" strokeWidth={2.5} />
    </button>
  );
}
