"use client";

import { Agentation } from "agentation";

/** Dev-only visual feedback toolbar for AI coding agents. */
export function AgentationProvider() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Agentation />;
}
