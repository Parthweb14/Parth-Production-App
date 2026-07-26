// src/server/category-actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { generateBarcode } from "@/lib/barcode";

// ── Master Category CRUD ──
export async function createCategory(input: { name: string; description?: string }) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  if (input.name.trim().length < 2) throw new Error("Category name must be at least 2 characters.");
  await db.insert(schema.categories).values({ name: input.name.trim(), description: input.description?.trim() || null });
  revalidatePath("/categories");
}

export async function updateCategory(id: number, input: { name?: string; description?: string }) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const patch: { name?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) throw new Error("Category name must be at least 2 characters.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (Object.keys(patch).length === 0) return;
  await db.update(schema.categories).set(patch).where(eq(schema.categories.id, id));
  revalidatePath("/categories");
}

export async function deleteCategory(id: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const [directItems, itemsInSubs] = await Promise.all([
    db.select({ id: schema.items.id }).from(schema.items).where(and(eq(schema.items.categoryId, id), isNull(schema.items.deletedAt))).limit(1),
    db.select({ id: schema.items.id }).from(schema.items).innerJoin(schema.subcategories, eq(schema.items.subcategoryId, schema.subcategories.id)).where(and(eq(schema.subcategories.categoryId, id), isNull(schema.items.deletedAt))).limit(1),
  ]);
  if (directItems.length > 0 || itemsInSubs.length > 0) {
    throw new Error("Cannot delete a category that has items in its sub-categories.");
  }
  try {
    await db.delete(schema.categories).where(eq(schema.categories.id, id));
  } catch {
    throw new Error("Failed to delete category. Please try again.");
  }
  revalidatePath("/categories");
}

// ── Sub Category CRUD ──
export async function createSubcategory(input: { name: string; categoryId: number; description?: string }) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  if (input.name.trim().length < 2) throw new Error("Sub-category name must be at least 2 characters.");
  await db.insert(schema.subcategories).values({
    name: input.name.trim(),
    categoryId: input.categoryId,
    description: input.description?.trim() || null,
  });
  revalidatePath("/categories");
}

export async function updateSubcategory(id: number, input: { name?: string; description?: string }) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const patch: { name?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) throw new Error("Sub-category name must be at least 2 characters.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (Object.keys(patch).length === 0) return;
  await db.update(schema.subcategories).set(patch).where(eq(schema.subcategories.id, id));
  revalidatePath("/categories");
}

export async function deleteSubcategory(id: number) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  const inUse = await db.select({ id: schema.items.id }).from(schema.items).where(and(eq(schema.items.subcategoryId, id), isNull(schema.items.deletedAt))).limit(1);
  if (inUse.length > 0) throw new Error("Cannot delete sub-category with items in it.");
  try {
    await db.delete(schema.subcategories).where(eq(schema.subcategories.id, id));
  } catch {
    throw new Error("Failed to delete sub-category. Please try again.");
  }
  revalidatePath("/categories");
}

// ── Item (under sub-category) ──
export async function createCategoryItem(input: { name: string; subcategoryId: number; description?: string; quantity: number }) {
  const user = await requireAdmin();
  if (!user) throw new Error("Unauthorized");
  if (!input.subcategoryId) throw new Error("Items must be created under a sub-category.");
  // C7: resolve the subcategory's categoryId so the item is filed under the parent category too.
  const [sub] = await db.select({ categoryId: schema.subcategories.categoryId }).from(schema.subcategories).where(eq(schema.subcategories.id, input.subcategoryId)).limit(1);
  if (!sub) throw new Error("Sub-category not found.");
  const name = input.name.trim().toUpperCase();
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty < 0) throw new Error("Quantity must be a non-negative number.");
  // L15: retry the insert on barcode collisions, regenerating the barcode each attempt.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.insert(schema.items).values({
        name,
        categoryId: sub.categoryId,
        subcategoryId: input.subcategoryId,
        description: input.description?.trim() || null,
        quantity: Math.floor(qty),
        barcode: generateBarcode(),
        status: "available",
      });
      revalidatePath("/categories");
      revalidatePath("/inventory");
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  console.error("[categories] barcode collision after 3 attempts:", lastErr);
  throw new Error("Failed to generate a unique barcode. Please try again.");
}
