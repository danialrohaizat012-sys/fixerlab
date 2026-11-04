"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Minus, Plus, Trash2, Percent, UserPlus, ShoppingCart, Wrench, X, PackageX, CheckCircle2, ScanBarcode } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { calcTotals, checkOverridePin, collectionInvoice, collectRepair, completeSale, type PaymentInput } from "@/lib/services";
import { cx, money, toSen, uid, fmtDate } from "@/lib/format";
import type { Sale } from "@/lib/types";
import { Button, Card, Denied, Field, Input, Modal, Notice, Select, StatusBadge, Tabs, KV } from "@/components/ui";
import { PaymentPanel, PinPrompt } from "@/components/payment";
import { ReceiptModal } from "@/components/receipt";

type CartLine = { itemId: string; qty: number };

export default function PosPage() {
  const { me } = useStore();
  const [mode, setMode] = useState<"sale" | "collect">("sale");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "collect") setMode("collect");
  }, []);
  if (!can(me.role, "pos.sell")) return <Denied what="use the cashier POS" />;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cashier</h1>
        <div className="w-full sm:w-auto">
          <Tabs
            value={mode}
            onChange={setMode}
            tabs={[
              { id: "sale", label: <><ShoppingCart className="size-4" /> New Sale</> },
              { id: "collect", label: <><Wrench className="size-4" /> Collect Repair</> },
            ]}
          />
        </div>
      </div>
      {mode === "sale" ? <SaleMode /> : <CollectMode />}
    </div>
  );
}

// ───────────────────────── New sale ─────────────────────────

