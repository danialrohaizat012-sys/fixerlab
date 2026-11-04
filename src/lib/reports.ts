import type { DbState } from "./types";
import { myDateKey } from "./format";
import { OPEN_STATUSES } from "./repair-meta";
import { heldDeposits, jobFinancials, saleBalance } from "./services";

/**
 * Revenue rules (avoid double counting):
 *  - Revenue is recognised from completed sales (retail + repair invoices) on the sale date.
 *  - Repair deposits are NOT revenue until the repair invoice is issued at collection.
 *  - Refunds reduce revenue on the refund date.
 */
export function revenueBetween(db: DbState, fromKey: string, toKey: string) {
  let retail = 0,
    repair = 0,
    refunds = 0,
    cogs = 0,
    count = 0;
  for (const s of db.sales) {
    const k = myDateKey(s.at);
    if (k < fromKey || k > toKey) continue;
    count++;
    if (s.kind === "retail") retail += s.total;
    else repair += s.total;
    cogs += s.cogs;
  }
  for (const r of db.refunds) {
    const k = myDateKey(r.at);
    if (k >= fromKey && k <= toKey) refunds += r.amount;
  }
  return { retail, repair, refunds, net: retail + repair - refunds, cogs, count };
}

export function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(myDateKey(new Date(now - i * 86_400_000)));
  return out;
}

export function dailySeries(db: DbState, days: number) {
  const keys = lastNDays(days);
  const map = new Map(keys.map((k) => [k, { key: k, retail: 0, repair: 0, refunds: 0, count: 0 }]));
  for (const s of db.sales) {
    const row = map.get(myDateKey(s.at));
    if (!row) continue;
    row.count++;
    if (s.kind === "retail") row.retail += s.total;
    else row.repair += s.total;
  }
  for (const r of db.refunds) {
    const row = map.get(myDateKey(r.at));
    if (row) row.refunds += r.amount;
  }
  return keys.map((k) => map.get(k)!);
}

export function paymentsByMethod(db: DbState, fromKey: string, toKey: string) {
  const res = new Map<string, number>();
  for (const p of db.payments) {
    const k = myDateKey(p.at);
    if (k < fromKey || k > toKey) continue;
    const v = p.kind === "refund" ? -p.amount : p.amount;
    res.set(p.methodId, (res.get(p.methodId) ?? 0) + v);
  }
  return db.settings.paymentMethods.map((m) => ({ id: m.id, name: m.name, amount: res.get(m.id) ?? 0 }));
}

export function dashboardStats(db: DbState) {
  const today = myDateKey(new Date());
  const monthStart = today.slice(0, 8) + "01";
  const t = revenueBetween(db, today, today);
  const m = revenueBetween(db, monthStart, today);
  const active = db.jobs.filter((j) => OPEN_STATUSES.includes(j.status) && j.status !== "ready");
  const pendingApproval = db.jobs.filter((j) => j.status === "awaiting_approval");
  const ready = db.jobs.filter((j) => j.status === "ready");
  const lowStock = db.items.filter((i) => i.active && (i.type === "part" || db.settings.retailEnabled) && i.stock <= i.minStock);
  const outstandingSales = db.sales.map((s) => ({ s, bal: saleBalance(db, s) })).filter((x) => x.bal > 0);
  const readyBalances = ready.map((j) => ({ j, bal: jobFinancials(db, j).balance })).filter((x) => x.bal > 0);
  const outstanding = outstandingSales.reduce((a, x) => a + x.bal, 0) + readyBalances.reduce((a, x) => a + x.bal, 0);
  const depositsHeld = db.jobs.reduce((a, j) => a + Math.max(0, heldDeposits(db, j.id)), 0);
  return { today: t, month: m, active, pendingApproval, ready, lowStock, outstanding, outstandingSales, readyBalances, depositsHeld };
}
