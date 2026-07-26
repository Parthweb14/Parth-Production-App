// src/app/(dashboard)/categories/page.tsx
import { isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { CategoriesView } from "@/components/categories/CategoriesView";

type MasterCat = { id: number; name: string; description: string | null };
type SubCat = { id: number; name: string; categoryId: number; description: string | null };
type ItemRow = { id: number; name: string; barcode: string; subcategoryId: number | null; categoryId: number | null; quantity: number; description: string | null };

export default async function CategoriesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;

  try {
    const [categories, subcategories, items] = await Promise.all([
      db.select({ id: schema.categories.id, name: schema.categories.name, description: schema.categories.description }).from(schema.categories).orderBy(schema.categories.name),
      db.select({ id: schema.subcategories.id, name: schema.subcategories.name, categoryId: schema.subcategories.categoryId, description: schema.subcategories.description }).from(schema.subcategories).orderBy(schema.subcategories.name),
      db.select({ id: schema.items.id, name: schema.items.name, barcode: schema.items.barcode, subcategoryId: schema.items.subcategoryId, categoryId: schema.items.categoryId, quantity: schema.items.quantity, description: schema.items.description })
        .from(schema.items)
        .where(isNull(schema.items.deletedAt)),
    ]);

    return <CategoriesView categories={categories as MasterCat[]} subcategories={subcategories as SubCat[]} items={items as ItemRow[]} />;
  } catch {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-red-700">Something went wrong</h2>
        <p className="mt-1 text-sm text-red-600">Could not load categories. Try refreshing the page.</p>
      </div>
    );
  }
}
