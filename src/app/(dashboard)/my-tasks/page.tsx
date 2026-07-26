import { and, eq, isNull, ne } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { Card, EmptyState, Button } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateDMY } from "@/lib/utils";
import Link from "next/link";
import { SetupDoneBtn } from "./SetupDoneBtn";

export default async function MyTasksPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const assigned = await db
    .select({
      id: schema.orders.id,
      clientName: schema.orders.clientName,
      contactPerson: schema.orders.contactPerson,
      eventDate: schema.orders.eventDate,
      eventTime: schema.orders.eventTime,
      setupDate: schema.orders.setupDate,
      address: schema.orders.address,
      status: schema.orders.status,
      setupDone: schema.orders.setupDone,
    })
    .from(schema.orderAssignments)
    .innerJoin(schema.orders, eq(schema.orderAssignments.orderId, schema.orders.id))
    .where(and(eq(schema.orderAssignments.userId, user.id), isNull(schema.orders.deletedAt), ne(schema.orders.status, "cancelled")))
    .orderBy(schema.orders.setupDate);

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-gray-900">My Tasks</h1>
      {assigned.length === 0 ? (
        <EmptyState title="No tasks assigned" hint="Your assigned events will appear here." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {assigned.map((o) => (
            <Card key={o.id} className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">#{o.id} · {o.contactPerson ?? o.clientName}</h3>
                <StatusBadge status={o.status} />
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <p>Client: {o.clientName}</p>
                <p>Date: {formatDateDMY(o.eventDate)} {o.eventTime ?? ""}</p>
                <p>Address: {o.address ?? "—"}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <Link href="/scan"><Button variant="primary">Scan Items</Button></Link>
                {o.status !== "completed" && o.status !== "cancelled" && (
                  <SetupDoneBtn orderId={o.id} done={!!o.setupDone} />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
