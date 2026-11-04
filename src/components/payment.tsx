"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Landmark, QrCode, Wallet, Plus, Trash2, KeyRound } from "lucide-react";
import type { PaymentMethod } from "@/lib/types";
import type { PaymentInput } from "@/lib/services";
import { cx, money, senToInput, toSen } from "@/lib/format";
import { Button, Field, Input, Modal } from "./ui";

export function methodIcon(m: PaymentMethod) {
  const n = m.name.toLowerCase();
  if (m.isCash) return <Banknote className="size-5" />;
  if (n.includes("duitnow") || n.includes("qr")) return <QrCode className="size-5" />;
  if (n.includes("card")) return <CreditCard className="size-5" />;
  if (n.includes("transfer") || n.includes("bank")) return <Landmark className="size-5" />;
  return <Wallet className="size-5" />;
}

interface Entry {
  methodId: string;
  amount: string;
  tendered: string;
  reference: string;
}

/**
 * Payment capture: records the method used — it does NOT process real payments.
 * Supports split payments and cash change calculation.
 */
export function PaymentPanel({
  methods,
  due,
  allowPartial,
  onChange,
}: {
  methods: PaymentMethod[];
  due: number;
  allowPartial?: boolean;
  onChange: (payments: PaymentInput[], valid: boolean) => void;
}) {
  const active = useMemo(() => methods.filter((m) => m.active), [methods]);
  const [entries, setEntries] = useState<Entry[]>([{ methodId: active[0]?.id ?? "", amount: senToInput(due), tendered: "", reference: "" }]);

  useEffect(() => {
    setEntries([{ methodId: active[0]?.id ?? "", amount: senToInput(due), tendered: "", reference: "" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);

  const parsed = useMemo(
    () =>
      entries.map((e) => {
        const m = active.find((x) => x.id === e.methodId);
        const amount = toSen(e.amount);
        const tendered = m?.isCash && e.tendered ? toSen(e.tendered) : undefined;
        return { methodId: e.methodId, amount, tendered, reference: e.reference, isCash: !!m?.isCash };
      }),
    [entries, active],
  );
  const sum = parsed.reduce((s, p) => s + p.amount, 0);
  const remaining = due - sum;
  const cashShort = parsed.some((p) => p.isCash && p.tendered !== undefined && p.tendered < p.amount);
  const valid = !cashShort && parsed.every((p) => p.amount > 0 && p.methodId) && (allowPartial ? sum <= due && sum >= 0 : sum === due);

  useEffect(() => {
    onChange(
      parsed.filter((p) => p.amount > 0).map(({ methodId, amount, tendered, reference }) => ({ methodId, amount, tendered, reference })),
      valid,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, valid]);

  const update = (i: number, patch: Partial<Entry>) => setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  return (
    <div className="space-y-3">
      {entries.map((e, i) => {
        const m = active.find((x) => x.id === e.methodId);
        const p = parsed[i];
        const change = p.tendered !== undefined ? p.tendered - p.amount : 0;
        return (
          <div key={i} className="rounded-xl border border-line p-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {active.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => update(i, { methodId: pm.id })}
                  className={cx(
                    "flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-[11.5px] font-medium leading-tight transition-colors",
                    e.methodId === pm.id ? "border-brand bg-brand-soft text-ink ring-1 ring-brand" : "border-line text-ink-2 hover:border-line-strong",
                  )}
                  aria-pressed={e.methodId === pm.id}
                >
                  {methodIcon(pm)}
                  <span className="text-center">{pm.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={entries.length > 1 ? `Amount #${i + 1} (RM)` : "Amount (RM)"}>
                <Input inputMode="decimal" value={e.amount} onChange={(ev) => update(i, { amount: ev.target.value })} className="num text-right font-semibold" />
              </Field>
              {m?.isCash ? (
                <Field label="Cash tendered (RM)" hint={p.tendered !== undefined ? (change >= 0 ? `Change: ${money(change)}` : "Tendered is less than amount") : "Optional — to calculate change"}>
                  <Input inputMode="decimal" value={e.tendered} onChange={(ev) => update(i, { tendered: ev.target.value })} className="num text-right" placeholder="0.00" />
                </Field>
              ) : (
                <Field label="Reference (optional)" hint="e.g. last 4 digits, transfer ref.">
                  <Input value={e.reference} onChange={(ev) => update(i, { reference: ev.target.value })} maxLength={40} />
                </Field>
              )}
            </div>
            {m?.isCash && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[p.amount, 1000, 2000, 5000, 10000]
                  .filter((v, k, a) => v > 0 && (k === 0 || v >= p.amount) && a.indexOf(v) === k)
                  .slice(0, 4)
                  .map((v) => (
                    <button key={v} type="button" className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-surface-2" onClick={() => update(i, { tendered: senToInput(v) })}>
                      {v === p.amount ? "Exact" : money(v)}
                    </button>
                  ))}
              </div>
            )}
            {entries.length > 1 && (
              <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-red-600" onClick={() => setEntries((es) => es.filter((_, j) => j !== i))}>
                <Trash2 className="size-3.5" /> Remove this payment
              </button>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus className="size-4" />}
          disabled={remaining <= 0}
          onClick={() => setEntries((es) => [...es, { methodId: active[1]?.id ?? active[0].id, amount: senToInput(Math.max(0, remaining)), tendered: "", reference: "" }])}
        >
          Split payment
        </Button>
        <span className={cx("num", remaining === 0 ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-300")}>
          {remaining === 0 ? "Fully allocated" : remaining > 0 ? `Remaining ${money(remaining)}` : `Over by ${money(-remaining)}`}
        </span>
      </div>
      <p className="text-xs text-ink-3">Records the payment method only — no payment gateway is connected in this prototype.</p>
    </div>
  );
}

/** Supervisor PIN prompt for overrides (discount above limit, refunds). Demo PINs are shown on the Staff page. */
export function PinPrompt({ open, title, reason, onClose, onSubmit }: { open: boolean; title: string; reason: string; onClose: () => void; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  useEffect(() => {
    if (open) setPin("");
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<KeyRound className="size-4" />} disabled={pin.length < 4} onClick={() => onSubmit(pin)}>
            Authorise
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-2">{reason}</p>
      <Field label="Owner PIN" hint="Demo owner PIN: 1234">
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && onSubmit(pin)}
          className="num text-center text-lg tracking-[0.5em]"
        />
      </Field>
    </Modal>
  );
}
