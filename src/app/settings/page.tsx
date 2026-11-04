"use client";

import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { saveWarrantyRule, updateSettings } from "@/lib/services";
import { money, senToInput, toSen, uid } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { Button, Card, CardHeader, Denied, Field, Input, Notice, PageHeader, Textarea } from "@/components/ui";

export default function SettingsPage() {
  const { db, me, run } = useStore();
  const [s, setS] = useState<Settings>(() => structuredClone(db.settings));
  const [newMethod, setNewMethod] = useState("");
  const [newRetailCat, setNewRetailCat] = useState("");
  const [newPartCat, setNewPartCat] = useState("");
  const [rule, setRule] = useState({ name: "", days: "", terms: "" });
  if (!can(me.role, "settings.edit")) return <Denied what="change system settings" />;
  const set = (p: Partial<Settings>) => setS((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);

  return (
    <div className="space-y-5 pb-20">
      <PageHeader title="Settings" subtitle="Business configuration. Changes apply to new transactions only." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Business information" subtitle="Shown on receipts and quotations" />
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/fixerlab-badge.png" alt="Current logo" className="size-14 rounded-full ring-1 ring-line" />
              <p className="text-xs text-ink-3">Logo upload is enabled in the production phase (Supabase Storage). The demo uses the supplied Fixerlab badge.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Business name">
                <Input value={s.businessName} onChange={(e) => set({ businessName: e.target.value })} />
              </Field>
              <Field label="Branch">
                <Input value={s.branchName} onChange={(e) => set({ branchName: e.target.value })} />
              </Field>
            </div>
            <Field label="Address">
              <Textarea value={s.address} onChange={(e) => set({ address: e.target.value })} className="min-h-14" />
            </Field>
            <Field label="Phone">
              <Input value={s.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="Receipt footer">
              <Textarea value={s.receiptFooter} onChange={(e) => set({ receiptFooter: e.target.value })} className="min-h-16" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Tax" />
          <div className="space-y-3 p-4 sm:p-5">
            <Notice tone="warn">Tax is OFF by default. Enable only after Fixerlab confirms its SST registration status and applicable rates.</Notice>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.taxEnabled} onChange={(e) => set({ taxEnabled: e.target.checked })} /> Charge tax on sales (tax-exclusive pricing)
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tax label">
                <Input value={s.taxLabel} onChange={(e) => set({ taxLabel: e.target.value })} />
              </Field>
              <Field label="Rate (%)">
                <Input inputMode="decimal" value={s.taxRatePct} onChange={(e) => set({ taxRatePct: parseFloat(e.target.value) || 0 })} className="num text-right" />
              </Field>
            </div>
          </div>
          <CardHeader title="Repair policies" />
          <div className="space-y-3 p-4 sm:p-5">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={s.allowCollectWithBalance} onChange={(e) => set({ allowCollectWithBalance: e.target.checked })} />
              Allow device collection with an outstanding balance
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={s.qcRequiresDifferentPerson} onChange={(e) => set({ qcRequiresDifferentPerson: e.target.checked })} />
              Quality check must be done by someone other than the repairing technician
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Diagnosis fee (RM)" hint="Charged when a quotation is rejected or the device is unrepairable. 0 = none.">
                <Input inputMode="decimal" value={senToInput(s.diagnosisFee)} onChange={(e) => set({ diagnosisFee: toSen(e.target.value) })} className="num text-right" />
              </Field>
              <Field label="Quotation validity (days)">
                <Input inputMode="numeric" value={s.quoteValidityDays} onChange={(e) => set({ quoteValidityDays: parseInt(e.target.value, 10) || 1 })} className="num text-right" />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Payment methods" subtitle="Methods are recorded only — no payment gateway." />
          <ul className="divide-y divide-line">
            {s.paymentMethods.map((m, i) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                <Input value={m.name} onChange={(e) => set({ paymentMethods: s.paymentMethods.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="h-9" />
                <label className="flex shrink-0 items-center gap-1.5">
                  <input type="checkbox" checked={m.active} onChange={(e) => set({ paymentMethods: s.paymentMethods.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)) })} /> Active
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 border-t border-line p-4 sm:px-5">
            <Input value={newMethod} onChange={(e) => setNewMethod(e.target.value)} placeholder="e.g. Touch 'n Go eWallet" />
            <Button
              icon={<Plus className="size-4" />}
              disabled={!newMethod.trim()}
              onClick={() => {
                set({ paymentMethods: [...s.paymentMethods, { id: uid("pm_"), name: newMethod.trim(), isCash: false, active: true }] });
                setNewMethod("");
              }}
            >
              Add
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Categories & numbering" />
          <div className="space-y-4 p-4 sm:p-5">
            {(
              [
                ["Retail product categories", "retailCategories", newRetailCat, setNewRetailCat],
                ["Spare part categories", "partCategories", newPartCat, setNewPartCat],
              ] as const
            ).map(([label, key, val, setVal]) => (
              <div key={key}>
                <div className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {s[key].map((c) => (
                    <span key={c} className="rounded-full border border-line px-2.5 py-0.5 text-xs">
                      {c}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="New category" className="h-9" />
                  <Button
                    size="sm"
                    disabled={!val.trim() || s[key].includes(val.trim())}
                    onClick={() => {
                      set({ [key]: [...s[key], val.trim()] } as Partial<Settings>);
                      setVal("");
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-2">Document number prefixes</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(Object.keys(s.prefixes) as (keyof Settings["prefixes"])[]).map((k) => (
                  <Field key={k} label={k}>
                    <Input value={s.prefixes[k]} onChange={(e) => set({ prefixes: { ...s.prefixes, [k]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) } })} className="h-9 font-mono" />
                  </Field>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-3">Format: PREFIX-YYMM-sequence, e.g. {s.prefixes.receipt}-2611-00042. Numbers are never reused.</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Warranty rules" subtitle="Configured by Fixerlab. Sample rules are placeholders only." />
          <ul className="divide-y divide-line">
            {db.warrantyRules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span className="flex-1 font-medium">{r.name}</span>
                <span className="text-ink-3">{r.durationDays} days</span>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={r.active} onChange={(e) => run((d) => saveWarrantyRule(d, { ...r, active: e.target.checked }), "Rule updated")} /> Active
                </label>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 border-t border-line p-4 sm:grid-cols-[2fr_1fr_3fr_auto] sm:px-5">
            <Input placeholder="Rule name" value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} />
            <Input placeholder="Days" inputMode="numeric" value={rule.days} onChange={(e) => setRule({ ...rule, days: e.target.value.replace(/\D/g, "") })} />
            <Input placeholder="Terms" value={rule.terms} onChange={(e) => setRule({ ...rule, terms: e.target.value })} />
            <Button
              icon={<Plus className="size-4" />}
              disabled={!rule.name || !rule.days}
              onClick={() => {
                const r = run((d) => saveWarrantyRule(d, { name: rule.name, durationDays: parseInt(rule.days, 10), terms: rule.terms, active: true }), "Warranty rule added");
                if (r.ok) setRule({ name: "", days: "", terms: "" });
              }}
            >
              Add rule
            </Button>
          </div>
        </Card>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-end gap-3 border-t border-line bg-surface px-5 py-3 shadow-lg lg:left-64">
          <span className="text-sm text-ink-3">Unsaved changes{s.diagnosisFee !== db.settings.diagnosisFee ? ` · diagnosis fee ${money(s.diagnosisFee)}` : ""}</span>
          <Button onClick={() => setS(structuredClone(db.settings))}>Discard</Button>
          <Button variant="primary" icon={<Save className="size-4" />} onClick={() => run((d) => updateSettings(d, s), "Settings saved")}>
            Save settings
          </Button>
        </div>
      )}
    </div>
  );
}
