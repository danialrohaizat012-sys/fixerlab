"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Search, Wallet } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { checkOverridePin, receiveSalePayment, refundSale, saleBalance, salePaid, type PaymentInput } from "@/lib/services";
import { cx, fmtDateTime, money, myDateKey } from "@/lib/format";
import type { Sale } from "@/lib/types";
import { Badge, Button, Card, Denied, Field, Input, Modal, Notice, PageHeader, Select, Table, Textarea, td, th } from "@/components/ui";
import { ReceiptModal } from "@/components/receipt";
import { PaymentPanel, PinPrompt } from "@/components/payment";
import { lastNDays } from "@/lib/reports";

export default function TransactionsPage() {
  const { db, me } = useStore();
  const [range, setRange] = useState("7");
  const [kind, setKind] = useState("");
  const [method, setMethod] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string>();
  const [refund, setRefund] = useState<Sale>();
  const [collect, setCollect] = useState<Sale>();

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("r");
    if (r) {
      setOpen(r);
      setRange("all");
    }
  }, []);

  const rows = useMemo(() => {
    const from = range === "all" ? "0000" : lastNDays(Number(range))[0];
    const s = q.trim().toLowerCase();
    return db.sales.filter((sale) => {
      if (myDateKey(sale.at) < from) return false;
      if (kind === "outstanding" ? saleBalance(db, sale) <= 0 : kind && sale.kind !== kind) return false;
      if (method && !db.payments.some((p) => p.saleId === sale.id && p.methodId === method)) return false;
      if (s) {
        const c = db.customers.find((x) => x.id === sale.customerId);
        if (!`${sale.receiptNo} ${c?.name ?? ""} ${sale.lines.map((l) => l.description).join(" ")}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [db, range, kind, method, q]);

  if (!can(me.role, "sales.view")) return <Denied what="view transactions" />;
  const total = rows.reduce((a, s) => a + s.total, 0);
  const sale = open ? db.sales.find((s) => s.id === open) : undefined;

  return (
    <div>
      <PageHeader title="Transactions" subtitle={`${rows.length} transactions · ${money(total)} gross`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Receipt no., customer, item" className="pl-9" />
        </div>
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-auto">
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="all">All time</option>
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto">
          <option value="">Retail & repair</option>
          <option value="retail">Retail only</option>
          <option value="repair">Repair only</option>
          <option value="outstanding">With outstanding balance</option>
        </Select>
        <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-auto">
          <option value="">All payment methods</option>
          {db.settings.paymentMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <th className={th}>Receipt</th>
              <th className={th}>Date / time</th>
              <th className={th}>Type</th>
              <th className={th}>Items</th>
              <th className={th}>Cashier</th>
              <th className={th}>Paid by</th>
              <th className={cx(th, "text-right")}>Total</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((s) => {
              const methods = Array.from(new Set(db.payments.filter((p) => p.saleId === s.id && p.kind !== "refund").map((p) => db.settings.paymentMethods.find((m) => m.id === p.methodId)?.name)));
              const bal = saleBalance(db, s);
              return (
                <tr key={s.id} className="cursor-pointer" onClick={() => setOpen(s.id)}>
                  <td className={cx(td, "font-mono text-[13px] font-semibold")}>{s.receiptNo}</td>
                  <td className={cx(td, "whitespace-nowrap text-ink-2")}>{fmtDateTime(s.at)}</td>
                  <td className={td}>
                    <Badge tone={s.kind === "repair" ? "violet" : "slate"}>{s.kind === "repair" ? "Repair" : "Retail"}</Badge>
                  </td>
                  <td className={cx(td, "max-w-[260px] truncate")}>{s.lines.map((l) => l.description).join(", ")}</td>
                  <td className={td}>{db.staff.find((x) => x.id === s.cashierId)?.name}</td>
                  <td className={cx(td, "text-ink-2")}>{methods.join(", ")}</td>
                  <td className={cx(td, "num text-right font-semibold")}>{money(s.total)}</td>
                  <td className={td}>
                    {s.status === "refunded" ? <Badge tone="red">Refunded</Badge> : s.status === "partially_refunded" ? <Badge tone="amber">Part refunded</Badge> : bal > 0 ? <Badge tone="amber">Balance {money(bal)}</Badge> : <Badge tone="green">Paid</Badge>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-ink-3">
                  No transactions in this period.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <ReceiptModal
        db={db}
        sale={sale}
        open={!!sale && !refund && !collect}
        onClose={() => setOpen(undefined)}
        footer={
          sale && (
            <>
              {saleBalance(db, sale) > 0 && can(me.role, "payment.receive") && (
                <Button icon={<Wallet className="size-4" />} onClick={() => setCollect(sale)}>
                  Receive balance
                </Button>
              )}
              {sale.status !== "refunded" && salePaid(db, sale.id) > 0 && (
                <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setRefund(sale)}>
                  Refund
                </Button>
              )}
            </>
          )
        }
      />
      {refund && <RefundDialog sale={refund} onClose={() => setRefund(undefined)} />}
      {collect && <BalanceDialog sale={collect} onClose={() => setCollect(undefined)} />}
    </div>
  );
}

function BalanceDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { db, run } = useStore();
  const bal = saleBalance(db, sale);
  const [p, setP] = useState<PaymentInput[]>([]);
  const [valid, setValid] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Receive balance — ${sale.receiptNo}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={() => run((d) => receiveSalePayment(d, sale.id, p), "Payment recorded").ok && onClose()}>
            Record payment
          </Button>
        </>
      }
    >
      <PaymentPanel methods={db.settings.paymentMethods} due={bal} allowPartial onChange={(x, v) => { setP(x); setValid(v && x.length > 0); }} />
    </Modal>
  );
}

function RefundDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { db, me, run, toast } = useStore();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [methodId, setMethodId] = useState(db.payments.find((p) => p.saleId === sale.id && p.kind !== "refund")?.methodId ?? "pm_cash");
  const [pinOpen, setPinOpen] = useState(false);
  const isOwner = can(me.role, "sales.refund");

  const est = sale.lines.reduce((a, l) => {
    const q = qty[l.id] ?? 0;
    const gross = l.unitPrice * q;
    const disc = sale.subtotal ? Math.round((sale.discount * gross) / sale.subtotal) : 0;
    return a + gross - disc;
  }, 0);

  const submit = (pin?: string) => {
    const r = run(
      (d) =>
        refundSale(d, {
          saleId: sale.id,
          lines: sale.lines.map((l) => ({ saleLineId: l.id, qty: qty[l.id] ?? 0, restock: restock[l.id] ?? (l.type === "product") })),
          reason,
          methodId,
          overridePin: pin,
        }),
      (no) => `Refund ${no} recorded`,
    );
    if (r.ok) onClose();
  };

  return (
    <>
      <Modal
        open={!pinOpen}
        onClose={onClose}
        title={`Refund — ${sale.receiptNo}`}
        size="lg"
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="danger" icon={<RotateCcw className="size-4" />} disabled={!est || !reason.trim()} onClick={() => (isOwner ? submit() : setPinOpen(true))}>
              {isOwner ? `Refund ${money(est)}` : "Request owner authorisation"}
            </Button>
          </>
        }
      >
        {!isOwner && <Notice tone="warn">Refunds require owner authorisation (PIN). The authoriser and reason are logged.</Notice>}
        <div className="mt-3 divide-y divide-line rounded-lg border border-line">
          {sale.lines.map((l) => {
            const avail = l.qty - l.refundedQty;
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.description}</div>
                  <div className="text-xs text-ink-3">
                    {l.qty} × {money(l.unitPrice)} {l.refundedQty > 0 && `· ${l.refundedQty} already refunded`}
                  </div>
                </div>
                {l.itemId && (l.type === "product" || l.type === "part") && (
                  <label className="flex items-center gap-1.5 text-xs text-ink-2">
                    <input type="checkbox" checked={restock[l.id] ?? l.type === "product"} onChange={(e) => setRestock((r) => ({ ...r, [l.id]: e.target.checked }))} />
                    Return to stock
                  </label>
                )}
                <Select value={qty[l.id] ?? 0} onChange={(e) => setQty((x) => ({ ...x, [l.id]: Number(e.target.value) }))} className="h-9 w-20" disabled={avail <= 0}>
                  {Array.from({ length: avail + 1 }, (_, i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Refund method">
            <Select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              {db.settings.paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated refund">
            <div className="num flex h-10 items-center text-lg font-semibold">{money(est)}</div>
          </Field>
        </div>
        <Field label="Reason (required)" className="mt-3">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective charger returned within 7 days" />
        </Field>
        <p className="mt-2 text-xs text-ink-3">Refunds are recorded as new entries; the original sale is never edited. Discounts and tax are pro-rated.</p>
      </Modal>
      <PinPrompt
        open={pinOpen}
        title="Owner authorisation"
        reason={`Refund of ${money(est)} on ${sale.receiptNo}.`}
        onClose={() => setPinOpen(false)}
        onSubmit={(pin) => {
          if (!checkOverridePin(db, pin, "sales.refund")) {
            toast("Invalid authorisation PIN.", "error");
            return;
          }
          setPinOpen(false);
          submit(pin);
        }}
      />
    </>
  );
}
