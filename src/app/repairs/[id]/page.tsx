"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  FileText,
  Package,
  Plus,
  Printer,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  Wallet,
  XCircle,
  History,
  Info,
  FlaskConical,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import {
  addJobPhoto,
  canViewJob,
  changeStatus,
  heldDeposits,
  jobFinancials,
  jobQuotes,
  latestQuote,
  quoteTotals,
  recordDeposit,
  recordQuoteDecision,
  returnRepairPart,
  saveQuote,
  sendQuote,
  updateJob,
  useRepairPart,
} from "@/lib/services";
import { STATUS_META, STATUS_ORDER, TRANSITIONS } from "@/lib/repair-meta";
import { cx, fmtDate, fmtDateTime, money, senToInput, toSen, uid } from "@/lib/format";
import { resizeImage } from "@/lib/image";
import type { ApprovalChannel, DbState, Quotation, QuoteLine, RepairJob, RepairStatus } from "@/lib/types";
import { Badge, Button, Card, CardHeader, Denied, Field, Input, KV, Modal, Notice, QuoteBadge, Select, StatusBadge, Tabs, Textarea } from "@/components/ui";
import { DeviceIcon, PaymentChip } from "@/components/repair-bits";
import { PaymentPanel } from "@/components/payment";
import { PrintPortal } from "@/components/receipt";
import type { PaymentInput } from "@/lib/services";

