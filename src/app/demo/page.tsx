"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, FastForward, Play, RotateCcw, ShoppingCart, Smartphone, Gamepad2, UserRound, ExternalLink } from "lucide-react";
import { useStore } from "@/lib/store";
import { autoRunRepair, autoRunRetail, findScenarioJob, SCENARIO_B, SCENARIO_C, type RepairScenario } from "@/lib/demo";
import { jobQuotes } from "@/lib/services";
import { STATUS_ORDER } from "@/lib/repair-meta";
import { cx, money } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import { Button, Card, Notice, PageHeader, StatusBadge } from "@/components/ui";

const START_KEY = "fixerlab-demo-start";

function useStarts() {
  const [starts, setStarts] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      setStarts(JSON.parse(localStorage.getItem(START_KEY) || "{}"));
    } catch {}
  }, []);
  const start = (id: string) => {
    const next = { ...starts, [id]: new Date(Date.now() - 1000).toISOString() };
    setStarts(next);
    try {
      localStorage.setItem(START_KEY, JSON.stringify(next));
    } catch {}
    return next[id];
  };
  return { starts, start };
}

interface Step {
  label: string;
  who: string; // staff id to act as
  done: boolean;
  href?: string;
  hint?: string;
}

function StepList({ steps }: { steps: Step[] }) {
  const { db, me, run } = useStore();
  const firstOpen = steps.findIndex((s) => !s.done);
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => {
        const staff = db.staff.find((x) => x.id === s.who)!;
        const current = i === firstOpen;
        return (
          <li key={i} className={cx("flex items-start gap-3 rounded-lg px-3 py-2", current && "bg-brand-soft ring-1 ring-brand/40")}>
            {s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" /> : <Circle className={cx("mt-0.5 size-5 shrink-0", current ? "text-brand" : "text-ink-3")} />}
            <div className="min-w-0 flex-1">
              <div className={cx("text-sm", s.done ? "text-ink-3" : "font-medium")}>
                {i + 1}. {s.label}
              </div>
              {current && s.hint && <div className="mt-0.5 text-xs text-ink-2">{s.hint}</div>}
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <span className="inline-flex items-center gap-1">
                  <UserRound className="size-3" /> {staff.name} · {ROLE_LABEL[staff.role]}
                </span>
                {current && me.id !== s.who && (
                  <button className="underline underline-offset-2 hover:text-ink" onClick={() => run((d) => { d.currentUserId = s.who; }, `Now acting as ${staff.name}`)}>
                    Switch to {staff.name}
                  </button>
                )}
                {current && s.href && (
                  <Link href={s.href} className="inline-flex items-center gap-0.5 font-medium text-brand hover:underline">
                    Go <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function DemoPage() {
  const { db, run, reset } = useStore();
  const { starts, start } = useStarts();

  // Scenario A — retail
  const sinceA = starts.A;
  const chargerSale = sinceA ? db.sales.find((s) => s.kind === "retail" && s.at >= sinceA && s.lines.some((l) => l.itemId === "it_R-CHG-20W")) : undefined;
  const chargerMove = chargerSale ? db.movements.find((m) => m.refNo === chargerSale.receiptNo && m.itemId === "it_R-CHG-20W") : undefined;
  const charger = db.items.find((i) => i.id === "it_R-CHG-20W")!;
  const stepsA: Step[] = [
    { label: "Open POS and select “USB-C 20W Fast Charger” (or scan R-CHG-20W)", who: "st_cashier", done: !!chargerSale, href: "/pos", hint: "Tap the product card or type R-CHG-20W and press Enter." },
    { label: "Charge → record payment (e.g. Cash RM50, change shown)", who: "st_cashier", done: !!chargerSale, href: "/pos" },
    { label: "Complete transaction — unique receipt number issued", who: "st_cashier", done: !!chargerSale },
    { label: "Print 80mm receipt", who: "st_cashier", done: !!chargerSale, hint: "Use “Print (80mm)” on the receipt preview." },
    { label: `Inventory updated (charger stock now ${charger.stock})`, who: "st_owner", done: !!chargerMove, href: "/inventory?item=it_R-CHG-20W" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Demonstration scenarios"
        subtitle="Walk through each workflow live, or fast-forward to show the end result. All customers and transactions are fictional."
        actions={
          <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => { reset(); try { localStorage.removeItem(START_KEY); } catch {} location.reload(); }}>
            Reset all demo data
          </Button>
        }
      />
      <Notice tone="demo">
        Tip for presenters: switch roles from the top bar (Owner · Cashier · Technician) to show that each person only sees and can do what their role allows. Owner PIN for overrides: <b>1234</b>.
      </Notice>

      <div className="grid gap-5 xl:grid-cols-3">
        <ScenarioCard
          letter="A"
          icon={<ShoppingCart className="size-5" />}
          title="Retail sale — customer buys a charger"
          started={!!sinceA}
          onStart={() => start("A")}
          onFast={() => {
            const since = sinceA ?? start("A");
            void since;
            run((d) => autoRunRetail(d), (s) => `Sale ${s.receiptNo} completed (fast-forward)`);
          }}
          done={!!chargerMove}
          result={chargerSale && <Link href={`/transactions?r=${chargerSale.id}`} className="underline">View receipt {chargerSale.receiptNo} · {money(chargerSale.total)}</Link>}
        >
          <StepList steps={stepsA} />
        </ScenarioCard>
        <RepairScenarioCard sc={SCENARIO_B} letter="B" icon={<Smartphone className="size-5" />} since={starts.B} onStart={() => start("B")} />
        <RepairScenarioCard sc={SCENARIO_C} letter="C" icon={<Gamepad2 className="size-5" />} since={starts.C} onStart={() => start("C")} />
      </div>
    </div>
  );
}

function ScenarioCard({
  letter,
  icon,
  title,
  started,
  onStart,
  onFast,
  done,
  result,
  children,
}: {
  letter: string;
  icon: React.ReactNode;
  title: string;
  started: boolean;
  onStart: () => void;
  onFast: () => void;
  done: boolean;
  result?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 border-b border-line p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink font-display text-lg font-bold text-surface">{letter}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-ink-3">
            {icon} <span className="text-xs font-semibold uppercase tracking-wide">Scenario {letter}</span>
            {done && <span className="rounded bg-green-100 px-1.5 text-[11px] font-semibold text-green-800 dark:bg-green-500/15 dark:text-green-300">Complete</span>}
          </div>
          <h2 className="mt-0.5 font-semibold leading-snug">{title}</h2>
        </div>
      </div>
      <div className="flex-1 p-3">{started ? children : <p className="px-2 py-6 text-center text-sm text-ink-3">Press “Start” to track progress from now.</p>}</div>
      {result && <div className="border-t border-line px-4 py-2.5 text-sm">{result}</div>}
      <div className="flex gap-2 border-t border-line p-3">
        <Button size="sm" variant={started ? "secondary" : "primary"} icon={<Play className="size-4" />} onClick={onStart}>
          {started ? "Restart tracking" : "Start"}
        </Button>
        <Button size="sm" variant="ghost" icon={<FastForward className="size-4" />} onClick={onFast} disabled={done}>
          Fast-forward
        </Button>
      </div>
    </Card>
  );
}

function RepairScenarioCard({ sc, letter, icon, since, onStart }: { sc: RepairScenario; letter: string; icon: React.ReactNode; since?: string; onStart: () => string }) {
  const { db, run } = useStore();
  const job = since ? findScenarioJob(db, sc, since) : undefined;
  const st = job?.status;
  const idx = st ? STATUS_ORDER.indexOf(st) : -1;
  const reached = (s: (typeof STATUS_ORDER)[number]) => idx >= STATUS_ORDER.indexOf(s);
  const quotes = job ? jobQuotes(db, job.id) : [];
  const approved = quotes.some((q) => q.status === "approved");
  const partsDone = job ? sc.parts.every((p) => db.repairParts.some((r) => r.jobId === job.id && !r.reversed && r.itemId === `it_${p.sku}`)) : false;
  const warranty = job ? db.warranties.find((w) => w.jobId === job.id) : undefined;
  const sale = job?.saleId ? db.sales.find((s) => s.id === job.saleId) : undefined;
  const jobHref = job ? `/repairs/${job.id}` : undefined;
  const prefill = encodeURIComponent(
    JSON.stringify({ name: sc.customer.name, phone: sc.customer.phone, ...sc.device, problem: sc.problem, condition: sc.condition, accessories: sc.accessories, est: String(sc.estCost / 100) }),
  );
  const tech = sc.techId;

  const steps: Step[] =
    sc.id === "B"
      ? [
          { label: `Register ${sc.device.brand} ${sc.device.model} for ${sc.customer.name}`, who: "st_cashier", done: !!job, href: `/repairs/new?prefill=${prefill}`, hint: "Form is pre-filled. Assign technician Haziq, optionally take a RM50 deposit." },
          { label: "Technician starts diagnosis", who: tech, done: reached("diagnosing"), href: jobHref, hint: "If unassigned, assign Haziq first (as Cashier/Owner) in the Overview tab." },
          { label: "Write diagnosis & create quotation (screen + labour)", who: tech, done: quotes.length > 0, href: jobHref, hint: "Quotation tab → Create quotation → Save draft → Mark as sent." },
          { label: "Customer approves (record or simulate approval)", who: "st_cashier", done: approved, href: jobHref, hint: "Quotation tab → “Simulate customer approval (demo)”." },
          { label: "Repair in progress", who: tech, done: reached("in_progress"), href: jobHref },
          { label: "Record spare part used (stock deducted)", who: tech, done: partsDone, href: jobHref, hint: "Parts used tab → select iPhone 13 Screen → Record." },
          { label: "Submit for quality check", who: tech, done: reached("quality_check"), href: jobHref },
          { label: "QC passed by a different person → Ready for collection", who: "st_owner", done: reached("ready"), href: jobHref },
          { label: "Customer pays balance → receipt issued → job completed", who: "st_cashier", done: st === "completed", href: job ? `/pos?mode=collect&job=${job.id}` : undefined },
        ]
      : [
          { label: `Register ${sc.device.model} for ${sc.customer.name}`, who: "st_cashier", done: !!job, href: `/repairs/new?prefill=${prefill}`, hint: "Form is pre-filled. Assign technician Mei Ling." },
          { label: "Technician diagnoses overheating", who: tech, done: reached("diagnosing") && !!job?.diagnosis, href: jobHref },
          { label: "Repair quotation (fan + thermal + labour) sent", who: tech, done: quotes.some((q) => q.status !== "draft"), href: jobHref },
          { label: "Customer approves", who: "st_cashier", done: approved, href: jobHref },
          { label: "Parts and labour recorded, repair status updated", who: tech, done: partsDone && reached("in_progress"), href: jobHref },
          { label: "Quality check → Ready for collection", who: "st_owner", done: reached("ready"), href: jobHref },
          { label: "Device collected & paid", who: "st_cashier", done: st === "completed", href: job ? `/pos?mode=collect&job=${job.id}` : undefined, hint: "Choose a warranty rule before releasing the device." },
          { label: "Warranty record created", who: "st_cashier", done: !!warranty, href: "/warranty" },
        ];

  return (
    <ScenarioCard
      letter={letter}
      icon={icon}
      title={sc.title}
      started={!!since}
      onStart={onStart}
      done={st === "completed"}
      onFast={() => {
        const s = since ?? onStart();
        run((d) => autoRunRepair(d, sc, s), (no) => `${no} fast-forwarded to completion`);
      }}
      result={
        job && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/repairs/${job.id}`} className="font-mono font-semibold underline">
              {job.jobNo}
            </Link>
            <StatusBadge status={job.status} />
            {sale && (
              <Link href={`/transactions?r=${sale.id}`} className="underline">
                {sale.receiptNo} · {money(sale.total)}
              </Link>
            )}
            {warranty && <span className="text-ink-3">{warranty.warrantyNo}</span>}
          </div>
        )
      }
    >
      <StepList steps={steps} />
    </ScenarioCard>
  );
}