function SaleMode() {
  const { db, me, run, toast } = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [showParts, setShowParts] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [overridePin, setOverridePin] = useState<string>();
  const [discountOpen, setDiscountOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>();
  const [custOpen, setCustOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [receipt, setReceipt] = useState<Sale>();
  const searchRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.items.filter(
      (i) =>
        i.active &&
        (showParts ? i.type === "part" : i.type === "retail") &&
        (cat === "All" || i.category === cat) &&
        (!s || i.name.toLowerCase().includes(s) || i.sku.toLowerCase().includes(s) || i.barcode === s),
    );
  }, [db.items, q, cat, showParts]);

  const lines = cart.map((c) => ({ ...c, item: db.items.find((i) => i.id === c.itemId)! })).filter((l) => l.item);
  const subtotal = lines.reduce((s, l) => s + l.item.price * l.qty, 0);
  const totals = calcTotals(subtotal, discount, db.settings);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const customer = customerId ? db.customers.find((c) => c.id === customerId) : undefined;

  useEffect(() => {
    if (discount > subtotal) setDiscount(subtotal);
  }, [subtotal, discount]);

  const add = (itemId: string) => {
    const it = db.items.find((i) => i.id === itemId)!;
    const inCart = cart.find((c) => c.itemId === itemId)?.qty ?? 0;
    if (inCart + 1 > it.stock && !it.allowNegative) {
      toast(`Only ${it.stock} × ${it.name} in stock.`, "error");
      return;
    }
    setCart((c) => (c.some((x) => x.itemId === itemId) ? c.map((x) => (x.itemId === itemId ? { ...x, qty: x.qty + 1 } : x)) : [...c, { itemId, qty: 1 }]));
  };
  const setQty = (itemId: string, qty: number) => {
    const it = db.items.find((i) => i.id === itemId)!;
    if (qty > it.stock && !it.allowNegative) {
      toast(`Only ${it.stock} in stock.`, "error");
      return;
    }
    setCart((c) => (qty <= 0 ? c.filter((x) => x.itemId !== itemId) : c.map((x) => (x.itemId === itemId ? { ...x, qty } : x))));
  };
  const clear = () => {
    setCart([]);
    setDiscount(0);
    setOverridePin(undefined);
    setCustomerId(undefined);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "F9" && lines.length && !checkout) {
        e.preventDefault();
        setCheckout(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines.length, checkout]);

  const cats = ["All", ...(showParts ? db.settings.partCategories : db.settings.retailCategories)];

  return (
    <div className="grid gap-4 pb-20 lg:grid-cols-[1fr_340px] lg:pb-0 xl:grid-cols-[1fr_400px]">
      {/* Products */}
      <div className="min-w-0">
        <div className="relative">
          <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
          <input
            ref={searchRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const s = q.trim().toLowerCase();
                const exact = db.items.find((i) => i.active && (i.barcode === s || i.sku.toLowerCase() === s));
                const target = exact ?? (items.length === 1 ? items[0] : undefined);
                if (target) {
                  add(target.id);
                  setQ("");
                }
              }
            }}
            placeholder="Scan barcode or search name / SKU  (F2)"
            className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-11 pr-10 text-[15px] shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {q && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" onClick={() => setQ("")} aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="scroll-thin mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cx(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium",
                cat === c ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 hover:border-line-strong",
              )}
            >
              {c}
            </button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-line" />
          <button
            onClick={() => {
              setShowParts((v) => !v);
              setCat("All");
            }}
            className={cx("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium", showParts ? "border-brand bg-brand-soft text-ink" : "border-dashed border-line-strong text-ink-3")}
          >
            {showParts ? "Showing spare parts" : "Spare parts (counter sale)"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((i) => {
            const out = i.stock <= 0 && !i.allowNegative;
            const low = i.stock <= i.minStock;
            const inCart = cart.find((c) => c.itemId === i.id)?.qty;
            return (
              <button
                key={i.id}
                onClick={() => add(i.id)}
                disabled={out}
                className={cx(
                  "group relative flex min-h-[112px] flex-col rounded-xl border bg-surface p-3 text-left transition-all hover:-translate-y-px hover:border-brand hover:shadow-md disabled:translate-y-0 disabled:opacity-50 disabled:hover:border-line disabled:hover:shadow-none",
                  inCart ? "border-brand ring-1 ring-brand" : "border-line",
                )}
              >
                {inCart && <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-brand text-xs font-bold text-white">{inCart}</span>}
                <span className="line-clamp-2 text-[13.5px] font-medium leading-snug">{i.name}</span>
                <span className="mt-0.5 font-mono text-[11px] text-ink-3">{i.sku}</span>
                <span className="mt-auto flex items-end justify-between pt-2">
                  <span className="num text-[15px] font-semibold">{money(i.price)}</span>
                  <span className={cx("text-[11px]", out ? "font-semibold text-red-600" : low ? "font-medium text-amber-700 dark:text-amber-300" : "text-ink-3")}>
                    {out ? "Out of stock" : `${i.stock} left`}
                  </span>
                </span>
              </button>
            );
          })}
          {!items.length && (
            <div className="col-span-full py-12 text-center text-sm text-ink-3">
              <PackageX className="mx-auto mb-2 size-8" />
              No products match “{q}”.
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <Card className="flex h-fit flex-col lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-96px)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <ShoppingCart className="size-4 text-ink-3" /> Current sale
            {count > 0 && <span className="rounded-full bg-surface-2 px-2 text-xs ring-1 ring-line">{count}</span>}
          </div>
          {lines.length > 0 && (
            <button onClick={clear} className="text-xs text-ink-3 hover:text-red-600">
              Clear
            </button>
          )}
        </div>
        <div className="border-b border-line px-4 py-2.5">
          {customer ? (
            <div className="flex items-center justify-between text-sm">
              <span>
                <span className="font-medium">{customer.name}</span> <span className="text-ink-3">· {customer.phone}</span>
              </span>
              <button onClick={() => setCustomerId(undefined)} className="text-ink-3 hover:text-ink" aria-label="Remove customer">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setCustOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
              <UserPlus className="size-4" /> Attach customer (optional)
            </button>
          )}
        </div>
        <div className="scroll-thin min-h-[140px] flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-ink-3">Scan or tap a product to start a sale.</div>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.itemId} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.item.name}</div>
                    <div className="num text-xs text-ink-3">{money(l.item.price)} each</div>
                  </div>
                  <div className="flex items-center rounded-lg border border-line">
                    <button className="grid size-8 place-items-center text-ink-2 hover:bg-surface-2" onClick={() => setQty(l.itemId, l.qty - 1)} aria-label="Decrease quantity">
                      <Minus className="size-3.5" />
                    </button>
                    <input
                      value={l.qty}
                      onChange={(e) => setQty(l.itemId, parseInt(e.target.value || "0", 10) || 0)}
                      className="num h-8 w-9 border-x border-line bg-transparent text-center text-sm"
                      inputMode="numeric"
                      aria-label="Quantity"
                    />
                    <button className="grid size-8 place-items-center text-ink-2 hover:bg-surface-2" onClick={() => setQty(l.itemId, l.qty + 1)} aria-label="Increase quantity">
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <div className="num w-20 text-right text-sm font-semibold">{money(l.item.price * l.qty)}</div>
                  <button className="text-ink-3 hover:text-red-600" onClick={() => setQty(l.itemId, 0)} aria-label={`Remove ${l.item.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-line px-4 py-3">
          <KV k="Subtotal" v={<span className="num">{money(totals.subtotal)}</span>} />
          <div className="flex items-center justify-between py-1.5 text-sm">
            <button onClick={() => setDiscountOpen(true)} disabled={!lines.length} className="inline-flex items-center gap-1 text-ink-3 hover:text-ink disabled:opacity-50">
              <Percent className="size-3.5" /> {discount ? "Discount" : "Add discount"}
            </button>
            <span className="num font-medium">{discount ? `-${money(totals.discount)}` : "—"}</span>
          </div>
          {db.settings.taxEnabled && <KV k={`${db.settings.taxLabel} (${db.settings.taxRatePct}%)`} v={<span className="num">{money(totals.tax)}</span>} />}
          <div className="mt-2 flex items-end justify-between border-t border-dashed border-line pt-3">
            <span className="text-sm font-medium text-ink-2">Total</span>
            <span className="num font-display text-3xl font-bold">{money(totals.total)}</span>
          </div>
          <Button variant="primary" size="lg" className="mt-3 w-full" disabled={!lines.length || totals.total <= 0} onClick={() => setCheckout(true)}>
            Charge {money(totals.total)} <kbd className="ml-1 rounded bg-white/20 px-1.5 text-[11px]">F9</kbd>
          </Button>
        </div>
      </Card>

      {/* Mobile sticky total */}
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-surface px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden">
          <div className="flex-1">
            <div className="text-xs text-ink-3">{count} item(s)</div>
            <div className="num text-lg font-bold">{money(totals.total)}</div>
          </div>
          <Button variant="primary" onClick={() => setCheckout(true)}>
            Charge
          </Button>
        </div>
      )}

      <DiscountDialog
        open={discountOpen}
        subtotal={subtotal}
        limitPct={me.discountLimitPct}
        isOwner={can(me.role, "pos.discount.override")}
        onClose={() => setDiscountOpen(false)}
        onApply={(amt, pin) => {
          setDiscount(amt);
          setOverridePin(pin);
          setDiscountOpen(false);
        }}
      />
      <CustomerPicker open={custOpen} onClose={() => setCustOpen(false)} onPick={(id) => { setCustomerId(id); setCustOpen(false); }} />
      {checkout && (
        <CheckoutDialog
          total={totals.total}
          onClose={() => setCheckout(false)}
          onComplete={(payments, key) => {
            const r = run(
              (d) => completeSale(d, { idempotencyKey: key, lines: cart, discount, overridePin, customerId, payments }),
              (s) => `Sale completed — ${s.receiptNo}`,
            );
            if (r.ok) {
              setCheckout(false);
              setReceipt(r.value);
              clear();
            }
            return r.ok;
          }}
        />
      )}
      <ReceiptModal
        db={db}
        sale={receipt}
        open={!!receipt}
        onClose={() => {
          setReceipt(undefined);
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
        footer={<Button onClick={() => setReceipt(undefined)}>New sale</Button>}
      />
    </div>
  );
}

function CheckoutDialog({ total, onClose, onComplete }: { total: number; onClose: () => void; onComplete: (p: PaymentInput[], key: string) => boolean }) {
  const { db } = useStore();
  const [payments, setPayments] = useState<PaymentInput[]>([]);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  // One idempotency key per checkout attempt: double-clicks / retries cannot create a second sale.
  const key = useMemo(() => uid("chk_"), []);
  return (
    <Modal
      open
      onClose={onClose}
      title="Take payment"
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Back to cart</Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!valid || busy}
            icon={<CheckCircle2 className="size-5" />}
            onClick={() => {
              if (busy) return;
              setBusy(true);
              const ok = onComplete(payments, key);
              if (!ok) setBusy(false);
            }}
          >
            {busy ? "Processing…" : "Complete sale"}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-end justify-between rounded-xl bg-surface-2 px-4 py-3">
        <span className="text-sm text-ink-3">Amount due</span>
        <span className="num font-display text-3xl font-bold">{money(total)}</span>
      </div>
      <PaymentPanel methods={db.settings.paymentMethods} due={total} onChange={(p, v) => { setPayments(p); setValid(v); }} />
    </Modal>
  );
}

function DiscountDialog({
  open,
  subtotal,
  limitPct,
  isOwner,
  onClose,
  onApply,
}: {
  open: boolean;
  subtotal: number;
  limitPct: number;
  isOwner: boolean;
  onClose: () => void;
  onApply: (amount: number, pin?: string) => void;
}) {
  const { db, toast } = useStore();
  const [mode, setMode] = useState<"amt" | "pct">("pct");
  const [val, setVal] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  useEffect(() => {
    if (open) setVal("");
  }, [open]);
  const amount = Math.min(subtotal, mode === "pct" ? Math.round((subtotal * (parseFloat(val) || 0)) / 100) : toSen(val));
  const pct = subtotal ? (amount / subtotal) * 100 : 0;
  const needsOverride = !isOwner && pct > limitPct + 1e-9;
  return (
    <>
      <Modal
        open={open && !pinOpen}
        onClose={onClose}
        title="Apply discount"
        size="sm"
        footer={
          <>
            <Button onClick={() => onApply(0)}>Remove discount</Button>
            <Button variant="primary" disabled={amount <= 0} onClick={() => (needsOverride ? setPinOpen(true) : onApply(amount))}>
              {needsOverride ? "Request owner approval" : "Apply"}
            </Button>
          </>
        }
      >
        <div className="mb-3 inline-flex rounded-lg border border-line p-0.5">
          {(["pct", "amt"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cx("rounded-md px-3 py-1 text-sm", mode === m ? "bg-ink text-surface" : "text-ink-2")}>
              {m === "pct" ? "Percent %" : "Amount RM"}
            </button>
          ))}
        </div>
        <Input autoFocus inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={mode === "pct" ? "e.g. 10" : "e.g. 5.00"} className="num text-right text-lg" />
        <div className="mt-3 space-y-1 text-sm">
          <KV k="Discount" v={<span className="num">{money(amount)} ({pct.toFixed(1)}%)</span>} />
          <KV k="Your limit" v={isOwner ? "Unlimited (owner)" : `${limitPct}%`} />
        </div>
        {needsOverride && <Notice tone="warn">Above your discount limit — the owner must authorise with their PIN. This is logged.</Notice>}
      </Modal>
      <PinPrompt
        open={pinOpen}
        title="Owner approval"
        reason={`Discount of ${money(amount)} (${pct.toFixed(1)}%) exceeds the cashier limit of ${limitPct}%.`}
        onClose={() => setPinOpen(false)}
        onSubmit={(pin) => {
          if (!checkOverridePin(db, pin, "pos.discount.override")) {
            toast("Invalid authorisation PIN.", "error");
            return;
          }
          setPinOpen(false);
          onApply(amount, pin);
          toast("Discount authorised by owner.", "info");
        }}
      />
    </>
  );
}

function CustomerPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const { db } = useStore();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return db.customers.filter((c) => !s || c.name.toLowerCase().includes(s) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits))).slice(0, 8);
  }, [db.customers, q]);
  return (
    <Modal open={open} onClose={onClose} title="Attach customer" size="sm">
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone number" />
      <ul className="mt-2 divide-y divide-line">
        {list.map((c) => (
          <li key={c.id}>
            <button className="w-full px-1 py-2 text-left text-sm hover:bg-surface-2" onClick={() => onPick(c.id)}>
              <span className="font-medium">{c.name}</span> <span className="text-ink-3">· {c.phone}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-3">
        New customer? Register them in <Link href="/customers" className="underline">Customers</Link>.
      </p>
    </Modal>
  );
}

// ───────────────────────── Collect repair ─────────────────────────

function CollectMode() {
  const { db, run } = useStore();
  const [q, setQ] = useState("");
  const [jobId, setJobId] = useState<string>();
  const [receipt, setReceipt] = useState<Sale>();
  const [doneMsg, setDoneMsg] = useState<string>();
  useEffect(() => {
    const j = new URLSearchParams(window.location.search).get("job");
    if (j) setJobId(j);
  }, []);

  const ready = db.jobs.filter((j) => j.status === "ready");
  const filtered = ready.filter((j) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const c = db.customers.find((x) => x.id === j.customerId);
    return j.jobNo.toLowerCase().includes(s) || c?.name.toLowerCase().includes(s) || c?.phone.replace(/\D/g, "").includes(s.replace(/\D/g, "") || "~");
  });
  const job = jobId ? db.jobs.find((j) => j.id === jobId) : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job no., customer name or phone" className="pl-9" />
          </div>
        </div>
        <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Ready for collection ({filtered.length})</div>
        <ul className="divide-y divide-line">
          {filtered.map((j) => {
            const c = db.customers.find((x) => x.id === j.customerId);
            const d = db.devices.find((x) => x.id === j.deviceId);
            return (
              <li key={j.id}>
                <button onClick={() => { setJobId(j.id); setDoneMsg(undefined); }} className={cx("w-full px-3 py-2.5 text-left hover:bg-surface-2", jobId === j.id && "bg-brand-soft")}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[13px] font-semibold">{j.jobNo}</span>
                    <span className="text-xs text-ink-3">{fmtDate(j.updatedAt)}</span>
                  </div>
                  <div className="text-sm">{c?.name}</div>
                  <div className="text-xs text-ink-3">
                    {d?.brand} {d?.model}
                  </div>
                </button>
              </li>
            );
          })}
          {!filtered.length && <li className="px-3 py-8 text-center text-sm text-ink-3">No jobs are ready for collection.</li>}
        </ul>
      </Card>
      <div>
        {doneMsg && (
          <Notice>
            {doneMsg}
          </Notice>
        )}
        {job && job.status === "ready" ? (
          <CollectPanel
            key={job.id}
            jobId={job.id}
            onDone={(sale) => {
              setJobId(undefined);
              if (sale) setReceipt(sale);
              else setDoneMsg("Device collected — no charge recorded.");
            }}
            run={run}
          />
        ) : (
          !doneMsg && (
            <Card>
              <div className="px-6 py-16 text-center text-sm text-ink-3">
                <Wrench className="mx-auto mb-2 size-8" />
                Select a job to prepare the final invoice and take payment.
              </div>
            </Card>
          )
        )}
      </div>
      <ReceiptModal db={db} sale={receipt} open={!!receipt} onClose={() => setReceipt(undefined)} />
    </div>
  );
}

function CollectPanel({ jobId, onDone, run }: { jobId: string; onDone: (s?: Sale) => void; run: ReturnType<typeof useStore>["run"] }) {
  const { db } = useStore();
  const job = db.jobs.find((j) => j.id === jobId)!;
  const cust = db.customers.find((c) => c.id === job.customerId);
  const dev = db.devices.find((d) => d.id === job.deviceId);
  const inv = useMemo(() => collectionInvoice(db, job), [db, job]);
  const deposits = db.payments.filter((p) => p.repairJobId === job.id && p.kind === "deposit" && !p.saleId);
  const depTotal = deposits.reduce((s, p) => s + p.amount, 0);
  const due = Math.max(0, inv.total - depTotal);
  const [payments, setPayments] = useState<PaymentInput[]>([]);
  const [valid, setValid] = useState(due === 0);
  const rules = db.warrantyRules.filter((r) => r.active);
  const [ruleId, setRuleId] = useState<string>(inv.quote && inv.lines.length ? rules[0]?.id ?? "" : "");
  const [busy, setBusy] = useState(false);
  const key = useMemo(() => uid("col_"), []);
  const method = (id: string) => db.settings.paymentMethods.find((m) => m.id === id)?.name;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold">{job.jobNo}</span>
            <StatusBadge status={job.status} />
          </div>
          <div className="mt-1 text-sm text-ink-2">
            {cust?.name} · {cust?.phone} — {dev?.brand} {dev?.model}
          </div>
        </div>
        <Link href={`/repairs/${job.id}`} className="text-sm text-ink-3 underline underline-offset-2 hover:text-ink">
          Open job
        </Link>
      </div>
      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Final invoice</h3>
          {inv.quote ? (
            <p className="mb-2 text-xs text-ink-3">Based on approved quotation {inv.quote.quoteNo}.</p>
          ) : (
            <p className="mb-2 text-xs text-ink-3">No approved quotation — device returned {db.settings.diagnosisFee ? "with diagnosis fee" : "without charge"}.</p>
          )}
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {inv.lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  {l.description}
                  <span className="block text-xs text-ink-3">
                    {l.qty} × {money(l.unitPrice)} · <span className="uppercase">{l.type}</span>
                  </span>
                </span>
                <span className="num shrink-0 whitespace-nowrap font-medium">{money(l.qty * l.unitPrice)}</span>
              </li>
            ))}
            {!inv.lines.length && <li className="px-3 py-3 text-ink-3">No chargeable items.</li>}
          </ul>
          <div className="mt-3">
            <KV k="Subtotal" v={<span className="num">{money(inv.subtotal)}</span>} />
            {inv.discount > 0 && <KV k="Discount" v={<span className="num">-{money(inv.discount)}</span>} />}
            {(db.settings.taxEnabled || inv.tax > 0) && <KV k={db.settings.taxLabel} v={<span className="num">{money(inv.tax)}</span>} />}
            <KV k="Invoice total" v={<span className="num">{money(inv.total)}</span>} />
            {deposits.map((d) => (
              <KV key={d.id} k={`Deposit paid ${fmtDate(d.at)} (${method(d.methodId)})`} v={<span className="num text-green-700 dark:text-green-400">-{money(d.amount)}</span>} />
            ))}
            <div className="mt-2 flex items-end justify-between border-t border-dashed border-line pt-2">
              <span className="text-sm font-medium">Balance due</span>
              <span className="num font-display text-2xl font-bold">{money(due)}</span>
            </div>
            {depTotal > inv.total && <Notice tone="warn">Deposit exceeds invoice — excess {money(depTotal - inv.total)} will be recorded as refunded to the customer.</Notice>}
          </div>
        </div>
        <div className="space-y-4">
          {due > 0 ? (
            <PaymentPanel methods={db.settings.paymentMethods} due={due} allowPartial={db.settings.allowCollectWithBalance} onChange={(p, v) => { setPayments(p); setValid(v); }} />
          ) : (
            <Notice>No payment required at collection.</Notice>
          )}
          {inv.quote && inv.lines.length > 0 && (
            <Field label="Warranty" hint="Rules are configured by Fixerlab in Settings. Sample rules shown.">
              <Select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
                <option value="">No warranty</option>
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!valid || busy}
            icon={<CheckCircle2 className="size-5" />}
            onClick={() => {
              setBusy(true);
              const r = run((d) => collectRepair(d, job.id, { idempotencyKey: key, payments, warrantyRuleId: ruleId || undefined }), "Device collected — job completed");
              if (r.ok) onDone(r.value);
              else setBusy(false);
            }}
          >
            {busy ? "Processing…" : due > 0 ? `Receive ${money(payments.reduce((s, p) => s + p.amount, 0))} & release device` : "Release device"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