type Tab = "overview" | "quote" | "parts" | "payments" | "photos" | "timeline" | "warranty";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { db, me } = useStore();
  const job = db.jobs.find((j) => j.id === id);
  const [tab, setTab] = useState<Tab>("overview");
  const [statusTo, setStatusTo] = useState<RepairStatus>();
  const [printSlip, setPrintSlip] = useState(false);

  if (!job) return <Denied what="view this job (not found)" />;
  if (!canViewJob(me, job)) return <Denied what="view this repair job — it is not assigned to you" />;

  const cust = db.customers.find((c) => c.id === job.customerId)!;
  const dev = db.devices.find((d) => d.id === job.deviceId)!;
  const tech = db.staff.find((s) => s.id === job.technicianId);
  const fin = jobFinancials(db, job);
  const quotes = jobQuotes(db, job.id);
  const lq = quotes[0];
  const actions = TRANSITIONS[job.status].filter((t) => t.roles.includes(me.role));
  const partsCount = db.repairParts.filter((p) => p.jobId === job.id && !p.reversed).length;
  const events = db.statusEvents.filter((e) => e.jobId === job.id);
  const warranties = db.warranties.filter((w) => w.jobId === job.id);
  const showMoney = me.role !== "technician";

  return (
    <div>
      <Link href="/repairs" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Repair jobs
      </Link>

      {/* Header */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2 ring-1 ring-line">
            <DeviceIcon category={dev.category} className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-bold">{job.jobNo}</h1>
              <StatusBadge status={job.status} />
              {showMoney && <PaymentChip status={fin.status} balance={fin.balance} />}
            </div>
            <div className="mt-1 text-[15px] font-medium">
              {dev.brand} {dev.model} {dev.color && <span className="text-ink-3">· {dev.color}</span>}
            </div>
            <div className="mt-0.5 text-sm text-ink-3">
              {can(me.role, "customers.view") ? (
                <Link href={`/customers/${cust.id}`} className="hover:text-ink hover:underline">
                  {cust.name}
                </Link>
              ) : (
                cust.name
              )}{" "}
              · {cust.phone} · Technician: <span className="text-ink-2">{tech?.name ?? "Unassigned"}</span> · Received {fmtDate(job.createdAt)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<Printer className="size-4" />} onClick={() => { setPrintSlip(true); setTimeout(() => { window.print(); setPrintSlip(false); }, 80); }}>
              Intake slip
            </Button>
            {job.status === "ready" && can(me.role, "payment.receive") && (
              <Link href={`/pos?mode=collect&job=${job.id}`}>
                <Button variant="primary" icon={<Wallet className="size-4" />}>
                  Collect & take payment
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Progress */}
        {!["cancelled", "unrepairable"].includes(job.status) && (
          <div className="scroll-thin overflow-x-auto border-t border-line px-4 py-3 sm:px-5">
            <ol className="flex min-w-[720px] items-center">
              {STATUS_ORDER.map((s, i) => {
                const idx = STATUS_ORDER.indexOf(job.status);
                const done = i < idx;
                const cur = i === idx;
                return (
                  <li key={s} className="flex flex-1 items-center last:flex-none">
                    <div className="flex items-center gap-2">
                      <span
                        className={cx(
                          "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                          done && "bg-ink text-surface",
                          cur && "bg-brand text-white ring-4 ring-brand/20",
                          !done && !cur && "bg-surface-2 text-ink-3 ring-1 ring-line",
                        )}
                      >
                        {done ? <Check className="size-3.5" /> : i + 1}
                      </span>
                      <span className={cx("whitespace-nowrap text-xs", cur ? "font-semibold text-ink" : "text-ink-3")}>{STATUS_META[s].label}</span>
                    </div>
                    {i < STATUS_ORDER.length - 1 && <span className={cx("mx-2 h-px flex-1", done ? "bg-ink" : "bg-line")} />}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Next actions */}
        {(actions.length > 0 || job.status === "ready") && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/60 px-4 py-3 sm:px-5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Next step</span>
            {actions.map((a) =>
              a.to === "cancelled" ? (
                <Button key={a.to} size="sm" variant="danger" icon={<XCircle className="size-4" />} onClick={() => setStatusTo(a.to)}>
                  {a.label}
                </Button>
              ) : (
                <Button key={a.to} size="sm" variant={a.to === "in_progress" && job.status === "quality_check" ? "secondary" : "dark"} icon={<ArrowRight className="size-4" />} onClick={() => setStatusTo(a.to)}>
                  {a.label}
                </Button>
              ),
            )}
            {job.status === "ready" && <span className="text-sm text-ink-3">Completion happens when the customer collects the device and the payment is recorded at the cashier.</span>}
            {job.status === "awaiting_approval" && lq?.status === "sent" && <span className="text-sm text-amber-700 dark:text-amber-300">Waiting for customer decision on {lq.quoteNo}.</span>}
          </div>
        )}
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "quote", label: "Quotation", count: quotes.length || undefined },
          { id: "parts", label: "Parts used", count: partsCount || undefined },
          ...(showMoney ? [{ id: "payments" as Tab, label: "Payments" }] : []),
          { id: "photos", label: "Photos", count: job.photos.length || undefined },
          { id: "timeline", label: "Timeline", count: events.length },
          ...(warranties.length ? [{ id: "warranty" as Tab, label: "Warranty" }] : []),
        ]}
      />
      <div className="mt-4">
        {tab === "overview" && <Overview job={job} />}
        {tab === "quote" && <QuotationTab job={job} />}
        {tab === "parts" && <PartsTab job={job} />}
        {tab === "payments" && <PaymentsTab job={job} />}
        {tab === "photos" && <PhotosTab job={job} />}
        {tab === "timeline" && <TimelineTab job={job} />}
        {tab === "warranty" && <WarrantyTab job={job} />}
      </div>

      {statusTo && <StatusDialog job={job} to={statusTo} onClose={() => setStatusTo(undefined)} />}
      {printSlip && (
        <PrintPortal>
          <IntakeSlip db={db} job={job} />
        </PrintPortal>
      )}
    </div>
  );
}

function StatusDialog({ job, to, onClose }: { job: RepairJob; to: RepairStatus; onClose: () => void }) {
  const { run, db } = useStore();
  const [note, setNote] = useState("");
  const rule = TRANSITIONS[job.status].find((t) => t.to === to)!;
  const lq = latestQuote(db, job.id);
  const needsQuote = to === "awaiting_approval" && (!lq || !["draft", "sent"].includes(lq.status));
  const held = heldDeposits(db, job.id);
  return (
    <Modal
      open
      onClose={onClose}
      title={rule.label}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={to === "cancelled" ? "danger" : "primary"}
            onClick={() => {
              const r = run((d) => changeStatus(d, job.id, to, note), `Status → ${STATUS_META[to].label}`);
              if (r.ok) onClose();
            }}
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2 text-sm">
        <StatusBadge status={job.status} /> <ArrowRight className="size-4 text-ink-3" /> <StatusBadge status={to} />
      </div>
      {needsQuote && <Notice tone="warn">Create a quotation in the Quotation tab first.</Notice>}
      {to === "cancelled" && held > 0 && <Notice tone="warn">The deposit of {money(held)} still held for this job will be recorded as returned to the customer.</Notice>}
      {to === "awaiting_approval" && lq?.status === "draft" && <Notice>Draft quotation {lq.quoteNo} will be marked as sent to the customer.</Notice>}
      <Field label={to === "cancelled" ? "Reason (required)" : "Note (optional)"} className="mt-3">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </Field>
      <p className="mt-2 text-xs text-ink-3">This change is recorded in the job timeline with your name and the time.</p>
    </Modal>
  );
}

// ───────────────────────── Overview ─────────────────────────

function Overview({ job }: { job: RepairJob }) {
  const { db, me, run } = useStore();
  const dev = db.devices.find((d) => d.id === job.deviceId)!;
  const [diag, setDiag] = useState(job.diagnosis);
  const [notes, setNotes] = useState(job.internalNotes);
  const closed = ["completed", "cancelled"].includes(job.status);
  const canDiag = can(me.role, "repair.diagnose") && !closed;
  const techs = db.staff.filter((s) => s.role === "technician" && s.active);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Problem & diagnosis" />
          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Reported problem</div>
              <p className="mt-1 text-sm">{job.reportedProblem}</p>
            </div>
            <Field label="Diagnosis">
              <Textarea value={diag} onChange={(e) => setDiag(e.target.value)} disabled={!canDiag} placeholder={canDiag ? "Technician findings…" : "Not yet diagnosed"} />
            </Field>
            <Field label="Internal notes (staff only)">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={closed} className="min-h-14" />
            </Field>
            {!closed && (diag !== job.diagnosis || notes !== job.internalNotes) && (
              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => { setDiag(job.diagnosis); setNotes(job.internalNotes); }}>
                  Discard
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => run((d) => updateJob(d, job.id, { ...(diag !== job.diagnosis ? { diagnosis: diag } : {}), internalNotes: notes }), "Saved")}
                >
                  Save changes
                </Button>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Intake record" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Accessories received</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {job.accessories.length ? job.accessories.map((a) => <Badge key={a}>{a}</Badge>) : <span className="text-sm text-ink-3">Device only</span>}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Physical condition</div>
              <p className="mt-1 text-sm">{job.condition || "—"}</p>
            </div>
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Device" />
          <div className="px-4 py-2 sm:px-5">
            <KV k="Category" v={dev.category} />
            <KV k="Brand / model" v={`${dev.brand} ${dev.model}`} />
            <KV k="Serial / IMEI" v={<span className="font-mono text-xs">{dev.serial || "—"}</span>} />
            <KV k="Colour" v={dev.color || "—"} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Assignment & estimate" />
          <div className="space-y-3 px-4 py-3 sm:px-5">
            <Field label="Technician">
              <Select
                value={job.technicianId ?? ""}
                disabled={!can(me.role, "repair.assign") || closed}
                onChange={(e) => run((d) => updateJob(d, job.id, { technicianId: e.target.value || undefined }), "Technician assigned")}
              >
                <option value="">Unassigned</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <KV k="Initial estimate" v={<span className="num">{job.estCost ? money(job.estCost) : "—"}</span>} />
            <KV k="Est. completion" v={job.estCompletion ? fmtDate(job.estCompletion) : "—"} />
            <KV k="Registered by" v={db.staff.find((s) => s.id === job.createdBy)?.name} />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────── Quotation ─────────────────────────

function QuotationTab({ job }: { job: RepairJob }) {
  const { db, me, run } = useStore();
  const quotes = jobQuotes(db, job.id);
  const [editing, setEditing] = useState<Quotation | "new" | null>(null);
  const [decision, setDecision] = useState<{ q: Quotation; simulated: boolean } | null>(null);
  const [printQ, setPrintQ] = useState<Quotation>();
  const closed = ["completed", "cancelled"].includes(job.status);
  const canCreate = can(me.role, "quote.create") && !closed;
  const draft = quotes.find((q) => q.status === "draft");

  if (editing) return <QuoteEditor job={job} quote={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />;

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex flex-wrap gap-2">
          {draft ? (
            <Button variant="primary" icon={<FileText className="size-4" />} onClick={() => setEditing(draft)}>
              Edit draft {draft.quoteNo}
            </Button>
          ) : (
            <Button variant={quotes.length ? "secondary" : "primary"} icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
              {quotes.length ? "New version (revised quotation)" : "Create quotation"}
            </Button>
          )}
        </div>
      )}
      {!quotes.length && (
        <Card>
          <div className="px-6 py-12 text-center text-sm text-ink-3">
            No quotation yet. After diagnosis, create a quotation with labour, parts and services, then send it to the customer for approval.
          </div>
        </Card>
      )}
      {quotes.map((q) => {
        const t = quoteTotals(q, db.settings);
        const decisions = db.decisions.filter((d) => d.quoteId === q.id);
        const expired = q.status === "sent" && new Date(q.validUntil).getTime() < Date.now();
        return (
          <Card key={q.id} className={cx(q.status === "expired" && "opacity-70")}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <span className="font-mono">{q.quoteNo}</span>
                  <QuoteBadge status={q.status} />
                  {expired && <Badge tone="gray">Past validity</Badge>}
                </span>
              }
              subtitle={`Version ${q.version} · created ${fmtDateTime(q.createdAt)} by ${db.staff.find((s) => s.id === q.createdBy)?.name}${q.sentAt ? ` · sent ${fmtDate(q.sentAt)} · valid until ${fmtDate(q.validUntil)}` : ""}`}
              action={
                <Button size="sm" variant="ghost" icon={<Printer className="size-4" />} onClick={() => { setPrintQ(q); setTimeout(() => { window.print(); setPrintQ(undefined); }, 80); }}>
                  Print
                </Button>
              }
            />
            <div className="p-4 sm:p-5">
              <QuoteLinesView lines={q.lines} />
              <div className="ml-auto mt-3 max-w-xs">
                <KV k="Subtotal" v={<span className="num">{money(t.subtotal)}</span>} />
                {t.discount > 0 && <KV k="Discount" v={<span className="num">-{money(t.discount)}</span>} />}
                {db.settings.taxEnabled && <KV k={db.settings.taxLabel} v={<span className="num">{money(t.tax)}</span>} />}
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                  <span>Estimated total</span>
                  <span className="num">{money(t.total)}</span>
                </div>
              </div>
              {decisions.map((d) => (
                <div
                  key={d.id}
                  className={cx(
                    "mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                    d.decision === "approved" ? "border-green-300 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10" : "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
                  )}
                >
                  {d.decision === "approved" ? <CheckCircle2 className="mt-0.5 size-4 text-green-700" /> : <XCircle className="mt-0.5 size-4 text-red-700" />}
                  <div>
                    <b>{d.decision === "approved" ? "Approved" : "Rejected"}</b> by {d.customerName} via{" "}
                    {d.channel === "simulated_demo" ? (
                      <Badge tone="amber">
                        <FlaskConical className="size-3" /> SIMULATED — demo only
                      </Badge>
                    ) : (
                      d.channel.replace("_", " ")
                    )}{" "}
                    · recorded by {db.staff.find((s) => s.id === d.recordedBy)?.name} on {fmtDateTime(d.at)}
                  </div>
                </div>
              ))}
              {q.status === "draft" && canCreate && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button icon={<FileText className="size-4" />} onClick={() => setEditing(q)}>
                    Edit
                  </Button>
                  <Button variant="primary" icon={<Send className="size-4" />} onClick={() => run((d) => sendQuote(d, q.id), `Quotation ${q.quoteNo} marked as sent`)}>
                    Mark as sent to customer
                  </Button>
                  <span className="self-center text-xs text-ink-3">WhatsApp / SMS sending is a demonstration placeholder — share the printed quote for now.</span>
                </div>
              )}
              {q.status === "sent" && can(me.role, "quote.decide") && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => setDecision({ q, simulated: false })}>
                    Record customer decision
                  </Button>
                  <Button variant="secondary" className="border-dashed border-amber-400" icon={<FlaskConical className="size-4" />} onClick={() => setDecision({ q, simulated: true })}>
                    Simulate customer approval (demo)
                  </Button>
                </div>
              )}
              {q.status === "sent" && !can(me.role, "quote.decide") && <p className="mt-3 text-xs text-ink-3">The counter staff will record the customer&apos;s decision.</p>}
            </div>
          </Card>
        );
      })}
      {decision && <DecisionDialog quote={decision.q} simulated={decision.simulated} onClose={() => setDecision(null)} />}
      {printQ && (
        <PrintPortal>
          <QuotePrint db={db} job={job} q={printQ} />
        </PrintPortal>
      )}
    </div>
  );
}

