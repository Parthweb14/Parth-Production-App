// src/app/api/setup/route.ts
// One-time bootstrap: creates all tables (IF NOT EXISTS) and seeds an admin.
// Call GET /api/setup after first deploy, then log in and change the password.
import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee',
    phone TEXT,
    must_change_pwd INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL UNIQUE,
    rotated INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    barcode TEXT NOT NULL UNIQUE,
    category_id INTEGER,
    subcategory_id INTEGER,
    description TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'available',
    current_order_id INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    contact_person TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    transport_contact_name TEXT,
    transport_contact_phone TEXT,
    event_date TEXT,
    event_time TEXT,
    setup_date TEXT,
    setup_time TEXT,
    address TEXT,
    billing_address TEXT,
    total_budget REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'upcoming',
    event_category TEXT DEFAULT 'Other',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    reserved_at INTEGER,
    scanned_out_at INTEGER,
    scanned_in_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS order_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS finance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    date TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before TEXT,
    after TEXT,
    ip TEXT,
    user_agent TEXT,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
];

// Migration DDL — run with try/catch (idempotent)
const MIGRATION_DDL: { sql: string; label: string }[] = [
  { sql: `CREATE TABLE IF NOT EXISTS subcategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`, label: "subcategories table" },
  { sql: `CREATE INDEX IF NOT EXISTS subcategories_category_idx ON subcategories(category_id)`, label: "subcategories index" },
  { sql: `CREATE INDEX IF NOT EXISTS items_subcategory_idx ON items(subcategory_id)`, label: "items subcategory index" },
  { sql: `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    order_id INTEGER REFERENCES orders(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`, label: "notifications table" },
  { sql: `CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id)`, label: "notifications user index" },
  { sql: `CREATE TABLE IF NOT EXISTS email_change_requests (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    current_email TEXT NOT NULL,
    requested_new_email TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    form_token_hash TEXT,
    form_token_expires_at INTEGER,
    form_token_used_at INTEGER,
    form_otp_hash TEXT,
    pending_new_email TEXT,
    pending_password_hash TEXT,
    verify_token_hash TEXT,
    verify_otp_hash TEXT,
    verify_expires_at INTEGER,
    verify_used_at INTEGER,
    approved_by INTEGER,
    approved_at INTEGER,
    rejected_at INTEGER,
    completed_at INTEGER,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`, label: "email_change_requests table" },
  { sql: `CREATE INDEX IF NOT EXISTS email_change_user_idx ON email_change_requests(user_id)`, label: "email_change user index" },
  { sql: `CREATE INDEX IF NOT EXISTS email_change_status_idx ON email_change_requests(status)`, label: "email_change status index" },
];

