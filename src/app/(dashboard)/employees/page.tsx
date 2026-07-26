// src/app/(dashboard)/employees/page.tsx
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { EmployeesView } from "@/components/employees/EmployeesView";
import { Card } from "@/components/ui";

export default async function EmployeesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  try {
    const employees = await db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, phone: schema.users.phone, active: schema.users.active })
      .from(schema.users)
      .where(and(eq(schema.users.role, "employee"), isNull(schema.users.deletedAt)));
    return <EmployeesView employees={employees} />;
  } catch {
    return <Card className="p-8 text-center"><p className="text-sm text-red-500">Could not load employees. Try refreshing.</p></Card>;
  }
}
