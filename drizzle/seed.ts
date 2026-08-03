// drizzle/seed.ts — seeds the initial admin user (run after db:push).
// Usage: SETUP_ADMIN_PASSWORD='…' npm run db:seed
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const url = process.env.TURSO_DATABASE_URL!;
const token = process.env.TURSO_AUTH_TOKEN!;
const client = createClient({ url, authToken: token });

async function main() {
  const existing = await client.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existing.rows.length > 0) {
    console.log("Admin already exists — skipping.");
    return;
  }

  const password = process.env.SETUP_ADMIN_PASSWORD?.trim();
  if (!password || password.length < 12) {
    console.error(
      "Refusing to seed: set SETUP_ADMIN_PASSWORD to a strong password (12+ chars). Password is never logged."
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  await client.execute({
    sql: "INSERT INTO users (name, email, password, role, must_change_pwd, email_verified_at, active, created_at, updated_at) VALUES (?, ?, ?, 'admin', 1, unixepoch(), 1, unixepoch(), unixepoch())",
    args: ["Parth Admin", "admin@parthproduction.com", hash],
  });
  console.log("✓ Seeded admin → admin@parthproduction.com (password from SETUP_ADMIN_PASSWORD; not logged)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
