"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ShieldCheck, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { createClaim, resolveClaim } from "@/lib/services";
import { cx, fmtDate, fmtDateTime } from "@/lib/format";
import type { Warranty } from "@/lib/types";
import { Badge, Button, Card, CardHeader, Denied, Field, Input, Modal, Notice, PageHeader, Table, Textarea, td, th } from "@/components/ui";

export default function WarrantyPage() {
  const { db, me, run } = useStore();
  const [q, setQ] = useState("");
  const [claimFor, setClaimFor] = useState<Warranty>();
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.warranties.filter((w) => {
      if (!s) return true;
      const c = db.customers.find((x) => x.id === w.customerId);
      const j = db.jobs.find((x) => x.id === w.jobId);
      return `${w.warrantyNo} ${c?.name} ${c?.phone} ${j?.jobNo} ${w.coverage}`.toLowerCase().includes(s);
    });
  }, [db, q]);
  if (!can(me.role, "warranty.manage")) return <Denied what="manage warranty records" />;

  return (
    <div className="space-y-5">
      <PageHeader title="Warranty" subtitle="Warranty records are created at repair collection, based on rules configured in Settings." />
      <Notice tone="demo">Warranty rules shown are SAMPLE rules for demonstration. Fixerlab will define the official durations and terms.</Notice>
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Warranty no., customer, phone, job no." className="pl-9" />
      </div>
      <Card>
        <CardHeader title="Warranty records" icon={<ShieldCheck className="size-4" />} />
        <Table>
          <thead>
            <tr>
              <th className={th}>Warranty</th>
              <th className={th}>Customer</th>
              <th className={th}>Original repair</th>
              <th className={th}>Coverage</th>
              <th className={th}>Rule</th>
              <th className={th}>Valid</th>
              <th className={th}>Status</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const c = db.customers.find((x) => x.id === w.customerId);
              const j = db.jobs.find((x) => x.id === w.jobId);
              const rule = db.warrantyRules.find((r) => r.id === w.ruleId);
              const active = new Date(w.endsOn).getTime() > Date.now() && !w.voided;
              const days = Math.ceil((new Date(w.endsOn).getTime() - Date.now()) / 86_400_000);
              return (
                <tr key={w.id}>
                  <td className={cx(td, "font-mono text-[13px] font-semibold")}>{w.warrantyNo}</td>
                  <td className={td}>{c?.name}</td>
                  <td className={td}>
                    {j && (
                      <Link href={`/repairs/${j.id}`} className="font-mono text-xs underline">
                        {j.jobNo}
                      </Link>
                    )}
                  </td>
                  <td className={cx(td, "max-w-[220px] truncate")}>{w.coverage}</td>
                  <td className={cx(td, "text-xs text-ink-2")}>{rule?.name}</td>
                  <td className={cx(td, "whitespace-nowrap text-ink-2")}>
                    {fmtDate(w.startsOn)} → {fmtDate(w.endsOn)}
                  </td>
                  <td className={td}>{active ? <Badge tone="green">Active · {days}d left</Badge> : <Badge tone="gray">Expired</Badge>}</td>
                  <td className={td}>
                    {active && (
                      <Button size="sm" onClick={() => setClaimFor(w)}>
                        New claim
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-ink-3">
                  No warranty records.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Warranty claims" icon={<ShieldAlert className="size-4" />} />
        <ul className="divide-y divide-line">
          {db.claims.map((cl) => {
            const w = db.warranties.find((x) => x.id === cl.warrantyId);
            const c = db.customers.find((x) => x.id === w?.customerId);
            return (
              <li key={cl.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="font-mono text-xs font-semibold">{w?.warrantyNo}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{c?.name}</span> — {cl.issue}
                  <span className="block text-xs text-ink-3">
                    Logged by {db.staff.find((s) => s.id === cl.actorId)?.name} · {fmtDateTime(cl.at)}
                  </span>
                </span>
                <Badge tone={cl.outcome === "accepted" ? "green" : cl.outcome === "rejected" ? "red" : "amber"}>{cl.outcome}</Badge>
                {cl.outcome === "pending" && can(me.role, "repair.cancel") && (
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => run((d) => resolveClaim(d, cl.id, "accepted"), "Claim accepted")}>
                      Accept
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => run((d) => resolveClaim(d, cl.id, "rejected"), "Claim rejected")}>
                      Reject
                    </Button>
                  </span>
                )}
                {cl.outcome === "accepted" && c && (
                  <Link href={`/repairs/new?prefill=${encodeURIComponent(JSON.stringify({ phone: c.phone, problem: `Warranty claim (${w?.warrantyNo}): ${cl.issue}` }))}`}>
                    <Button size="sm" variant="ghost">
                      Open warranty repair job
                    </Button>
                  </Link>
                )}
              </li>
            );
          })}
          {!db.claims.length && <li className="px-5 py-8 text-center text-sm text-ink-3">No claims recorded.</li>}
        </ul>
      </Card>
      {claimFor && <ClaimDialog w={claimFor} onClose={() => setClaimFor(undefined)} />}
    </div>
  );
}

function ClaimDialog({ w, onClose }: { w: Warranty; onClose: () => void }) {
  const { run } = useStore();
  const [issue, setIssue] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={`New claim — ${w.warrantyNo}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!issue.trim()} onClick={() => run((d) => createClaim(d, w.id, issue), "Claim logged").ok && onClose()}>
            Log claim
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-2">Coverage: {w.coverage}</p>
      <Field label="Issue reported">
        <Textarea value={issue} onChange={(e) => setIssue(e.target.value)} autoFocus />
      </Field>
      <p className="mt-2 text-xs text-ink-3">The owner decides whether the claim is accepted under Fixerlab&apos;s warranty terms.</p>
    </Modal>
  );
}
