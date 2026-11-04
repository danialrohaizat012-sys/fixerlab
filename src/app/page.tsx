"use client";

import Link from "next/link";
import { ArrowRight, ClipboardPlus, ShoppingCart, AlertTriangle, Clock, PackageCheck, Wrench, Wallet, TrendingUp, Receipt, PlayCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { dailySeries, dashboardStats } from "@/lib/reports";
import { fmtTime, money, relativeDays, cx } from "@/lib/format";
import { canViewJob } from "@/lib/services";
import { STATUS_META, OPEN_STATUSES } from "@/lib/repair-meta";
import { Button, Card, CardHeader, StatusBadge, Badge } from "@/components/ui";
import { RevenueBars } from "@/components/charts";

function Stat({ label, value, sub, icon, href, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ReactNode; href?: string; tone?: "brand" | "warn" }) {
  const body = (
    <Card className={cx("h-full p-4 transition-colors", href && "hover:border-line-strong")}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-3">{label}</span>
        <span className={cx("grid size-8 place-items-center rounded-lg", tone === "brand" ? "bg-brand-soft text-brand" : tone === "warn" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-surface-2 text-ink-3")}>
          {icon}
        </span>
      </div>
      <div className="num mt-2 font-display text-[26px] font-bold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-ink-3">{sub}</div>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function Dashboard() {
  const { db, me } = useStore();
  const st = dashboardStats(db);
  const series = dailySeries(db, 14);
  const isTech = me.role === "technician";
  const showMoney = can(me.role, "sales.view");
  const showMonth = can(me.role, "reports.view");
  const visibleJobs = db.jobs.filter((j) => canViewJob(me, j));
  const attention = visibleJobs
    .filter((j) => ["awaiting_approval", "ready", "quality_check", "received"].includes(j.status) || (isTech && OPEN_STATUSES.includes(j.status)))
    .slice(0, 7);
  const hour = Number(new Intl.DateTimeFormat("en-MY", { hour: "numeric", hour12: false, timeZone: "Asia/Kuala_Lumpur" }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {greet}, {me.name}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {new Intl.DateTimeFormat("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date())} · Fixerlab {db.settings.branchName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/demo">
            <Button variant="ghost" icon={<PlayCircle className="size-4" />}>
              Demo scenarios
            </Button>
          </Link>
          {can(me.role, "repair.create") && (
            <Link href="/repairs/new">
              <Button icon={<ClipboardPlus className="size-4" />}>New repair intake</Button>
            </Link>
          )}
          {can(me.role, "pos.sell") && (
            <Link href="/pos">
              <Button variant="primary" icon={<ShoppingCart className="size-4" />}>
                Open POS
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {showMoney ? (
          <>
            <Stat label="Today's sales" value={money(st.today.net)} sub={`${st.today.count} transactions`} icon={<TrendingUp className="size-4" />} tone="brand" href="/transactions" />
            {showMonth ? (
              <Stat label="This month" value={money(st.month.net)} sub={`Retail ${money(st.month.retail)} · Repair ${money(st.month.repair)}`} icon={<Receipt className="size-4" />} href="/reports" />
            ) : (
              <Stat label="Transactions today" value={st.today.count} icon={<Receipt className="size-4" />} />
            )}
          </>
        ) : (
          <>
            <Stat label="My open jobs" value={visibleJobs.filter((j) => OPEN_STATUSES.includes(j.status) && j.status !== "ready").length} icon={<Wrench className="size-4" />} tone="brand" href="/repairs" />
            <Stat label="In quality check" value={visibleJobs.filter((j) => j.status === "quality_check").length} icon={<PackageCheck className="size-4" />} href="/repairs" />
          </>
        )}
        <Stat label="Active repair jobs" value={st.active.length} sub={`${st.pendingApproval.length} awaiting customer approval`} icon={<Wrench className="size-4" />} href="/repairs" />
        <Stat label="Ready for collection" value={st.ready.length} sub={showMoney && st.readyBalances.length ? `${money(st.readyBalances.reduce((a, x) => a + x.bal, 0))} to collect` : "Notify customers"} icon={<PackageCheck className="size-4" />} href="/pos?mode=collect" />
        {showMoney && (
          <>
            <Stat label="Outstanding balances" value={money(st.outstanding)} sub={`Deposits held: ${money(st.depositsHeld)}`} icon={<Wallet className="size-4" />} tone={st.outstanding ? "warn" : undefined} href="/customers" />
            <Stat label="Pending approvals" value={st.pendingApproval.length} sub="Quotations sent to customers" icon={<Clock className="size-4" />} href="/repairs?status=awaiting_approval" />
          </>
        )}
        {can(me.role, "inventory.view") && (
          <Stat label="Low-stock items" value={st.lowStock.length} sub="At or below minimum" icon={<AlertTriangle className="size-4" />} tone={st.lowStock.length ? "warn" : undefined} href="/inventory?low=1" />
        )}
        {showMoney && <Stat label="Completed transactions (month)" value={st.month.count} icon={<Receipt className="size-4" />} href="/transactions" />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        {showMoney ? (
          <Card>
            <CardHeader title="Revenue — last 14 days" subtitle="Repair revenue is recognised when the invoice is issued at collection (deposits excluded)." />
            <div className="p-4 sm:p-5">
              <RevenueBars data={series} />
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="My workload by status" />
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
              {OPEN_STATUSES.map((s) => (
                <Link key={s} href={`/repairs?status=${s}`} className="rounded-lg border border-line p-3 hover:border-line-strong">
                  <div className="text-xs text-ink-3">{STATUS_META[s].label}</div>
                  <div className="num mt-1 text-xl font-bold">{visibleJobs.filter((j) => j.status === s).length}</div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader
            title={isTech ? "My jobs" : "Needs attention"}
            action={
              <Link href="/repairs" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
                All jobs <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <ul className="divide-y divide-line">
            {attention.map((j) => {
              const c = db.customers.find((x) => x.id === j.customerId);
              const d = db.devices.find((x) => x.id === j.deviceId);
              return (
                <li key={j.id}>
                  <Link href={`/repairs/${j.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{j.jobNo}</span>
                        <span className="text-xs text-ink-3">{relativeDays(j.updatedAt)}</span>
                      </div>
                      <div className="truncate text-sm">
                        {d?.brand} {d?.model} <span className="text-ink-3">· {c?.name}</span>
                      </div>
                    </div>
                    <StatusBadge status={j.status} />
                  </Link>
                </li>
              );
            })}
            {!attention.length && <li className="px-4 py-8 text-center text-sm text-ink-3">Nothing needs attention right now.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {showMoney && (
          <Card>
            <CardHeader title="Recent transactions" action={<Link href="/transactions" className="text-sm text-ink-3 hover:text-ink">View all</Link>} />
            <ul className="divide-y divide-line">
              {db.sales.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link href={`/transactions?r=${s.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2">
                    <span className="font-mono text-xs">{s.receiptNo}</span>
                    <Badge tone={s.kind === "repair" ? "violet" : "slate"}>{s.kind === "repair" ? "Repair" : "Retail"}</Badge>
                    <span className="truncate text-ink-3">{s.lines.map((l) => l.description).join(", ")}</span>
                    <span className="ml-auto shrink-0 text-xs text-ink-3">{fmtTime(s.at)}</span>
                    <span className="num w-24 shrink-0 text-right font-medium">{money(s.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {can(me.role, "inventory.view") && (
          <Card>
            <CardHeader title="Low-stock alerts" action={<Link href="/inventory?low=1" className="text-sm text-ink-3 hover:text-ink">Inventory</Link>} />
            <ul className="divide-y divide-line">
              {st.lowStock.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <AlertTriangle className={cx("size-4 shrink-0", i.stock <= 0 ? "text-red-600" : "text-amber-600")} />
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  <Badge tone={i.type === "part" ? "blue" : "slate"}>{i.type === "part" ? "Part" : "Retail"}</Badge>
                  <span className="num w-24 text-right">
                    <span className="font-semibold">{i.stock}</span> <span className="text-ink-3">/ min {i.minStock}</span>
                  </span>
                </li>
              ))}
              {!st.lowStock.length && <li className="px-4 py-8 text-center text-sm text-ink-3">All stock above minimum.</li>}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
