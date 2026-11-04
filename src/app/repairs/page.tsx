"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ClipboardPlus, LayoutGrid, List, Search, Clock } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { canViewJob, jobFinancials } from "@/lib/services";
import { STATUS_META, STATUS_ORDER } from "@/lib/repair-meta";
import { cx, fmtDate, relativeDays } from "@/lib/format";
import type { RepairJob, RepairStatus } from "@/lib/types";
import { Button, Card, Input, PageHeader, Select, StatusBadge, Table, th, td, Badge } from "@/components/ui";
import { DeviceIcon, PaymentChip } from "@/components/repair-bits";

const BOARD: RepairStatus[] = ["received", "diagnosing", "awaiting_approval", "waiting_parts", "in_progress", "quality_check", "ready"];

export default function RepairsPage() {
  const { db, me } = useStore();
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [tech, setTech] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("status");
    if (s) {
      setStatus(s);
      setView("list");
    }
    try {
      const v = localStorage.getItem("fixerlab-repairs-view");
      if (v === "list" || v === "board") setView(s ? "list" : v);
    } catch {}
  }, []);
  const changeView = (v: "board" | "list") => {
    setView(v);
    try {
      localStorage.setItem("fixerlab-repairs-view", v);
    } catch {}
  };

  const lastChange = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of db.statusEvents) if (e.from !== e.to && !m.has(e.jobId)) m.set(e.jobId, e.at);
    return m;
  }, [db.statusEvents]);

  const jobs = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.jobs.filter((j) => {
      if (!canViewJob(me, j)) return false;
      if (tech && j.technicianId !== (tech === "none" ? undefined : tech)) return false;
      if (status && j.status !== status) return false;
      if (!s) return true;
      const c = db.customers.find((x) => x.id === j.customerId);
      const d = db.devices.find((x) => x.id === j.deviceId);
      return `${j.jobNo} ${c?.name} ${c?.phone} ${d?.brand} ${d?.model} ${d?.serial ?? ""} ${j.reportedProblem}`.toLowerCase().includes(s);
    });
  }, [db, me, q, tech, status]);

  const techs = db.staff.filter((s) => s.role === "technician");

  return (
    <div>
      <PageHeader
        title={me.role === "technician" ? "My Repair Jobs" : "Repair Jobs"}
        subtitle={me.role === "technician" ? "Only jobs assigned to you are shown." : `${jobs.length} jobs`}
        actions={
          can(me.role, "repair.create") && (
            <Link href="/repairs/new">
              <Button variant="primary" icon={<ClipboardPlus className="size-4" />}>
                New intake
              </Button>
            </Link>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job no., customer, phone, device, IMEI" className="pl-9" />
        </div>
        {me.role !== "technician" && (
          <Select value={tech} onChange={(e) => setTech(e.target.value)} className="w-auto">
            <option value="">All technicians</option>
            <option value="none">Unassigned</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
        {view === "list" && (
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
            <option value="">All statuses</option>
            {[...STATUS_ORDER, "cancelled", "unrepairable"].map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s as RepairStatus].label}
              </option>
            ))}
          </Select>
        )}
        <div className="ml-auto inline-flex rounded-lg border border-line bg-surface p-0.5">
          <button onClick={() => changeView("board")} className={cx("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === "board" ? "bg-ink text-surface" : "text-ink-2")}>
            <LayoutGrid className="size-4" /> Board
          </button>
          <button onClick={() => changeView("list")} className={cx("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === "list" ? "bg-ink text-surface" : "text-ink-2")}>
            <List className="size-4" /> List
          </button>
        </div>
      </div>

      {view === "board" ? (
        <div className="scroll-thin -mx-3 overflow-x-auto px-3 pb-3 sm:-mx-5 sm:px-5">
          <div className="flex min-w-max gap-3">
            {BOARD.map((s) => {
              const col = jobs.filter((j) => j.status === s || (s === "diagnosing" && j.status === "unrepairable"));
              return (
                <div key={s} className="w-[248px] shrink-0 rounded-xl border border-line bg-surface-2/60 p-2">
                  <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
                    <StatusBadge status={s} />
                    <span className="num text-xs font-semibold text-ink-3">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map((j) => (
                      <JobCard key={j.id} job={j} since={lastChange.get(j.id) ?? j.updatedAt} />
                    ))}
                    {!col.length && <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-3">No jobs</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-3">Completed and cancelled jobs are in the List view.</p>
        </div>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th className={th}>Job</th>
                <th className={th}>Device</th>
                <th className={th}>Customer</th>
                <th className={th}>Technician</th>
                <th className={th}>Status</th>
                <th className={th}>Payment</th>
                <th className={th}>Received</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const c = db.customers.find((x) => x.id === j.customerId);
                const d = db.devices.find((x) => x.id === j.deviceId);
                const t = db.staff.find((x) => x.id === j.technicianId);
                const f = jobFinancials(db, j);
                return (
                  <tr key={j.id}>
                    <td className={td}>
                      <Link href={`/repairs/${j.id}`} className="font-mono text-[13px] font-semibold hover:text-brand">
                        {j.jobNo}
                      </Link>
                    </td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-2">
                        <DeviceIcon category={d?.category} className="size-4 text-ink-3" />
                        {d?.brand} {d?.model}
                      </span>
                    </td>
                    <td className={td}>{c?.name}</td>
                    <td className={td}>{t?.name ?? <span className="text-ink-3">Unassigned</span>}</td>
                    <td className={td}>
                      <StatusBadge status={j.status} />
                    </td>
                    <td className={td}>
                      <PaymentChip status={f.status} balance={f.balance} />
                    </td>
                    <td className={cx(td, "whitespace-nowrap text-ink-3")}>{fmtDate(j.createdAt)}</td>
                  </tr>
                );
              })}
              {!jobs.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-ink-3">
                    No jobs match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function JobCard({ job, since }: { job: RepairJob; since: string }) {
  const { db } = useStore();
  const c = db.customers.find((x) => x.id === job.customerId);
  const d = db.devices.find((x) => x.id === job.deviceId);
  const t = db.staff.find((x) => x.id === job.technicianId);
  const days = (Date.now() - new Date(since).getTime()) / 86_400_000;
  const stale = days > 3 && !["ready"].includes(job.status);
  return (
    <Link href={`/repairs/${job.id}`} className="block rounded-lg border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-line-strong hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-semibold">{job.jobNo}</span>
        {job.status === "unrepairable" && <Badge tone="gray">Unrepairable</Badge>}
        <span className={cx("inline-flex items-center gap-1 text-[11px]", stale ? "font-semibold text-amber-700 dark:text-amber-300" : "text-ink-3")} title="Time in current status">
          <Clock className="size-3" />
          {relativeDays(since)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-sm font-medium">
        <DeviceIcon category={d?.category} className="size-4 shrink-0 text-ink-3" />
        <span className="truncate">
          {d?.brand} {d?.model}
        </span>
      </div>
      <div className="mt-0.5 line-clamp-1 text-xs text-ink-3">{job.reportedProblem}</div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="truncate text-ink-2">{c?.name}</span>
        <span className={cx("shrink-0 rounded px-1.5 py-0.5", t ? "bg-surface-2 text-ink-2" : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300")}>{t?.name ?? "Unassigned"}</span>
      </div>
    </Link>
  );
}
