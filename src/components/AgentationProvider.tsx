"use client";

import { Agentation } from "agentation";

/**
 * Agentation visual feedback toolbar (bottom-right).
 * Enabled when NEXT_PUBLIC_ENABLE_AGENTATION is not explicitly "false".
 * Use it to click UI elements, add notes, and paste feedback into Cursor.
 */
export function AgentationProvider() {
  if (process.env.NEXT_PUBLIC_ENABLE_AGENTATION === "false") return null;
  return <Agentation />;
}
