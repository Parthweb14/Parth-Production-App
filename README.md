# Kadam Production — Next.js rebuild (v3)

Operations system for an Indian DJ/event production company. Rebuilt from the legacy PHP/Hostinger site as a modern Next.js App Router app on Turso + Drizzle.

## Stack
- **Next.js 15 (App Router)** + React 19 + TypeScript  *(spec targets Next 16; 15 is used here for guaranteed Vercel install — upgrade is trivial)*
- **Turso (libSQL/SQLite)** + **Drizzle ORM**
- **Tailwind CSS 3** + custom components (Bootstrap-style palette)
- **bcrypt + JWT** auth (httpOnly cookie)
- **Vercel** deployment

## Roles
- **admin** — full dashboard + all modules
- **employee** — dashboard, Scan Item, My Tasks, Change Password

## Quick start (local)
```bash
cp .env.example .env.local      # then fill TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, AUTH_SECRET
npm install
npm run db:push                 # create tables (or use the /api/setup route instead)
npm run db:seed                 # seed admin (admin@kadamproduction.in / admin123)
npm run dev
```

## First deploy (Vercel) — no local tooling needed
1. Import this repo into Vercel.
2. Add the Environment Variables (see below).
3. Deploy.
4. Visit **`https://<your-app>/api/setup`** once → creates all tables + seeds the admin.
5. Log in at `/login` with `admin@kadamproduction.in` / `admin123`, then change the password.

## Environment variables (Vercel)
| Key | Value |
|-----|-------|
| `TURSO_DATABASE_URL` | `libsql://app-parth-production-parthproduction.aws-ap-south-1.turso.io` |
| `TURSO_AUTH_TOKEN`   | *(your Turso token)* |
| `AUTH_SECRET`        | *(32+ random chars — generate with `openssl rand -base64 32`)* |
| `NEXT_PUBLIC_APP_NAME` | `Kadam Production` |

> Never commit `.env.local`. The GitHub deploy token is only used to push code.

## Modules
Dashboard · Inventory · Categories · Orders · Order Manage · Invoice · Finance · Employees · Teams · Scan Item · My Tasks · Change Password · Settings

## Implemented improvements (from brief)
1. **Date-based inventory availability** — pick a date; available stock accounts for orders on that date.
2. **Enhanced side menu** — gradient header, rounded active pills, hover states, mobile drawer.
3. **Attach logo** in Admin Settings (shown in sidebar + invoices).
4. **Bigger, mobile-accessible FAB** (+) on every list page.
5. **Smart Orders page** — orders load only after selecting a status/date; status text has **no icons**.
6. **Order event categories** — Wedding, Barrat, Corporate Events, Festival, Other.
7. **Order delete visible on mobile** (action buttons wrap, always reachable).
8. **Assign inventory** — global search, list hidden by default, and a **live minus preview** until "Reserve Items"; **completion popup** (Manual vs Automatic inventory return).
9. **Invoice** — strict black & white, **no equipment section**, print-ready.

## Notes / follow-ups (not in this MVP)
- Offline embedded replicas for mobile scanning (spec) — Scan currently requires connectivity.
- Auto-return inventory via Vercel Cron — schema/logic ready, cron wiring TBD.
- PDF/Excel export, Resend email, Upstash rate-limiting — hooks defined, integrations TBD.
- Better-Auth swap — currently a lightweight bcrypt+JWT implementation matching the same auth flow.

© Kadam Production / Powered by Trishulhub
