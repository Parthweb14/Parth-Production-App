// src/lib/rate-limiter.ts
// Rate limiting using Drizzle query builder, with an in-memory fallback
// when Turso/settings is temporarily unavailable (so login is never fully locked out).
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";

type WindowConfig = { max: number; windowMs: number };

export type RateLimitResult = {
  allowed: boolean;
  retryAfter?: number;
  /** True when the DB was unavailable and the in-memory fallback was used. */
  dbError?: boolean;
};

const DEFAULTS: Record<string, WindowConfig> = {
  general: { max: 100, windowMs: 60 * 1000 },
};

/** Process-local fallback — protects against spray when Turso is down. */
const memoryBuckets = new Map<string, { count: number; start: number }>();

function memoryCheck(rlKey: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cur = memoryBuckets.get(rlKey);
  if (!cur || now - cur.start > windowMs) {
    memoryBuckets.set(rlKey, { count: 1, start: now });
    return { allowed: true, dbError: true };
  }
  if (cur.count >= max) {
    const retryAfter = Math.ceil((windowMs - (now - cur.start)) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter), dbError: true };
  }
  cur.count += 1;
  memoryBuckets.set(rlKey, cur);
  return { allowed: true, dbError: true };
}

/**
 * Optimistic concurrency on the settings row value to reduce race bypasses
 * under concurrent requests (read-modify-write with compare-and-swap).
 */
async function checkAndIncrement(
  rlKey: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();

  for (let attempt = 0; attempt < 6; attempt++) {
    const existing = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, rlKey))
      .limit(1)
      .then((r) => r[0]);

    if (!existing) {
      try {
        await db.insert(schema.settings).values({
          key: rlKey,
          value: JSON.stringify({ count: 1, start: now }),
          updatedAt: new Date(),
        });
        return { allowed: true };
      } catch {
        // Concurrent insert — retry read.
        continue;
      }
    }

    let data: { count: number; start: number };
    try {
      data = JSON.parse(existing.value);
      if (typeof data.count !== "number" || typeof data.start !== "number") {
        throw new Error("Invalid rate-limit data");
      }
    } catch {
      const nextVal = JSON.stringify({ count: 1, start: now });
      const updated = await db
        .update(schema.settings)
        .set({ value: nextVal, updatedAt: new Date() })
        .where(and(eq(schema.settings.key, rlKey), eq(schema.settings.value, existing.value)))
        .returning({ key: schema.settings.key });
      if (updated.length) return { allowed: true };
      continue;
    }

    if (now - data.start > windowMs) {
      const nextVal = JSON.stringify({ count: 1, start: now });
      const updated = await db
        .update(schema.settings)
        .set({ value: nextVal, updatedAt: new Date() })
        .where(and(eq(schema.settings.key, rlKey), eq(schema.settings.value, existing.value)))
        .returning({ key: schema.settings.key });
      if (updated.length) return { allowed: true };
      continue;
    }

    if (data.count >= max) {
      const retryAfter = Math.ceil((windowMs - (now - data.start)) / 1000);
      return { allowed: false, retryAfter: Math.max(1, retryAfter) };
    }

    const nextVal = JSON.stringify({ count: data.count + 1, start: data.start });
    const updated = await db
      .update(schema.settings)
      .set({ value: nextVal, updatedAt: new Date() })
      .where(and(eq(schema.settings.key, rlKey), eq(schema.settings.value, existing.value)))
      .returning({ key: schema.settings.key });
    if (updated.length) return { allowed: true };
  }

  // Contended — fail closed for this request rather than allowing a bypass.
  return { allowed: false, retryAfter: 1 };
}

export async function checkRateLimit(
  key: string,
  config?: WindowConfig
): Promise<RateLimitResult> {
  const cfg = config ?? DEFAULTS.general;
  const rlKey = `rl:${key}`;
  try {
    return await checkAndIncrement(rlKey, cfg.max, cfg.windowMs);
  } catch (err) {
    console.error("[rate-limiter] DB error — using in-memory fallback:", err);
    return memoryCheck(rlKey, cfg.max, cfg.windowMs);
  }
}

export async function clearRateLimit(key: string): Promise<void> {
  const rlKey = `rl:${key}`;
  memoryBuckets.delete(rlKey);
  try {
    await db.delete(schema.settings).where(eq(schema.settings.key, rlKey));
  } catch (err) {
    console.error("[rate-limiter] clearRateLimit error:", err);
  }
}
