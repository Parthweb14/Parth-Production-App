# 🔴 KADAM PRODUCTION — COMPLETE BUG & ISSUE REPORT
> Generated: 2026-07-12 | Total: **92 issues**

---

## ⚠️ CRITICAL (8 issues — app-breaking or severe data loss)

| # | Module | Issue | File(s) |
|---|--------|-------|----------|
| **C1** | DB/Rate Limiter | **Login completely broken** — `db.run()` with raw SQL `RETURNING` on Turso HTTP connection returns "Connection closed" on every write. All server-action POSTs return 500. | `rate-limiter.ts:34-54`, `auth.ts` |
| **C2** | Dark Mode | **Primary buttons invisible in dark mode** — `bg-[var(--accent)]` = `#f1f5f9` AND `dark:text-gray-900` remapped to `#f1f5f9` → white text on white bg. Affects ALL primary buttons across the entire app. | `ui.tsx:15`, `globals.css:145` |
| **C3** | Dark Mode | **Modal titles invisible in dark mode** — `dark:text-gray-100` remapped to `rgba(255,255,255,0.03)` → 3% opacity, impossible to read. | `ui.tsx:118`, `globals.css:154` |
| **C4** | Invoice | **Invoice emails link to protected URL** — `sendInvoiceEmail` sends `/orders/[id]/invoice` (requires auth), should send `/invoice/[id]` (public, OTP-based). Customers can never see their invoices from email links. | `order-actions.ts:131` |
| **C5** | Teams | **AddModal hangs forever on error** — `createTeam` catch block missing, `pending` never reset to `false`, button stays "Saving..." permanently. | `TeamsView.tsx:70-88` |
| **C6** | Inventory | **`listItems` sums ALL orderItems regardless of order status** — JOIN condition uses `orders.status IN (...)` in ON clause instead of WHERE, inflating availability counts. | `queries.ts:63-69` |
| **C7** | Categories | **`createCategoryItem` never sets `categoryId`** — items created from Categories page show "---" in Inventory category column. | `category-actions.ts:77-92` |
| **C8** | DB | **`users.active` column missing from initial CREATE TABLE DDL** — if ALTER TABLE migration silently fails, `verify()` crashes on `select({ active })` and ALL logins are rejected. | `setup/route.ts:8-20,223` |

---

## 🔴 HIGH (28 issues — data integrity, security bypass, major UX breakage)