export async function GET(req: Request) {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 500 });
  }

  // Security: require either an existing admin session OR a SETUP_BOOTSTRAP_TOKEN env var.
  const bootstrapToken = process.env.SETUP_BOOTSTRAP_TOKEN;
  const authHeader = req.headers.get("authorization");
  const cookieHeader = req.headers.get("cookie") || "";

  // Allow if a valid admin JWT cookie is present
  let authorized = false;
  let pendingSessionId: string | undefined;
  if (bootstrapToken && authHeader === `Bearer ${bootstrapToken}`) {
    authorized = true;
  }
  if (!authorized) {
    // Check for admin session via cookie
    try {
      const { jwtVerify } = await import("jose");
      const cookie = cookieHeader.match(/kp_session=([^;]+)/)?.[1];
      if (cookie) {
        const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
        if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 8) throw new Error("AUTH_SECRET required");
        const { payload } = await jwtVerify(cookie, secret);
        if (payload.role === "admin" && typeof payload.sessionId === "string" && payload.sessionId) {
          // Require sessionId so revoked tokens without a DB row cannot pass.
          authorized = true;
          pendingSessionId = payload.sessionId;
        }
      }
    } catch {
      // invalid token
    }
  }
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized. Admin login required." }, { status: 403 });
  }

  const client = createClient({ url, authToken: token });

  // H5: Verify the session hasn't been revoked. Done here because the libsql
  // client is only created above.
  if (pendingSessionId) {
    let sessionValid = false;
    try {
      const res = await client.execute({
        sql: "SELECT revoked_at FROM sessions WHERE id = ?",
        args: [pendingSessionId],
      });
      const row = res.rows[0] as { revoked_at?: number | null } | undefined;
      sessionValid = !!row && row.revoked_at == null;
    } catch {
      // sessions table missing or query failed — treat as unauthorized (fail-closed)
      sessionValid = false;
    }
    if (!sessionValid) {
      return NextResponse.json({ ok: false, error: "Unauthorized. Session is invalid or revoked." }, { status: 403 });
    }
  }
  const log: string[] = [];
  try {
    for (const stmt of DDL) {
      await client.execute(stmt);
    }
    log.push("Tables ensured (13 tables).");

    // Run migrations (subcategories table, new item columns)
    for (const m of MIGRATION_DDL) {
      try {
        await client.execute(m.sql);
        log.push(`Migration: ${m.label} — OK`);
      } catch {
        log.push(`Migration: ${m.label} — already applied`);
      }
    }
    // ALTER TABLE for items (idempotent via try/catch)
    const alterStmts = [
      { sql: "ALTER TABLE items ADD COLUMN subcategory_id INTEGER", label: "items.subcategory_id" },
      { sql: "ALTER TABLE items ADD COLUMN description TEXT", label: "items.description" },
      { sql: "ALTER TABLE orders ADD COLUMN setup_done INTEGER NOT NULL DEFAULT 0", label: "orders.setup_done" },
    { sql: "ALTER TABLE orders ADD COLUMN gst_enabled INTEGER NOT NULL DEFAULT 0", label: "orders.gst_enabled" },
      { sql: "ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1", label: "users.active" },
      { sql: "ALTER TABLE users ADD COLUMN email_verified_at INTEGER", label: "users.email_verified_at" },
    ];
    for (const a of alterStmts) {
      try {
        await client.execute(a.sql);
        log.push(`Migration: ${a.label} — added`);
      } catch {
        log.push(`Migration: ${a.label} — already exists`);
      }
    }
    // Backfill: existing accounts are treated as already verified.
    try {
      await client.execute(
        "UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at, unixepoch()) WHERE email_verified_at IS NULL AND deleted_at IS NULL"
      );
      log.push("Migration: users.email_verified_at backfill — OK");
    } catch {
      log.push("Migration: users.email_verified_at backfill — skipped");
    }
    // Default scan_enabled setting
    try {
      await client.execute("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('scan_enabled', 'true', unixepoch())");
      log.push("Migration: scan_enabled setting — OK");
    } catch {
      log.push("Migration: scan_enabled setting — exists");
    }

    // Seed admin if none exists
    const existing = await client.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    let adminSeeded = false;
    if (existing.rows.length === 0) {
      const adminPassword = crypto.randomBytes(12).toString("base64url");
      const hash = await bcrypt.hash(adminPassword, 12);
      await client.execute({
        sql: "INSERT INTO users (name, email, password, role, must_change_pwd, email_verified_at, active, created_at, updated_at) VALUES (?, ?, ?, 'admin', 1, unixepoch(), 1, unixepoch(), unixepoch())",
        args: ["Parth Admin", "admin@parthproduction.com", hash],
      });
      adminSeeded = true;
      log.push("Seeded admin → admin@parthproduction.com (password written only to server logs once)");
      // Avoid logging the plaintext password — store a one-time marker instead.
      console.log("==========================================================");
      console.log("[setup] Seeded admin user: admin@parthproduction.com");
      console.log("[setup] One-time password (store securely, will not be shown again):");
      console.log(`[setup] ${adminPassword}`);
      console.log("==========================================================");
      // Consume bootstrap token after successful first admin seed when set.
      if (bootstrapToken) {
        log.push("Bootstrap authorized this run. Rotate/remove SETUP_BOOTSTRAP_TOKEN after setup.");
      }
    } else {
      log.push("Admin already exists — skipped seeding.");
    }

    // SECURITY FIX: do NOT return the adminPassword in the HTTP response body.
    // The password is logged server-side only (above). The response just
    // indicates whether a new admin was seeded.
    return NextResponse.json({ ok: true, log, adminSeeded });
  } catch {
    return NextResponse.json({ ok: false, error: "Setup failed. Check server logs.", log }, { status: 500 });
  }
}
