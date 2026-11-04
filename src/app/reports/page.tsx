"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { dailySeries, lastNDays, paymentsByMethod, revenueBetween } from "@/lib/reports";
import { cx, money, myDateKey } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/repair-meta";
import { Card, CardHeader, Denied, Notice, PageHeader, Select, Table, td, th } from "@/components/ui";
import { HBars, RevenueBars } from "@/components/charts";

export default function ReportsPage() {
  const { db, me } = useStore();
  const [range, setRange] = useState("30");
  const days = range === "month" ? Number(myDateKey(new Date()).slice(8, 10)) : Number(range);
  const keys = lastNDays(days);
  const from = keys[0];
  const to = keys[keys.length - 1];

  const data = useMemo(() => {
    const rev = revenueBetween(db, from, to);
    const series = dailySeries(db, days);
    const methods = paymentsByMethod(db, from, to);
    const inRange = (iso: string) => {
      const k = myDateKey(iso);
      return k >= from && k <= to;
    };
    const jobsIn = db.jobs.filter((j) => inRange(j.createdAt));
    const byCat = new Map<string, number>();
    for (const j of jobsIn) {
      const d = db.devices.find((x) => x.id === j.deviceId);
      byCat.set(d?.category ?? "Other", (byCat.get(d?.category ?? "Other") ?? 0) + 1);
    }
    const techs = db.staff
      .filter((s) => s.role === "technician")
      .map((t) => ({
        t,
        open: db.jobs.filter((j) => j.technicianId === t.id && OPEN_STATUSES.includes(j.status) && j.status !== "ready").length,
        done: db.jobs.filter((j) => j.technicianId === t.id && j.status === "completed" && inRange(j.updatedAt)).length,
        parts: db.repairParts.filter((p) => p.actorId === t.id && !p.reversed && inRange(p.at)).reduce((a, p) => a + p.qty, 0),
      }));
    const mv = new Map<string, { in: number; out: number }>();
    for (const m of db.movements) {
      if (!inRange(m.at) || m.reason === "opening") continue;
      const r = mv.get(m.reason) ?? { in: 0, out: 0 };
      if (m.qty > 0) r.in += m.qty;
      else r.out += -m.qty;
      mv.set(m.reason, r);
    }
    const top = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of db.sales) {
      if (!inRange(s.at) || s.kind !== "retail") continue;
      for (const l of s.lines) {
        const r = top.get(l.description) ?? { name: l.description, qty: 0, revenue: 0 };
        r.qty += l.qty - l.refundedQty;
        r.revenue += l.unitPrice * (l.qty - l.refundedQty);
        top.set(l.description, r);
      }
    }
    return { rev, series, methods, jobsIn, byCat, techs, mv, top: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8) };
  }, [db, from, to, days]);

  if (!can(me.role, "reports.view")) return <Denied what="view reports" />;
  const gp = data.rev.net - data.rev.cogs;
  const retail = db.settings.retailEnabled;
  const cards: [string, string, string][] = [
    ["Net revenue", money(data.rev.net), `${data.rev.count} ${retail ? "transactions" : "repair invoices"}`],
    ...(retail
      ? ([
          ["Retail revenue", money(data.rev.retail), `${data.rev.net ? Math.round((data.rev.retail / data.rev.net) * 100) : 0}% of total`],
          ["Repair revenue", money(data.rev.repair), "Invoiced at collection"],
        ] as [string, string, string][])
      : ([["Average repair invoice", money(data.rev.count ? Math.round(data.rev.repair / data.rev.count) : 0), "Labour + parts + services"]] as [string, string, string][])),
    ["Refunds", money(data.rev.refunds), "Deducted on refund date"],
    ["Est. gross profit", money(gp), `${data.rev.net ? Math.round((gp / data.rev.net) * 100) : 0}% margin · after parts cost`],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle={`${from} to ${to} (Malaysia time)`}
        actions={
          <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-auto">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="month">This month</option>
          </Select>
        }
      />
      <Notice tone="demo">Figures are calculated from fictional sample data.</Notice>
      <div className={cx("grid grid-cols-2 gap-3", retail ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        {cards.map(([k, v, s]) => (
          <Card key={k} className="p-4">
            <div className="text-[13px] text-ink-3">{k}</div>
            <div className="num mt-1.5 font-display text-2xl font-bold">{v}</div>
            <div className="mt-1 text-xs text-ink-3">{s}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title={retail ? "Daily sales" : "Daily repair revenue"} subtitle={retail ? "Retail vs repair revenue per day" : "Repair invoices issued at collection, per day"} />
        <div className="p-4 sm:p-5">
          <RevenueBars data={data.series} height={220} showRetail={retail} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Collections by payment method" subtitle="Net of refunds; includes repair deposits received" />
          <div className="p-4 sm:p-5">
            <HBars rows={data.methods.map((m) => ({ label: m.name, value: m.amount })).sort((a, b) => b.value - a.value)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Repair job volume" subtitle={`${data.jobsIn.length} jobs received in period`} />
          <div className="p-4 sm:p-5">
            <HBars rows={[...data.byCat.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} format={(n) => `${n} job${n === 1 ? "" : "s"}`} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Technician workload" />
          <Table>
            <thead>
              <tr>
                <th className={th}>Technician</th>
                <th className={cx(th, "text-right")}>Open jobs now</th>
                <th className={cx(th, "text-right")}>Completed (period)</th>
                <th className={cx(th, "text-right")}>Parts fitted</th>
              </tr>
            </thead>
            <tbody>
              {data.techs.map(({ t, open, done, parts }) => (
                <tr key={t.id}>
                  <td className={td}>{t.name}</td>
                  <td className={cx(td, "num text-right")}>{open}</td>
                  <td className={cx(td, "num text-right")}>{done}</td>
                  <td className={cx(td, "num text-right")}>{parts}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Inventory movement" subtitle="Units in / out by movement type" />
          <Table>
            <thead>
              <tr>
                <th className={th}>Type</th>
                <th className={cx(th, "text-right")}>In</th>
                <th className={cx(th, "text-right")}>Out</th>
              </tr>
            </thead>
            <tbody>
              {[...data.mv.entries()].map(([k, v]) => (
                <tr key={k}>
                  <td className={cx(td, "capitalize")}>{k.replace("_", " ")}</td>
                  <td className={cx(td, "num text-right")}>{v.in || "—"}</td>
                  <td className={cx(td, "num text-right")}>{v.out || "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        {retail && (
        <Card className="lg:col-span-2">
          <CardHeader title="Top retail products" />
          <Table>
            <thead>
              <tr>
                <th className={th}>Product</th>
                <th className={cx(th, "text-right")}>Units</th>
                <th className={cx(th, "text-right")}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((r) => (
                <tr key={r.name}>
                  <td className={td}>{r.name}</td>
                  <td className={cx(td, "num text-right")}>{r.qty}</td>
                  <td className={cx(td, "num text-right")}>{money(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        )}
      </div>
    </div>
  );
}
