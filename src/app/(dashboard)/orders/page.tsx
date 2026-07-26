// src/app/(dashboard)/orders/page.tsx
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { listOrders, statusCounts } from "@/lib/orders-queries";
import { OrdersView } from "@/components/orders/OrdersView";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;

  const sp = await searchParams;
  const filters = {
    status: sp.status,
    year: sp.year,
    startDate: sp.startDate,
    endDate: sp.endDate,
    search: sp.search,
  };
  const openNew = sp.new === "1";

  // Default to All Orders when no filter is chosen (avoid empty first-load state)
  const effectiveFilters = {
    ...filters,
    status: filters.status || "all",
  };
  const hasFilter = true;
  let orders: Awaited<ReturnType<typeof listOrders>> = [];
  let counts: Awaited<ReturnType<typeof statusCounts>> = { ongoing: 0, upcoming: 0, completed: 0 };
  try {
    orders = await listOrders(effectiveFilters);
    counts = await statusCounts();
  } catch { /* use defaults */ }

  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading orders…</div>}>
      <OrdersView orders={orders} counts={counts} filters={effectiveFilters as Record<string, string>} hasFilter={hasFilter} openNew={openNew} />
    </Suspense>
  );
}
