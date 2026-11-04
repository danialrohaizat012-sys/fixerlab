"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { saleBalance } from "@/lib/services";
import { cx, fmtDate, money } from "@/lib/format";
import { Button, Card, Denied, Input, PageHeader, SampleChip, Table, td, th } from "@/components/ui";
import { CustomerDialog } from "@/components/customer-dialog";

export default function CustomersPage() {
  const { db, me } = useStore();
  const [q, setQ] = useState("");
  const [add, setAdd] = useState(false);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return db.customers
      .filter((c) => !s || c.name.toLowerCase().includes(s) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)))
      .map((c) => {
        const sales = db.sales.filter((x) => x.customerId === c.id);
        const jobs = db.jobs.filter((j) => j.customerId === c.id);
        const outstanding = sales.reduce((a, x) => a + Math.max(0, saleBalance(db, x)), 0);
        const last = [...sales.map((x) => x.at), ...jobs.map((j) => j.createdAt)].sort().pop();
        return { c, spent: sales.reduce((a, x) => a + x.total, 0), jobs: jobs.length, open: jobs.filter((j) => !["completed", "cancelled"].includes(j.status)).length, outstanding, last };
      });
  }, [db, q]);

  if (!can(me.role, "customers.view")) return <Denied what="view customer records" />;

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Customer data is confidential — visible to authorised staff only."
        actions={
          can(me.role, "customers.edit") && (
            <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAdd(true)}>
              Add customer
            </Button>
          )
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone number" className="pl-9" autoFocus />
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Phone</th>
              <th className={cx(th, "text-right")}>Repairs</th>
              <th className={cx(th, "text-right")}>Total spent</th>
              <th className={cx(th, "text-right")}>Outstanding</th>
              <th className={th}>Last visit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, spent, jobs, open, outstanding, last }) => (
              <tr key={c.id}>
                <td className={td}>
                  <Link href={`/customers/${c.id}`} className="font-medium hover:text-brand">
                    {c.name}
                  </Link>{" "}
                  {c.sample && <SampleChip />}
                </td>
                <td className={cx(td, "num text-ink-2")}>{c.phone}</td>
                <td className={cx(td, "num text-right")}>
                  {jobs}
                  {open > 0 && <span className="ml-1 text-xs text-ink-3">({open} open)</span>}
                </td>
                <td className={cx(td, "num text-right")}>{money(spent)}</td>
                <td className={cx(td, "num text-right", outstanding > 0 && "font-semibold text-amber-700 dark:text-amber-300")}>{outstanding ? money(outstanding) : "—"}</td>
                <td className={cx(td, "text-ink-3")}>{last ? fmtDate(last) : "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-ink-3">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
      {add && <CustomerDialog onClose={() => setAdd(false)} />}
    </div>
  );
}
