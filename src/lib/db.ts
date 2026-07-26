// src/lib/db.ts
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import * as schema from "@/drizzle/schema";

type Db = LibSQLDatabase<typeof schema>;

let _client: Client | null = null;
let _db: Db | null = null;

function getClient(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set. Copy .env.example to .env.local.");
  }
  _client = createClient({ url, authToken });
  return _client;
}

function getDb(): Db {
  if (_db) return _db;
  _db = drizzle(getClient(), { schema });
  return _db;
}

/** Lazy DB proxy — avoids crashing Next.js build/page-data collection when env is not yet loaded. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