| # | Module | Issue | File(s) |
|---|--------|-------|----------|
| **H1** | Auth | **Self-deletion lockout** — admin can soft-delete or deactivate themselves, immediately locking out with no recovery. | `employee-actions.ts:72,79` |
| **H2** | Auth | **Deleted employee sessions not revoked** — soft-delete doesn't revoke sessions; employee stays logged in up to 1 day. | `employee-actions.ts:72-77` |
| **H3** | Auth | **Self-deactivation lockout** — admin can toggle their own `active=false`, same lockout as H1. | `employee-actions.ts:79` |
| **H4** | Auth | **Insecure OTP generation** — `Math.random()` used in both `generateOtp()` and `invoice-otp/route.ts`. Not cryptographically secure. | `auth.ts:247`, `invoice-otp/route.ts:43` |
| **H5** | Auth | **Setup route auth bypass** — manual JWT check skips session revocation verification; revoked admin sessions still pass. | `setup/route.ts:183-194` |
| **H6** | Auth | **Setup seeds admin with well-known hardcoded password** — `admin@kadamproduction.in / admin123` | `setup/route.ts:244` |
| **H7** | Auth | **Email enumeration in forgot-password** — returns distinct "No account found" vs success, unlike login's generic message. | `auth.ts:261` |
| **H8** | Orders | **`contactPerson` always stored as literal "null"** — no `<input name="contactPerson">` in create/edit forms, `String(null)` = `"null"`. Every order gets corrupted event name. | `OrdersView.tsx:208`, `ManageOrderView.tsx:473` |
| **H9** | Orders | **Edit modal missing transport contact fields** — `transportContactName`/`transportContactPhone` in create but absent from edit. Data invisible & uneditable after creation. | `ManageOrderView.tsx:496-509` |
| **H10** | Orders | **Manual completion leaves items linked to completed order** — `currentOrderId` never cleared; items stuck in limbo. | `order-actions.ts:159-180` |
| **H11** | Orders | **Non-atomic advance-payment insert** — order created, then finance insert fails; order exists without its advance payment. | `order-actions.ts:40-71` |
| **H12** | Orders | **`saveAssignments` not transactional** — DELETE succeeds then INSERT fails → all assignments lost. | `order-actions.ts:206-219` |
| **H13** | Orders | **`reserveItems` race condition** — read-then-write; two concurrent calls create duplicate `order_items` rows. | `order-actions.ts:229-238` |
| **H14** | Scan | **Invalid action falls through to "damaged"** — passing any unrecognized `action` marks item as damaged. | `scan-actions.ts:17-39` |
| **H15** | Scan | **`quickUpdateQty` NaN vulnerability** — `Math.max(0, NaN)` = `NaN`; item quantity set to NaN in DB. | `inventory-actions.ts:30` |
| **H16** | Scan | **`updateItem` falsy ID clears category** — `categoryId \|\| null` turns `0` into `null`, orphaning items. | `inventory-actions.ts:39-40` |
| **H17** | Inventory | **No server-side validation on employee create** — empty name, invalid email, 1-char password all accepted. | `employee-actions.ts:9-15` |
| **H18** | Inventory | **`resetPassword` allows 1-char passwords** — zero minimum length check. | `employee-actions.ts:41-55` |
| **H19** | Finance | **No validation for negative amounts** — `Number(-5000)` passes truthy check, corrupting financial totals. | `finance-actions.ts:15` |
| **H20** | Finance | **Expense card text invisible in dark mode** — `text-red-900` on dark bg, no `dark:` variant. | `FinanceView.tsx:87` |
| **H21** | Settings | **SMTP password stored in plaintext** — `smtp_pass` readable by anyone with DB access. | `settings-actions.ts:49` |
| **H22** | Settings | **`upsertSetting` race condition** — SELECT-then-INSERT/UPDATE; two concurrent writes cause primary key conflict. | `settings-actions.ts:8-15` |
| **H23** | Dark Mode | **`text-kp-primary` links invisible** — `#0f172a` on near-black bg. "Mark all read", "Back to Orders" links disappear. | `NotificationBell.tsx:54`, `ManageOrderView.tsx:38` |
| **H24** | Dark Mode | **`bg-kp-primary/10`, `/5` invisible** — `#0f172a` at 5-10% opacity on dark bg = no visible highlight. Unread notifications indistinguishable. | `NotificationBell.tsx:79` |
| **H25** | Dark Mode | **`border-gray-50` no dark remapping** — renders as bright `#f9fafb` lines in dark mode. Affects ManageOrderView, CategoriesView dividers. | `ManageOrderView.tsx:115`, `CategoriesView.tsx:89` |
| **H26** | Dark Mode | **FAB nearly invisible in dark mode** — gradient `#121624→#030406` on `#05070a` background = indistinguishable. | `globals.css:166-183` |
| **H27** | Auth/Orders | **`createOrder`: no required-field validation** — empty `clientName` accepted (empty string ≠ null). | `order-actions.ts:32-43` |
| **H28** | Invoice OTP | **No rate limiting on OTP send** — attacker can spam order contact email with unlimited OTP requests. | `invoice-otp/route.ts:33-71` |

---

## 🟡 MEDIUM (32 issues — functional problems, poor UX, minor data issues)

