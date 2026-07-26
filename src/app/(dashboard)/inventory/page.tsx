// src/app/(dashboard)/inventory/page.tsx
import { getCurrentUser } from "@/lib/auth";
import { listItems } from "@/lib/queries";
import { db, schema } from "@/lib/db";
import { InventoryView } from "@/components/inventory/InventoryView";
import { Card } from "@/components/ui";
import { todayISO } from "@/lib/utils";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;

  const sp = await searchParams;
  const date = sp.date || todayISO();

  let items: Awaited<ReturnType<typeof listItems>> = [];
  let categories: { id: number; name: string }[] = [];
  let subcategories: { id: number; name: string; categoryId: number }[] = [];
  try {
    const r = await Promise.all([
      listItems({ onDate: date }),
      db.select().from(schema.categories),
      db.select().from(schema.subcategories),
    ]);
    items = r[0]; categories = r[1]; subcategories = r[2];
  } catch {
    return <Card className="p-8 text-center"><p className="text-sm text-red-500">Could not load inventory. Try refreshing.</p></Card>;
  }

  return (
    <InventoryView
      categories={categories}
      subcategories={subcategories}
      items={items}
      date={date}
    />
  );
}
