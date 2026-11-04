import { createSeed } from "../src/lib/seed";
import * as S from "../src/lib/services";
import { autoRunRepair, SCENARIO_B } from "../src/lib/demo";
import { dashboardStats } from "../src/lib/reports";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const tryRun = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return (e as Error).message; } };
const as = (db: any, id: string) => { db.currentUserId = id; };

function newJob(db: any, deposit = 0) {
  as(db, "st_cashier");
  return S.createRepairJob(db, {
    customer: { name: "Audit Test", phone: "012-555 0999" }, device: { category: "Smartphone", brand: "Apple", model: "iPhone 13" },
    accessories: [], condition: "", reportedProblem: "Screen", technicianId: "st_tech1", estCost: 0, internalNotes: "", photos: [],
    deposit: deposit ? { methodId: "pm_cash", amount: deposit } : undefined,
  });
}

// 1. Cancelling a job with a deposit must not leave the deposit "held" forever
{
  const db = createSeed(); const before = dashboardStats(db).depositsHeld;
  const j = newJob(db, 5000);
  as(db, "st_owner");
  const err = tryRun(() => S.changeStatus(db, j.id, "cancelled", "Customer changed mind"));
  const after = dashboardStats(db).depositsHeld;
  check("cancel with deposit: deposit is returned (not held)", !err && after === before, `held before=${before} after=${after} err=${err}`);
}
// 2. Technician can send own job back from QC (QC fail) — only QC *pass* needs another person
{
  const db = createSeed(); const j = newJob(db);
  as(db, "st_tech1"); S.changeStatus(db, j.id, "diagnosing");
  S.saveQuote(db, j.id, { lines: [{ id: "l1", type: "labour", description: "x", qty: 1, unitPrice: 1000 }], discount: 0 });
  S.sendQuote(db, S.latestQuote(db, j.id)!.id);
  as(db, "st_cashier"); S.recordQuoteDecision(db, S.latestQuote(db, j.id)!.id, { decision: "approved", channel: "phone", customerName: "A" });
  as(db, "st_tech1"); S.changeStatus(db, j.id, "in_progress"); S.changeStatus(db, j.id, "quality_check");
  const err = tryRun(() => S.changeStatus(db, j.id, "in_progress", "Found issue"));
  check("QC fail allowed for own technician", !err, String(err));
  const err2 = tryRun(() => { S.changeStatus(db, j.id, "quality_check"); S.changeStatus(db, j.id, "ready"); });
  check("QC pass blocked for own technician", !!err2);
}
// 3. Full refund of a repair invoice should void its warranty
{
  const db = createSeed(); autoRunRepair(db, SCENARIO_B);
  const j = db.jobs.find((x) => x.saleId && db.customers.find((c) => c.id === x.customerId)?.phone === SCENARIO_B.customer.phone)!;
  const sale = db.sales.find((s) => s.id === j.saleId)!;
  as(db, "st_owner");
  S.refundSale(db, { saleId: sale.id, lines: sale.lines.map((l) => ({ saleLineId: l.id, qty: l.qty, restock: false })), reason: "Full refund", methodId: "pm_cash" });
  const w = db.warranties.find((x) => x.jobId === j.id)!;
  check("full refund voids warranty", w.voided === true);
}
// 4. Refund with an invalid payment method must be rejected
{
  const db = createSeed(); const sale = db.sales[0]; as(db, "st_owner");
  const err = tryRun(() => S.refundSale(db, { saleId: sale.id, lines: [{ saleLineId: sale.lines[0].id, qty: 1, restock: false }], reason: "x", methodId: "pm_nonexistent" }));
  check("refund rejects invalid method", !!err);
}
// 5. Assigning a non-technician as technician must be rejected
{
  const db = createSeed(); const j = newJob(db); as(db, "st_owner");
  const err = tryRun(() => S.updateJob(db, j.id, { technicianId: "st_cashier" }));
  check("assigning cashier as technician rejected", !!err);
}
// 6. Recording a quote decision on a cancelled job must be rejected
{
  const db = createSeed(); const j = newJob(db);
  as(db, "st_tech1"); S.changeStatus(db, j.id, "diagnosing");
  S.saveQuote(db, j.id, { lines: [{ id: "l1", type: "labour", description: "x", qty: 1, unitPrice: 1000 }], discount: 0 });
  S.sendQuote(db, S.latestQuote(db, j.id)!.id);
  as(db, "st_owner"); S.changeStatus(db, j.id, "cancelled", "test");
  const err = tryRun(() => S.recordQuoteDecision(db, S.latestQuote(db, j.id)!.id, { decision: "approved", channel: "phone", customerName: "A" }));
  check("decision on cancelled job rejected", !!err);
}
// 7. Settings validation: empty prefix / duplicate prefixes / negative fee
{
  const db = createSeed(); as(db, "st_owner");
  check("empty receipt prefix rejected", !!tryRun(() => S.updateSettings(db, { prefixes: { ...db.settings.prefixes, receipt: "" } })));
  check("duplicate prefixes rejected", !!tryRun(() => S.updateSettings(db, { prefixes: { ...db.settings.prefixes, job: "RCP" } })));
  check("negative diagnosis fee rejected", !!tryRun(() => S.updateSettings(db, { diagnosisFee: -100 })));
}
// 8. Retail off: low-stock count should only include spare parts
{
  const db = createSeed(); as(db, "st_owner");
  db.items.push({ id: "it_x", type: "retail", sku: "X", name: "X", category: "Accessories", cost: 0, price: 0, stock: 0, minStock: 5, allowNegative: false, active: true });
  check("low-stock excludes hidden retail items", !dashboardStats(db).lowStock.some((i) => i.type === "retail"));
}
// 9. Regression: permissions still enforced
{
  const db = createSeed(); const j = newJob(db);
  as(db, "st_tech2");
  check("tech cannot touch another tech's job", !!tryRun(() => S.changeStatus(db, j.id, "diagnosing")));
  as(db, "st_cashier");
  check("cashier cannot cancel job", !!tryRun(() => S.changeStatus(db, j.id, "cancelled", "x")));
  check("cashier cannot adjust stock", !!tryRun(() => S.adjustStock(db, "it_P-SCR-IP13", 5, "receive", "x")));
  check("cashier refund needs PIN", !!tryRun(() => S.refundSale(db, { saleId: db.sales[0].id, lines: [{ saleLineId: db.sales[0].lines[0].id, qty: 1, restock: false }], reason: "x", methodId: "pm_cash" })));
}
// 10. Stock ledger reconciles for every item
{
  const db = createSeed(); autoRunRepair(db, SCENARIO_B);
  const bad = db.items.filter((it) => db.movements.filter((m) => m.itemId === it.id).reduce((a, m) => a + m.qty, 0) !== it.stock);
  check("stock ledger reconciles", bad.length === 0, bad.map((b) => b.sku).join(","));
  const nos = db.sales.map((s) => s.receiptNo); check("receipt numbers unique", new Set(nos).size === nos.length);
  const jn = db.jobs.map((s) => s.jobNo); check("job numbers unique", new Set(jn).size === jn.length);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
