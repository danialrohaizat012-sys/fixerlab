"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil, Phone, Mail, ClipboardPlus } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { heldDeposits, jobFinancials, saleBalance } from "@/lib/services";
import { cx, fmtDate, money } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Denied, SampleChip, StatusBadge, Tabs, Table, td, th } from "@/components/ui";
import { DeviceIcon, PaymentChip } from "@/components/repair-bits";
import { CustomerDialog } from "@/components/customer-dialog";

type Tab = "repairs" | "purchases" | "devices" | "warranty";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { db, me } = useStore();
  const [tab, setTab] = useState<Tab>("repairs");
  const [edit, setEdit] = useState(false);
  const c = db.customers.find((x) => x.id === id);
  if (!can(me.role, "customers.view")) return <Denied what="view customer records" />;
  if (!c) return <Denied what="view this customer (not found)" />;

  const jobs = db.jobs.filter((j) => j.customerId === c.id);
  const sales = db.sales.filter((s) => s.customerId === c.id);
  const devices = db.devices.filter((d) => d.customerId === c.id);
  const warranties = db.warranties.filter((w) => w.customerId === c.id);
  const spent = sales.reduce((a, s) => a + s.total, 0);
  const outstandingSales = sales.reduce((a, s) => a + Math.max(0, saleBalance(db, s)), 0);
  const deposits = jobs.reduce((a, j) => a + Math.max(0, heldDeposits(db, j.id)), 0);

  return (
    <div>
      <Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <Card className="mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid size-12 place-items-center rounded-full bg-ink font-display text-lg font-bold text-surface">{c.name[0]}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-semibold">{c.name}</h1>
              {c.sample && <SampleChip />}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" /> {c.phone}
              </span>
              {c.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" /> {c.email}
                </span>
              )}
              <span className="text-ink-3">Customer since {fmtDate(c.createdAt)}</span>
            </div>
            {c.notes && <p className="mt-2 text-sm text-ink-3">{c.notes}</p>}
          </div>
          <div className="flex gap-2">
            {can(me.role, "customers.edit") && (
              <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>
                Edit
              </Button>
            )}
            {can(me.role, "repair.create") && (
              <Link href={`/repairs/new?prefill=${encodeURIComponent(JSON.stringify({ phone: c.phone }))}`}>
                <Button size="sm" variant="primary" icon={<ClipboardPlus className="size-4" />}>
                  New repair
                </Button>
              </Link>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          {[
            ["Total spent", money(spent)],
            ["Repairs", `${jobs.length}`],
            ["Outstanding", money(outstandingSales)],
            ["Deposits held", money(deposits)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-xs text-ink-3">{k}</div>
              <div className={cx("num mt-0.5 text-lg font-semibold", k === "Outstanding" && outstandingSales > 0 && "text-amber-700 dark:text-amber-300")}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "repairs", label: "Repair history", count: jobs.length },
          { id: "purchases", label: "Purchases", count: sales.length },
          { id: "devices", label: "Devices", count: devices.length },
          { id: "warranty", label: "Warranty", count: warranties.length },
        ]}
      />
      <Card className="mt-4">
        {tab === "repairs" && (
          <Table>
            <thead>
              <tr>
                <th className={th}>Job</th>
                <th className={th}>Device</th>
                <th className={th}>Problem</th>
                <th className={th}>Status</th>
                <th className={th}>Payment</th>
                <th className={th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const d = db.devices.find((x) => x.id === j.deviceId);
                const f = jobFinancials(db, j);
                return (
                  <tr key={j.id}>
                    <td className={td}>
                      <Link href={`/repairs/${j.id}`} className="font-mono text-[13px] font-semibold hover:text-brand">
                        {j.jobNo}
                      </Link>
                    </td>
                    <td className={td}>
                      {d?.brand} {d?.model}
                    </td>
                    <td className={cx(td, "max-w-[240px] truncate text-ink-2")}>{j.reportedProblem}</td>
                    <td className={td}>
                      <StatusBadge status={j.status} />
                    </td>
                    <td className={td}>
                      <PaymentChip status={f.status} balance={f.balance} />
                    </td>
                    <td className={cx(td, "text-ink-3")}>{fmtDate(j.createdAt)}</td>
                  </tr>
                );
              })}
              {!jobs.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-ink-3">
                    No repairs.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
        {tab === "purchases" && (
          <Table>
            <thead>
              <tr>
                <th className={th}>Receipt</th>
                <th className={th}>Type</th>
                <th className={th}>Items</th>
                <th className={cx(th, "text-right")}>Total</th>
                <th className={th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className={td}>
                    <Link href={`/transactions?r=${s.id}`} className="font-mono text-[13px] font-semibold hover:text-brand">
                      {s.receiptNo}
                    </Link>
                  </td>
                  <td className={td}>
                    <Badge tone={s.kind === "repair" ? "violet" : "slate"}>{s.kind}</Badge>
                  </td>
                  <td className={cx(td, "max-w-[280px] truncate")}>{s.lines.map((l) => l.description).join(", ")}</td>
                  <td className={cx(td, "num text-right font-medium")}>{money(s.total)}</td>
                  <td className={cx(td, "text-ink-3")}>{fmtDate(s.at)}</td>
                </tr>
              ))}
              {!sales.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-ink-3">
                    No purchases linked to this customer.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
        {tab === "devices" && (
          <ul className="divide-y divide-line">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <DeviceIcon category={d.category} className="size-5 text-ink-3" />
                <div className="flex-1">
                  <div className="font-medium">
                    {d.brand} {d.model}
                  </div>
                  <div className="text-xs text-ink-3">
                    {d.category} {d.color && `· ${d.color}`} {d.serial && `· ${d.serial}`}
                  </div>
                </div>
                <span className="text-xs text-ink-3">{jobs.filter((j) => j.deviceId === d.id).length} job(s)</span>
              </li>
            ))}
            {!devices.length && <li className="px-5 py-8 text-center text-sm text-ink-3">No devices.</li>}
          </ul>
        )}
        {tab === "warranty" && (
          <ul className="divide-y divide-line">
            {warranties.map((w) => {
              const active = new Date(w.endsOn).getTime() > Date.now() && !w.voided;
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
                  <span className="font-mono font-semibold">{w.warrantyNo}</span>
                  <Badge tone={active ? "green" : "gray"}>{active ? "Active" : "Expired"}</Badge>
                  <span className="flex-1 text-ink-2">{w.coverage}</span>
                  <span className="text-ink-3">until {fmtDate(w.endsOn)}</span>
                </li>
              );
            })}
            {!warranties.length && <li className="px-5 py-8 text-center text-sm text-ink-3">No warranty records.</li>}
          </ul>
        )}
      </Card>
      {edit && <CustomerDialog customer={c} onClose={() => setEdit(false)} />}
    </div>
  );
}
