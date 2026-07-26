// drizzle/schema.ts
// Kadam Production — complete schema (Turso/libSQL).
// Source of truth: PHP MySQL schema (reverse-engineered), preserved verbatim,
// plus NEW columns/tables added by the Next.js rebuild (soft deletes, audit, sessions).
import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Roles (2 only — matches PHP exactly)
export const ROLES = ["admin", "employee"] as const;
export type Role = (typeof ROLES)[number];

// Item status (PHP uses 'busy', NOT 'on_event' — preserved)
export const ITEM_STATUS = ["available", "busy", "damaged"] as const;
export type ItemStatus = (typeof ITEM_STATUS)[number];

// Order status (matches PHP)
export const ORDER_STATUS = ["upcoming", "ongoing", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

// Finance type (PHP uses 'income'/'expense' — NOT renamed)
export const FINANCE_TYPE = ["income", "expense"] as const;
export type FinanceType = (typeof FINANCE_TYPE)[number];

// Improvement #6 — order event categories
export const EVENT_CATEGORIES = ["Wedding", "Barrat", "Corporate Events", "Festival", "Other"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

// ──────────────────────────────────────────────────────────────────────────
// Users & Auth
// ──────────────────────────────────────────────────────────────────────────
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(), // bcrypt hash (column name preserved from PHP)
    role: text("role", { enum: ROLES }).notNull().default("employee"),
    phone: text("phone"),
    // NEW columns
    mustChangePwd: integer("must_change_pwd", { mode: "boolean" }).notNull().default(false),
    // Email ownership verification — null until the user proves inbox control.
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$onUpdateFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    roleIdx: index("users_role_idx").on(t.role),
  })
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshToken: text("refresh_token").notNull().unique(),
    rotated: integer("rotated", { mode: "boolean" }).notNull().default(false),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  })
);

export const passwordResets = sqliteTable(
  "password_resets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    userIdx: index("password_resets_user_idx").on(t.userId),
    expiresIdx: index("password_resets_expires_idx").on(t.expiresAt),
  })
);

// ──────────────────────────────────────────────────────────────────────────
// Categories
// ──────────────────────────────────────────────────────────────────────────
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$onUpdateFn(() => new Date()),
});

// ──────────────────────────────────────────────────────────────────────────
// Sub-Categories (under a Master Category)
// ──────────────────────────────────────────────────────────────────────────
export const subcategories = sqliteTable(
  "subcategories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    description: text("description"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$onUpdateFn(() => new Date()),
  },
  (t) => ({
    categoryIdx: index("subcategories_category_idx").on(t.categoryId),
  })
);

// ──────────────────────────────────────────────────────────────────────────
// Items  (quantity + status dual model preserved from PHP)
// ──────────────────────────────────────────────────────────────────────────
export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(), // PHP uppercases on save — preserved
    barcode: text("barcode").notNull().unique(), // "KP" + time() + rand(100,999)
    categoryId: integer("category_id"),
    subcategoryId: integer("subcategory_id"),
    description: text("description"),
    quantity: integer("quantity").notNull().default(0),
    status: text("status", { enum: ITEM_STATUS }).notNull().default("available"),
    currentOrderId: integer("current_order_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$onUpdateFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (t) => ({
    barcodeIdx: uniqueIndex("items_barcode_idx").on(t.barcode),
    categoryIdx: index("items_category_idx").on(t.categoryId),
    subcategoryIdx: index("items_subcategory_idx").on(t.subcategoryId),
    statusIdx: index("items_status_idx").on(t.status),
  })
);

// ──────────────────────────────────────────────────────────────────────────
// Orders  (contact_person holds event name — legacy misnomer preserved)
// ──────────────────────────────────────────────────────────────────────────
export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientName: text("client_name").notNull(),
    contactPerson: text("contact_person"), // holds event name (legacy misnomer)
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    transportContactName: text("transport_contact_name"),
    transportContactPhone: text("transport_contact_phone"),
    eventDate: text("event_date"), // 'YYYY-MM-DD'
    eventTime: text("event_time"), // 'HH:MM'
    setupDate: text("setup_date"),
    setupTime: text("setup_time"),
    address: text("address"), // event address
    billingAddress: text("billing_address"),
    totalBudget: real("total_budget").notNull().default(0),
    status: text("status", { enum: ORDER_STATUS }).notNull().default("upcoming"),
    // Improvement #6 — event category on the order
    eventCategory: text("event_category", { enum: EVENT_CATEGORIES }).default("Other"),
    setupDone: integer("setup_done").notNull().default(0),
    gstEnabled: integer("gst_enabled", { mode: "boolean" }).notNull().default(false),
    // NOTE: no invoice_number / paid_amount / advance_payment columns (matches PHP)
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$onUpdateFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (t) => ({
    statusIdx: index("orders_status_idx").on(t.status),
    eventDateIdx: index("orders_event_date_idx").on(t.eventDate),
    clientIdx: index("orders_client_idx").on(t.clientName),
    categoryIdx: index("orders_event_category_idx").on(t.eventCategory),
  })
);

