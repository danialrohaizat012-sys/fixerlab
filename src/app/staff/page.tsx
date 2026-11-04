"use client";

import { Check, Minus } from "lucide-react";
import { useStore } from "@/lib/store";
import { can, PERMISSION_LABEL, ROLE_LABEL, ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { saveStaff } from "@/lib/services";
import { fmtDateTime } from "@/lib/format";
import type { Role } from "@/lib/types";
import { Badge, Card, CardHeader, Denied, Input, Notice, PageHeader, Select, Table, td, th } from "@/components/ui";

export default function StaffPage() {
  const { db, me, run } = useStore();
  if (!can(me.role, "staff.manage")) return <Denied what="manage staff" />;
  const roles: Role[] = ["owner", "cashier", "technician"];
  const perms = Object.keys(PERMISSION_LABEL) as Permission[];
  return (
    <div className="space-y-5">
      <PageHeader title="Staff & Roles" subtitle="Role-based permissions. Every action is checked by the service layer, not only hidden in the UI." />
      <Notice tone="demo">
        Demo PINs (for owner overrides and role testing): Aiman 1234 · Sofia 2222 · Haziq 3333 · Mei Ling 4444. In production, staff sign in with Supabase Auth (owner MFA) and PINs are stored hashed.
      </Notice>
      <Card>
        <CardHeader title="Staff accounts" />
        <Table>
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Role</th>
              <th className={th}>Discount limit</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {db.staff.map((s) => (
              <tr key={s.id}>
                <td className={td}>
                  <span className="font-medium">{s.name}</span> {s.id === me.id && <Badge tone="blue">You</Badge>}
                </td>
                <td className={td}>
                  <Select value={s.role} className="h-9 w-44" onChange={(e) => run((d) => saveStaff(d, { id: s.id, role: e.target.value as Role }), "Role updated")}>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className={td}>
                  <span className="inline-flex items-center gap-1.5">
                    <Input
                      className="num h-9 w-20 text-right"
                      inputMode="numeric"
                      defaultValue={s.discountLimitPct}
                      disabled={s.role !== "cashier"}
                      onBlur={(e) => {
                        const v = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                        if (v !== s.discountLimitPct) run((d) => saveStaff(d, { id: s.id, discountLimitPct: v }), "Discount limit updated");
                      }}
                    />
                    %
                  </span>
                </td>
                <td className={td}>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={s.active} onChange={(e) => run((d) => saveStaff(d, { id: s.id, active: e.target.checked }), e.target.checked ? "Staff activated" : "Staff deactivated")} />
                    {s.active ? "Active" : "Deactivated"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Inviting new staff (email sign-in) is part of the production phase with Supabase Authentication.</p>
      </Card>
      <Card>
        <CardHeader title="Permission matrix" />
        <Table>
          <thead>
            <tr>
              <th className={th}>Permission</th>
              {roles.map((r) => (
                <th key={r} className={`${th} text-center`}>
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p}>
                <td className={td}>{PERMISSION_LABEL[p]}</td>
                {roles.map((r) => (
                  <td key={r} className={`${td} text-center`}>
                    {ROLE_PERMISSIONS[r].includes(p) ? <Check className="mx-auto size-4 text-green-600" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-ink-3" aria-label="Not allowed" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Technicians see only jobs assigned to them and cannot view cost prices, customer lists or financial data.</p>
      </Card>
      <Card>
        <CardHeader title="Audit log" subtitle="Sensitive actions: overrides, refunds, price and stock changes, settings, staff changes, deposit returns." />
        <ul className="divide-y divide-line">
          {db.audit.slice(0, 100).map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm sm:px-5">
              <span className="w-40 shrink-0 text-xs text-ink-3">{fmtDateTime(a.at)}</span>
              <span className="w-24 shrink-0 font-medium">{db.staff.find((s) => s.id === a.actorId)?.name}</span>
              <span className="font-mono text-xs text-ink-3">{a.action}</span>
              <span className="min-w-0 flex-1 text-ink-2">{a.detail}</span>
            </li>
          ))}
          {!db.audit.length && <li className="px-5 py-8 text-center text-sm text-ink-3">No audited actions yet in this demo session.</li>}
        </ul>
      </Card>
    </div>
  );
}