| # | Module | Issue | File(s) |
|---|--------|-------|----------|
| **M1** | Auth | Silent session creation failure — catch swallows errors, JWT issued without DB session row | `auth.ts:58-59` |
| **M2** | Auth | Password reset token lacks nonce — multiple valid tokens coexist, old token still works after new one issued | `auth.ts:253` |
| **M3** | Auth | Employee delete + reset password operate on soft-deleted employees (no `deletedAt IS NULL` filter) | `employee-actions.ts:44,46,72` |
| **M4** | Auth | `updateEmployee` resurrects soft-deleted employees (UPDATE clears deletedAt implicitly) | `employee-actions.ts:68` |
| **M5** | Auth | `changePassword` queries without `deletedAt` filter | `auth.ts:291,294` |
| **M6** | Auth | ForgotPasswordForm error messages have no light-mode styling (dark-only `bg-red-950/50`) | `ForgotPasswordForm.tsx:62,90,122` |
| **M7** | Auth | Password `minLength` mismatch — HTML says 6, server says 8 (ForgotPasswordForm + ChangePasswordView) | `ForgotPasswordForm.tsx:132`, `ChangePasswordView.tsx:22` |
| **M8** | Auth | Email hardcoded URL — `kadamproduction-opencode.vercel.app` instead of env variable `NEXT_PUBLIC_BASE_URL` | `email.ts:41,61` |
| **M9** | Dashboard | Sidebar always shows "KP Admin" even for employees | `Sidebar.tsx:80` |
| **M10** | Dashboard | `SetupDoneBtn` doesn't refresh UI after server action — stale `done` prop | `SetupDoneBtn.tsx:11-16` |
| **M11** | Dashboard | No ThemeToggle on mobile top bar — must open drawer to switch theme | `DashboardShell.tsx:47-53` |
| **M12** | Employees | No search/filter or pagination on employee listing — fetch ALL at once | `employees/page.tsx:12-15` |
| **M13** | Employees | Deactivated employees counted in dashboard stats (`active=true` filter missing) | `queries.ts:112-113` |
| **M14** | Employees | Deactivated employees appear in Teams "Add member" dropdown | `teams/page.tsx:17` |
| **M15** | Employees | Reset password uses `prompt()` — plaintext visible, shoulder-surfing risk | `EmployeesView.tsx:91` |
| **M16** | Employees | Welcome/password-reset email failures silently swallowed — admin unaware | `employee-actions.ts:35-37,48-53` |
| **M17** | Employees | Employee listing doesn't filter by active status — deactivated interleaved | `employees/page.tsx:15` |
| **M18** | Teams | Soft-deleted employees show as "Unknown" in team cards (orphaned team_members rows) | `teams/page.tsx:22` |
| **M19** | Teams | Soft-deleted teams orphan their team_members rows (cascade only on hard delete) | `team-actions.ts:16-21` |
| **M20** | Teams | `addMember`/`removeMember` no existence validation — can add deleted users to deleted teams | `team-actions.ts:26,43` |
| **M21** | Teams | Team member removal has no confirmation dialog — instant removal | `TeamsView.tsx:55` |
| **M22** | Teams | `removeMember` notification confusing for deleted teams ("You have been removed from 'Team' team") | `team-actions.ts:42-44` |
| **M23** | Teams | Duplicate team names allowed | `team-actions.ts:9-14` |
| **M24** | Teams | Catch block empty — DB errors show "No teams yet" instead of error | `teams/page.tsx:24-26` |
| **M25** | Orders | `updateOrder` allows arbitrary keys — `Record<string, unknown>` input; `status` can be set bypassing `updateOrderStatus` | `order-actions.ts:83` |
| **M26** | Orders | Search triggers only on blur, not Enter key | `OrdersView.tsx:104` |
| **M27** | Orders | `markSetupDone` not idempotent — double-click creates duplicate notifications | `order-actions.ts:251-277` |
| **M28** | Orders | No status transition validation — `completed` → `upcoming` allowed | `order-actions.ts:159-163` |
| **M29** | Orders | Stored XSS via email HTML — `clientName` interpolated directly into email HTML without sanitization | `order-actions.ts:138` |
| **M30** | Scan | `scanItem` doesn't check if item already checked out — same item can be checked out to multiple orders | `scan-actions.ts:17-23` |
| **M31** | Scan | Damaged items retain `currentOrderId` — stale order linkage | `scan-actions.ts:37-39` |
| **M32** | Scan | Scan page dropdown label says "Ongoing" but includes Upcoming orders | `ScanView.tsx:127` |

---

## 🟢 LOW (24 issues — cosmetic, unlikely edge cases, code quality)