// ──────────────────────────────────────────────────────────────────────────
// Order Items (dual purpose: reservations + scans — preserved)
// ──────────────────────────────────────────────────────────────────────────
export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    quantity: integer("quantity").notNull().default(1),
    reservedAt: integer("reserved_at", { mode: "timestamp" }),
    scannedOutAt: integer("scanned_out_at", { mode: "timestamp" }),
    scannedInAt: integer("scanned_in_at", { mode: "timestamp" }),
  },
  (t) => ({
    orderIdx: index("order_items_order_idx").on(t.orderId),
    itemIdx: index("order_items_item_idx").on(t.itemId),
  })
);

export const orderAssignments = sqliteTable(
  "order_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    orderIdx: index("order_assignments_order_idx").on(t.orderId),
    userIdx: index("order_assignments_user_idx").on(t.userId),
  })
);

// ──────────────────────────────────────────────────────────────────────────
// Teams
// ──────────────────────────────────────────────────────────────────────────
export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$onUpdateFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const teamMembers = sqliteTable(
  "team_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    teamUserUnique: uniqueIndex("team_members_team_user_idx").on(t.teamId, t.userId),
    userIdx: index("team_members_user_idx").on(t.userId),
  })
);

// ──────────────────────────────────────────────────────────────────────────
// Finance (singular table name 'finance' preserved — NOT renamed)
// ──────────────────────────────────────────────────────────────────────────
export const finance = sqliteTable(
  "finance",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id"), // NULL = "General" entry
    type: text("type", { enum: FINANCE_TYPE }).notNull(),
    category: text("category").notNull(), // free text
    amount: real("amount").notNull(),
    description: text("description"),
    date: text("date"), // 'YYYY-MM-DD'
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$onUpdateFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (t) => ({
    orderIdx: index("finance_order_idx").on(t.orderId),
    typeIdx: index("finance_type_idx").on(t.type),
    dateIdx: index("finance_date_idx").on(t.date),
  })
);

// ──────────────────────────────────────────────────────────────────────────
// Settings — improvement #3 (attach logo in admin panel)
// ──────────────────────────────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$onUpdateFn(() => new Date()),
});

// ──────────────────────────────────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────────────────────────────────
export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    orderId: integer("order_id").references(() => orders.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message"),
    link: text("link"),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId),
  })
);

// ──────────────────────────────────────────────────────────────────────────
// Audit Log (NEW — doesn't exist in PHP)
// ──────────────────────────────────────────────────────────────────────────
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: integer("user_id").notNull().references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: text("before", { mode: "json" }),
    after: text("after", { mode: "json" }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    userIdx: index("audit_user_idx").on(t.userId),
    entityIdx: index("audit_entity_idx").on(t.entityType, t.entityId),
    timestampIdx: index("audit_timestamp_idx").on(t.timestamp),
  })
);

// ──────────────────────────────────────────────────────────────────────────
// Email change requests (admin OTP / employee request → approve → verify)
// ──────────────────────────────────────────────────────────────────────────
export const EMAIL_CHANGE_STATUS = [
  "pending",
  "approved",
  "credentials_ok",
  "completed",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type EmailChangeStatus = (typeof EMAIL_CHANGE_STATUS)[number];

export const emailChangeRequests = sqliteTable(
  "email_change_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull(),
    currentEmail: text("current_email").notNull(),
    requestedNewEmail: text("requested_new_email"),
    status: text("status", { enum: EMAIL_CHANGE_STATUS }).notNull().default("pending"),
    // One-time form access after admin approval (employee flow)
    formTokenHash: text("form_token_hash"),
    formTokenExpiresAt: integer("form_token_expires_at", { mode: "timestamp" }),
    formTokenUsedAt: integer("form_token_used_at", { mode: "timestamp" }),
    formOtpHash: text("form_otp_hash"),
    // After credentials validated — pending values applied only after new-email verify
    pendingNewEmail: text("pending_new_email"),
    pendingPasswordHash: text("pending_password_hash"),
    // One-time new-email verification (OTP + link token)
    verifyTokenHash: text("verify_token_hash"),
    verifyOtpHash: text("verify_otp_hash"),
    verifyExpiresAt: integer("verify_expires_at", { mode: "timestamp" }),
    verifyUsedAt: integer("verify_used_at", { mode: "timestamp" }),
    approvedBy: integer("approved_by"),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
    rejectedAt: integer("rejected_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$onUpdateFn(() => new Date()),
  },
  (t) => ({
    userIdx: index("email_change_user_idx").on(t.userId),
    statusIdx: index("email_change_status_idx").on(t.status),
  })
);