function QuoteLinesView({ lines }: { lines: QuoteLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="py-1.5 font-semibold">Type</th>
            <th className="py-1.5 font-semibold">Description</th>
            <th className="py-1.5 text-right font-semibold">Qty</th>
            <th className="py-1.5 text-right font-semibold">Unit</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-line">
              <td className="py-2">
                <Badge tone={l.type === "labour" ? "violet" : l.type === "part" ? "blue" : "slate"}>{l.type}</Badge>
              </td>
              <td className="py-2">{l.description}</td>
              <td className="num py-2 text-right">{l.qty}</td>
              <td className="num py-2 text-right">{money(l.unitPrice)}</td>
              <td className="num py-2 text-right font-medium">{money(l.unitPrice * l.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type EditLine = { id: string; type: QuoteLine["type"]; itemId?: string; description: string; qty: string; unitPrice: string };

function QuoteEditor({ job, quote, onDone }: { job: RepairJob; quote?: Quotation; onDone: () => void }) {
  const { db, run } = useStore();
  const prev = latestQuote(db, job.id);
  const seedLines = quote?.lines ?? prev?.lines ?? [];
  const [lines, setLines] = useState<EditLine[]>(
    seedLines.length
      ? seedLines.map((l) => ({ ...l, id: uid("ql_"), qty: String(l.qty), unitPrice: senToInput(l.unitPrice) }))
      : [{ id: uid("ql_"), type: "labour", description: "Repair labour", qty: "1", unitPrice: "" }],
  );
  const [discount, setDiscount] = useState(quote ? senToInput(quote.discount) : "");
  const parts = db.items.filter((i) => i.type === "part" && i.active);
  const parsed: QuoteLine[] = lines.map((l) => ({ id: l.id, type: l.type, itemId: l.itemId, description: l.description, qty: parseInt(l.qty, 10) || 0, unitPrice: toSen(l.unitPrice) }));
  const t = quoteTotals({ lines: parsed, discount: toSen(discount) }, db.settings);
  const upd = (id: string, p: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  return (
    <Card>
      <CardHeader title={quote ? `Edit draft ${quote.quoteNo}` : prev ? `New quotation version ${prev.version + 1}` : "New quotation"} subtitle={prev && !quote ? "Previous draft/sent versions will be marked expired." : undefined} />
      <div className="space-y-3 p-4 sm:p-5">
        {lines.map((l) => (
          <div key={l.id} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-line p-2.5">
            <Field label="Type" className="col-span-4 sm:col-span-2">
              <Select value={l.type} onChange={(e) => upd(l.id, { type: e.target.value as QuoteLine["type"], itemId: undefined })}>
                <option value="labour">Labour</option>
                <option value="part">Part</option>
                <option value="service">Service</option>
              </Select>
            </Field>
            {l.type === "part" ? (
              <Field label="Spare part" className="col-span-8 sm:col-span-5">
                <Select
                  value={l.itemId ?? ""}
                  onChange={(e) => {
                    const it = parts.find((p) => p.id === e.target.value);
                    upd(l.id, { itemId: it?.id, description: it?.name ?? "", unitPrice: it ? senToInput(it.price) : l.unitPrice });
                  }}
                >
                  <option value="">Select part…</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {money(p.price)} ({p.stock} in stock)
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Description" className="col-span-8 sm:col-span-5">
                <Input value={l.description} onChange={(e) => upd(l.id, { description: e.target.value })} />
              </Field>
            )}
            <Field label="Qty" className="col-span-3 sm:col-span-1">
              <Input inputMode="numeric" value={l.qty} onChange={(e) => upd(l.id, { qty: e.target.value.replace(/\D/g, "") })} className="num text-right" />
            </Field>
            <Field label="Unit price (RM)" className="col-span-5 sm:col-span-2">
              <Input inputMode="decimal" value={l.unitPrice} onChange={(e) => upd(l.id, { unitPrice: e.target.value })} className="num text-right" />
            </Field>
            <div className="col-span-4 flex items-center justify-end gap-2 pb-2 sm:col-span-2">
              <span className="num text-sm font-medium">{money(toSen(l.unitPrice) * (parseInt(l.qty, 10) || 0))}</span>
              <button className="text-ink-3 hover:text-red-600" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} aria-label="Remove line">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {(["labour", "part", "service"] as const).map((type) => (
            <Button key={type} size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setLines((ls) => [...ls, { id: uid("ql_"), type, description: type === "labour" ? "Labour" : "", qty: "1", unitPrice: "" }])}>
              Add {type}
            </Button>
          ))}
        </div>
        <div className="ml-auto max-w-xs space-y-1">
          <KV k="Subtotal" v={<span className="num">{money(t.subtotal)}</span>} />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-3">Discount (RM)</span>
            <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="num h-8 w-28 text-right" placeholder="0.00" />
          </div>
          {db.settings.taxEnabled && <KV k={db.settings.taxLabel} v={<span className="num">{money(t.tax)}</span>} />}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <span>Estimated total</span>
            <span className="num">{money(t.total)}</span>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
        <Button onClick={onDone}>Cancel</Button>
        <Button
          variant="primary"
          onClick={() => {
            const r = run((d) => saveQuote(d, job.id, { quoteId: quote?.id, lines: parsed, discount: toSen(discount) }), (q) => `Draft ${q.quoteNo} saved`);
            if (r.ok) onDone();
          }}
        >
          Save draft
        </Button>
      </div>
    </Card>
  );
}

function DecisionDialog({ quote, simulated, onClose }: { quote: Quotation; simulated: boolean; onClose: () => void }) {
  const { db, run } = useStore();
  const job = db.jobs.find((j) => j.id === quote.jobId)!;
  const cust = db.customers.find((c) => c.id === job.customerId)!;
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [channel, setChannel] = useState<ApprovalChannel>(simulated ? "simulated_demo" : "in_person");
  const [name, setName] = useState(cust.name);
  const total = quoteTotals(quote, db.settings).total;
  return (
    <Modal
      open
      onClose={onClose}
      title={simulated ? "Simulate customer approval (demo)" : "Record customer decision"}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={decision === "rejected" ? "danger" : "primary"}
            onClick={() => {
              const r = run((d) => recordQuoteDecision(d, quote.id, { decision, channel, customerName: name }), `Quotation ${decision}`);
              if (r.ok) onClose();
            }}
          >
            Record {decision}
          </Button>
        </>
      }
    >
      {simulated && <Notice tone="demo">This creates an approval record clearly labelled SIMULATED for the demonstration. Real approvals must record the actual channel.</Notice>}
      <div className="mt-3 space-y-3">
        <KV k="Quotation" v={`${quote.quoteNo} · ${money(total)}`} />
        <div className="inline-flex rounded-lg border border-line p-0.5">
          {(["approved", "rejected"] as const).map((d) => (
            <button key={d} onClick={() => setDecision(d)} className={cx("rounded-md px-4 py-1.5 text-sm capitalize", decision === d ? "bg-ink text-surface" : "text-ink-2")}>
              {d}
            </button>
          ))}
        </div>
        {!simulated && (
          <Field label="How did the customer respond?">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as ApprovalChannel)}>
              <option value="in_person">In person at counter</option>
              <option value="phone">Phone call</option>
              <option value="whatsapp">WhatsApp</option>
            </Select>
          </Field>
        )}
        <Field label="Decision given by">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ───────────────────────── Parts ─────────────────────────

function PartsTab({ job }: { job: RepairJob }) {
  const { db, me, run } = useStore();
  const used = db.repairParts.filter((p) => p.jobId === job.id);
  const parts = db.items.filter((i) => i.type === "part" && i.active);
  const aq = jobFinancials(db, job).approved;
  const quotedParts = aq?.lines.filter((l) => l.type === "part") ?? [];
  const [itemId, setItemId] = useState(quotedParts[0]?.itemId ?? "");
  const [qty, setQty] = useState("1");
  const canRecord = can(me.role, "repair.parts") && ["in_progress", "quality_check", "waiting_parts"].includes(job.status);
  const showCost = can(me.role, "inventory.cost.view");

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader title="Spare parts used" subtitle="Each record deducts stock through a controlled inventory movement." icon={<Package className="size-4" />} />
        <ul className="divide-y divide-line">
          {used.map((p) => {
            const it = db.items.find((i) => i.id === p.itemId);
            return (
              <li key={p.id} className={cx("flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5", p.reversed && "opacity-50")}>
                <div className="min-w-0 flex-1">
                  <div className={cx("font-medium", p.reversed && "line-through")}>
                    {it?.name} × {p.qty}
                  </div>
                  <div className="text-xs text-ink-3">
                    {it?.sku} · by {db.staff.find((s) => s.id === p.actorId)?.name} · {fmtDateTime(p.at)}
                    {showCost && ` · cost ${money(p.unitCost * p.qty)}`}
                  </div>
                </div>
                {p.reversed ? (
                  <Badge tone="gray">Returned to stock</Badge>
                ) : (
                  canRecord && (
                    <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => run((d) => returnRepairPart(d, p.id), "Part returned to stock")}>
                      Return to stock
                    </Button>
                  )
                )}
              </li>
            );
          })}
          {!used.length && <li className="px-5 py-10 text-center text-sm text-ink-3">No parts recorded yet.</li>}
        </ul>
      </Card>
      <div className="space-y-4">
        {canRecord ? (
          <Card>
            <CardHeader title="Record part used" />
            <div className="space-y-3 p-4 sm:p-5">
              <Field label="Spare part">
                <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  <option value="">Select…</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.stock <= 0 && !p.allowNegative}>
                      {p.name} ({p.stock} in stock)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity">
                <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className="num w-24" />
              </Field>
              <Button variant="primary" disabled={!itemId || !qty} onClick={() => run((d) => useRepairPart(d, job.id, itemId, parseInt(qty, 10)), "Part recorded — stock deducted")}>
                Record & deduct stock
              </Button>
            </div>
          </Card>
        ) : (
          <Notice>Parts can be recorded while the job is approved and in repair{!can(me.role, "repair.parts") ? " (technician or owner)" : ""}.</Notice>
        )}
        {quotedParts.length > 0 && (
          <Card>
            <CardHeader title="Parts in approved quotation" />
            <ul className="divide-y divide-line text-sm">
              {quotedParts.map((l) => {
                const usedQty = used.filter((u) => !u.reversed && u.itemId === l.itemId).reduce((s, u) => s + u.qty, 0);
                return (
                  <li key={l.id} className="flex items-center justify-between px-4 py-2.5 sm:px-5">
                    <span>
                      {l.description} × {l.qty}
                    </span>
                    {usedQty >= l.qty ? <Badge tone="green">Recorded</Badge> : <Badge tone="amber">Not recorded</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Payments ─────────────────────────

function PaymentsTab({ job }: { job: RepairJob }) {
  const { db, me, run } = useStore();
  const fin = jobFinancials(db, job);
  const pays = db.payments.filter((p) => p.repairJobId === job.id || (fin.sale && p.saleId === fin.sale.id));
  const [open, setOpen] = useState(false);
  const [dep, setDep] = useState<PaymentInput[]>([]);
  const [valid, setValid] = useState(false);
  const [amt, setAmt] = useState("");
  const method = (id: string) => db.settings.paymentMethods.find((m) => m.id === id)?.name ?? id;
  const closed = ["completed", "cancelled"].includes(job.status);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
      <Card>
        <CardHeader title="Summary" />
        <div className="px-4 py-3 sm:px-5">
          <KV k="Approved quotation" v={fin.approved ? `${fin.approved.quoteNo} · ${money(fin.quoteTotal)}` : "None yet"} />
          <KV k="Deposits received" v={<span className="num">{money(fin.deposits)}</span>} />
          {fin.sale && <KV k="Invoice" v={<Link className="underline" href={`/transactions?r=${fin.sale.id}`}>{fin.sale.receiptNo} · {money(fin.sale.total)}</Link>} />}
          <KV k={fin.sale ? "Outstanding" : "Expected balance"} v={<span className="num">{money(fin.balance)}</span>} />
          <KV k="Payment status" v={<PaymentChip status={fin.status} balance={fin.balance} />} />
          {can(me.role, "inventory.cost.view") && <KV k="Parts cost (internal)" v={<span className="num">{money(fin.partsCost)}</span>} />}
          <p className="mt-2 text-xs text-ink-3">
            Deposits are held against the job and applied to the final invoice at collection — they are not counted as revenue twice. Completing a repair does not mark it as paid.
          </p>
          {!closed && can(me.role, "payment.receive") && (
            <Button className="mt-3" icon={<Wallet className="size-4" />} onClick={() => setOpen(true)}>
              Record deposit
            </Button>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Payment records" />
        <ul className="divide-y divide-line">
          {pays.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
              <Badge tone={p.kind === "deposit" ? "blue" : p.kind === "refund" ? "red" : "green"}>{p.kind}</Badge>
              <span className="flex-1">
                {method(p.methodId)}
                {p.reference && <span className="text-ink-3"> · {p.reference}</span>}
                <span className="block text-xs text-ink-3">
                  {fmtDateTime(p.at)} · {db.staff.find((s) => s.id === p.receivedBy)?.name}
                  {p.kind === "deposit" && p.saleId && " · applied to invoice"}
                </span>
              </span>
              <span className="num font-medium">
                {p.kind === "refund" ? "-" : ""}
                {money(p.amount)}
              </span>
            </li>
          ))}
          {!pays.length && <li className="px-5 py-10 text-center text-sm text-ink-3">No payments recorded.</li>}
        </ul>
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record deposit"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!valid || toSen(amt) <= 0}
              onClick={() => {
                const r = run((d) => {
                  for (const p of dep) recordDeposit(d, job.id, p);
                }, "Deposit recorded");
                if (r.ok) {
                  setOpen(false);
                  setAmt("");
                }
              }}
            >
              Record deposit
            </Button>
          </>
        }
      >
        <Field label="Deposit amount (RM)">
          <Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} className="num text-right text-lg" autoFocus />
        </Field>
        <div className="mt-3">{toSen(amt) > 0 && <PaymentPanel methods={db.settings.paymentMethods} due={toSen(amt)} onChange={(p, v) => { setDep(p); setValid(v); }} />}</div>
      </Modal>
    </div>
  );
}

// ───────────────────────── Photos ─────────────────────────

function PhotosTab({ job }: { job: RepairJob }) {
  const { run, toast } = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<string>();
  return (
    <Card>
      <CardHeader
        title="Device condition photos"
        subtitle="Stored privately; in production served via short-lived signed URLs."
        action={
          job.photos.length < 6 && (
            <Button size="sm" icon={<Camera className="size-4" />} onClick={() => ref.current?.click()}>
              Add photo
            </Button>
          )
        }
      />
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const url = await resizeImage(f);
            run((d) => addJobPhoto(d, job.id, url, "Added during repair"), "Photo added");
          } catch (err) {
            toast((err as Error).message, "error");
          }
        }}
      />
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
        {job.photos.map((p) => (
          <button key={p.id} onClick={() => setView(p.dataUrl)} className="overflow-hidden rounded-lg ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUrl} alt={p.caption} className="aspect-square w-full object-cover" />
            <div className="px-2 py-1 text-left text-[11px] text-ink-3">
              {p.caption} · {fmtDate(p.at)}
            </div>
          </button>
        ))}
        {!job.photos.length && <div className="col-span-full py-8 text-center text-sm text-ink-3">No photos recorded.</div>}
      </div>
      <Modal open={!!view} onClose={() => setView(undefined)} title="Photo" size="lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {view && <img src={view} alt="Device condition" className="mx-auto max-h-[70vh] rounded-lg" />}
      </Modal>
    </Card>
  );
}

// ───────────────────────── Timeline ─────────────────────────

function TimelineTab({ job }: { job: RepairJob }) {
  const { db } = useStore();
  const events = db.statusEvents.filter((e) => e.jobId === job.id);
  return (
    <Card>
      <CardHeader title="Job history" subtitle="Every status change and key action, with who and when (Asia/Kuala_Lumpur)." icon={<History className="size-4" />} />
      <ol className="relative px-5 py-4">
        {events.map((e, i) => {
          const isChange = e.from !== e.to;
          return (
            <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
              {i < events.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-line" />}
              <span className={cx("relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ring-4 ring-surface", isChange ? "bg-ink text-surface" : "bg-surface-2 text-ink-3 ring-line")}>
                {isChange ? <ArrowRight className="size-3" /> : <Info className="size-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {isChange ? (
                    <>
                      {e.from && <StatusBadge status={e.from} />}
                      {e.from && <ArrowRight className="size-3.5 text-ink-3" />}
                      <StatusBadge status={e.to} />
                    </>
                  ) : (
                    <span className="font-medium">{e.note}</span>
                  )}
                </div>
                {isChange && e.note && <p className="mt-1 text-sm text-ink-2">{e.note}</p>}
                <p className="mt-0.5 text-xs text-ink-3">
                  {db.staff.find((s) => s.id === e.actorId)?.name} · {fmtDateTime(e.at)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function WarrantyTab({ job }: { job: RepairJob }) {
  const { db } = useStore();
  const ws = db.warranties.filter((w) => w.jobId === job.id);
  return (
    <div className="space-y-3">
      {ws.map((w) => {
        const rule = db.warrantyRules.find((r) => r.id === w.ruleId);
        const active = new Date(w.endsOn).getTime() > Date.now() && !w.voided;
        return (
          <Card key={w.id} className="p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-ink-3" />
              <span className="font-mono font-semibold">{w.warrantyNo}</span>
              <Badge tone={active ? "green" : "gray"}>{active ? "Active" : "Expired"}</Badge>
            </div>
            <div className="mt-2 text-sm">
              <KV k="Rule" v={rule?.name} />
              <KV k="Coverage" v={w.coverage} />
              <KV k="Period" v={`${fmtDate(w.startsOn)} → ${fmtDate(w.endsOn)}`} />
            </div>
            <Link href="/warranty" className="mt-2 inline-block text-sm underline">
              Manage claims
            </Link>
          </Card>
        );
      })}
    </div>
  );
}

// ───────────────────────── Printables (80mm) ─────────────────────────

function IntakeSlip({ db, job }: { db: DbState; job: RepairJob }) {
  const c = db.customers.find((x) => x.id === job.customerId)!;
  const d = db.devices.find((x) => x.id === job.deviceId)!;
  return (
    <div className="receipt">
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>{db.settings.businessName.toUpperCase()}</div>
      <div style={{ textAlign: "center" }}>{db.settings.phone}</div>
      <hr />
      <div style={{ textAlign: "center", fontWeight: 700 }}>REPAIR INTAKE SLIP</div>
      <div style={{ textAlign: "center", fontSize: 18, fontWeight: 700, margin: "4px 0" }}>{job.jobNo}</div>
      <div style={{ textAlign: "center", fontSize: 10 }}>*** DEMONSTRATION ***</div>
      <hr />
      <div>Date: {fmtDateTime(job.createdAt)}</div>
      <div>Customer: {c.name}</div>
      <div>Phone: {c.phone}</div>
      <hr />
      <div>
        Device: {d.brand} {d.model} ({d.category})
      </div>
      {d.serial && <div>Serial/IMEI: {d.serial}</div>}
      {d.color && <div>Colour: {d.color}</div>}
      <div>Accessories: {job.accessories.join(", ") || "Device only"}</div>
      <div>Condition: {job.condition || "—"}</div>
      <hr />
      <div>Problem: {job.reportedProblem}</div>
      {job.estCost > 0 && <div>Initial estimate: {money(job.estCost)} (subject to diagnosis)</div>}
      {job.estCompletion && <div>Est. ready: {fmtDate(job.estCompletion)}</div>}
      <hr />
      <div style={{ fontSize: 10 }}>[Intake terms & conditions to be provided by Fixerlab]</div>
      <div style={{ marginTop: 18 }}>Customer signature: ____________</div>
      <div style={{ marginTop: 10 }}>Received by: {db.staff.find((s) => s.id === job.createdBy)?.name}</div>
    </div>
  );
}

function QuotePrint({ db, job, q }: { db: DbState; job: RepairJob; q: Quotation }) {
  const c = db.customers.find((x) => x.id === job.customerId)!;
  const d = db.devices.find((x) => x.id === job.deviceId)!;
  const t = quoteTotals(q, db.settings);
  return (
    <div className="receipt">
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>{db.settings.businessName.toUpperCase()}</div>
      <div style={{ textAlign: "center" }}>{db.settings.phone}</div>
      <hr />
      <div style={{ textAlign: "center", fontWeight: 700 }}>REPAIR QUOTATION</div>
      <div style={{ textAlign: "center", fontSize: 10 }}>*** DEMONSTRATION ***</div>
      <hr />
      <div>Quote: {q.quoteNo}</div>
      <div>Job: {job.jobNo}</div>
      <div>Date: {fmtDate(q.createdAt)}</div>
      <div>Valid until: {fmtDate(q.validUntil)}</div>
      <div>Customer: {c.name}</div>
      <div>
        Device: {d.brand} {d.model}
      </div>
      <hr />
      {q.lines.map((l) => (
        <div key={l.id} style={{ marginBottom: 3 }}>
          <div>
            {l.description} ({l.type})
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {"  "}
              {l.qty} x {money(l.unitPrice)}
            </span>
            <span>{money(l.qty * l.unitPrice)}</span>
          </div>
        </div>
      ))}
      <hr />
      {t.discount > 0 && <div>Discount: -{money(t.discount)}</div>}
      {db.settings.taxEnabled && (
        <div>
          {db.settings.taxLabel}: {money(t.tax)}
        </div>
      )}
      <div style={{ fontWeight: 700 }}>ESTIMATED TOTAL: {money(t.total)}</div>
      <hr />
      <div style={{ marginTop: 14 }}>Customer approval: ____________</div>
    </div>
  );
}