| # | Module | Issue | File(s) |
|---|--------|-------|----------|
| **L1** | Auth | `<a>` tag instead of Next.js `<Link>` in LoginForm "Forgot password?" — full page reload | `LoginForm.tsx:79` |
| **L2** | Auth | `/reset-password` listed in middleware PUBLIC but no route exists (404) | `middleware.ts:6` |
| **L3** | Auth | Dead code `ForceBanner` in change-password page | `change-password/page.tsx:5-7` |
| **L4** | Auth | `changePasswordAction` allows setting same password (no `current !== next` check) | `auth-actions.ts:22-27` |
| **L5** | Auth | Admin device limit off-by-one — ends up with MAX+1 sessions | `auth.ts:46-49` |
| **L6** | Auth | Logo embedded as base64 data URL in emails — blocked by Gmail/Outlook | `email.ts:29` |
| **L7** | Dashboard | Duplicate ThemeToggle on admin dashboard (sidebar + page header) | `page.tsx:40`, `Sidebar.tsx:113-116` |
| **L8** | Dashboard | Employee dashboard heading lacks explicit `dark:` variant (relies on global CSS hack) | `page.tsx:18` |
| **L9** | Dashboard | NotificationBell uses emoji instead of Lucide icons | `NotificationBell.tsx:6-13` |
| **L10** | Employees | Error handling uses `alert()` — jarring, blocks UI | `EmployeesView.tsx:68,94,118` |
| **L11** | Employees | Non-admin sees blank page instead of redirect (multiple pages) | `employees/page.tsx:10`, `teams/page.tsx:9` |
| **L12** | Categories | Soft-deleted items block category/subcategory deletion (no `deletedAt` filter in check) | `category-actions.ts:29-31,66` |
| **L13** | Categories | Sub-category filter buttons: `bg-white` with no dark variant → bright white capsules | `ManageOrderView.tsx:383-385` |
| **L14** | Categories | CategoriesView badge text (`dark:text-gray-300` → `#334155`) invisible in dark mode | `CategoriesView.tsx` |
| **L15** | Inventory | Barcode collision possible — timestamp + 3-digit random, no DB uniqueness check before insert | `inventory-actions.ts` |
| **L16** | Inventory | Native `<select>` options browser-styled (white bg) in dark mode | `ui.tsx:68-78` |
| **L17** | Orders | Invoice date always shows today, not original issuance date | `invoice/page.tsx:76` |
| **L18** | Orders | Edit modal textareas missing focus ring | `ManageOrderView.tsx:515-516` |
| **L19** | Orders | Invoice number suffix breaks after 26 cycles (AA, AB... not implemented) | `invoice-number.ts:14` |
| **L20** | Orders | Email duplicate check fires on every keystroke (no debounce) | `OrdersView.tsx:253-264` |
| **L21** | Orders | `saveDraft` called with unused param on every form change → localStorage spam | `OrdersView.tsx:238` |
| **L22** | Scan | Camera stop doesn't abort in-flight scan request | `ScanView.tsx:94-107` |
| **L23** | API | Manifest route fetches `logo_url` but never uses it | `manifest/route.ts:6` |
| **L24** | Dark Mode | Dashboard icon containers `bg-gray-500/20` — opacity modifier can't be remapped | `page.tsx:57,70,83` |

---

## 📊 SUMMARY

| Severity | Count |
|----------|-------|
| **CRITICAL** | 8 |
| **HIGH** | 28 |
| **MEDIUM** | 32 |
| **LOW** | 24 |
| **TOTAL** | **92** |

### Top 3 Root Cause Patterns:
1. **`globals.css` dark mode remapping layer** (lines 144-161) — indiscriminately overrides ALL `text-gray-*` utilities including Tailwind's `dark:text-gray-*` variants, causing invisible text everywhere. Combined with `kp-primary = #0f172a` being near-black in both modes.
2. **No input validation on server** — empty names, 1-char passwords, negative amounts, NaN quantities all accepted. Zod is installed but unused.
3. **Soft-delete inconsistency** — FK cascades don't fire on soft deletes, orphaning team members, assignments, and leaving deleted employees' sessions active.
