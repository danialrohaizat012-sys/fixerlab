/**
 * Service layer — the prototype's stand-in for the Supabase RPC functions described in
 * docs/PHASE-1-PLAN.md. Every function:
 *   - receives a *draft* copy of the database (committed only if the function returns),
 *   - checks the acting user's permissions itself (UI hiding is never the only guard),
 *   - performs all related writes together, so a failure leaves nothing half-written.
 * In production each function becomes a Postgres function executed in one transaction.
 */
import type {
  ApprovalChannel,
  DbState,
  Item,
  MovementReason,
  Payment,
  Quotation,
  QuoteLine,
  RepairJob,
  RepairStatus,
  Sale,
  SaleLine,
  Settings,
  Staff,
  Customer,
  Device,
  WarrantyRule,
} from "./types";
import { can, type Permission } from "./permissions";
import { TRANSITIONS } from "./repair-meta";
import { addDays, money, myPeriod, uid } from "./format";

export class ServiceError extends Error {}

const now = () => new Date().toISOString();

// ───────────────────────────── helpers ─────────────────────────────

export function actor(db: DbState): Staff {
  const s = db.staff.find((x) => x.id === db.currentUserId);
  if (!s || !s.active) throw new ServiceError("No active staff session.");
  return s;
}

function requirePerm(db: DbState, p: Permission): Staff {
  const a = actor(db);
  if (!can(a.role, p)) throw new ServiceError(`Permission denied: your role (${a.role}) cannot perform this action.`);
  return a;
}

/** Verify a supervisor PIN; returns the authorising staff member. */
function verifyOverride(db: DbState, pin: string | undefined, p: Permission): Staff {
  const a = actor(db);
  if (can(a.role, p)) return a;
  if (!pin) throw new ServiceError("Owner authorisation PIN required.");
  const auth = db.staff.find((s) => s.active && s.pin === pin && can(s.role, p));
  if (!auth) throw new ServiceError("Invalid authorisation PIN.");
  return auth;
}

function nextNo(db: DbState, prefix: string, digits: number, at = now()): string {
  const key = `${prefix}-${myPeriod(at)}`;
  const n = (db.sequences[key] ?? 0) + 1;
  db.sequences[key] = n;
  return `${key}-${String(n).padStart(digits, "0")}`;
}

function audit(db: DbState, action: string, detail: string) {
  db.audit.unshift({ id: uid("au_"), actorId: db.currentUserId, action, detail, at: now() });
}

function getItem(db: DbState, id: string): Item {
  const it = db.items.find((i) => i.id === id);
  if (!it) throw new ServiceError("Item not found.");
  return it;
}

function moveStock(db: DbState, itemId: string, qty: number, reason: MovementReason, refNo?: string, note?: string) {
  const it = getItem(db, itemId);
  const after = it.stock + qty;
  if (after < 0 && !it.allowNegative) {
    throw new ServiceError(`Insufficient stock for ${it.name} (${it.stock} available).`);
  }
  it.stock = after;
  const m = { id: uid("mv_"), itemId, qty, balanceAfter: after, reason, refNo, actorId: db.currentUserId, note, at: now() };
  db.movements.unshift(m);
  return m;
}

function getJob(db: DbState, id: string): RepairJob {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) throw new ServiceError("Repair job not found.");
  return j;
}

/** Technicians may only touch jobs assigned to them. */
function requireJobAccess(db: DbState, job: RepairJob): Staff {
  const a = actor(db);
  if (can(a.role, "repair.view.all")) return a;
  if (a.role === "technician" && job.technicianId === a.id) return a;
  throw new ServiceError("Permission denied: this job is not assigned to you.");
}

export function canViewJob(staff: Staff | undefined, job: RepairJob): boolean {
  if (!staff) return false;
  return can(staff.role, "repair.view.all") || (staff.role === "technician" && job.technicianId === staff.id);
}

const SECRET_PATTERN = /\b(pass\s?code|password|passwd|pin|pattern lock|apple id pw)\b\s*[:=]/i;
function guardSecrets(...texts: (string | undefined)[]) {
  for (const t of texts) {
    if (t && SECRET_PATTERN.test(t)) {
      throw new ServiceError("Do not record device passcodes, PINs or account passwords. Remove it and try again.");
    }
  }
}

function setStatus(db: DbState, job: RepairJob, to: RepairStatus, note?: string) {
  db.statusEvents.unshift({ id: uid("se_"), jobId: job.id, from: job.status, to, actorId: db.currentUserId, note, at: now() });
  job.status = to;
  job.updatedAt = now();
}

// ───────────────────────────── calculations ─────────────────────────────

export function calcTotals(subtotal: number, discount: number, settings: Settings) {
  const d = Math.max(0, Math.min(discount, subtotal));
  const taxable = subtotal - d;
  const tax = settings.taxEnabled ? Math.round((taxable * settings.taxRatePct) / 100) : 0;
  return { subtotal, discount: d, tax, total: taxable + tax };
}

export function quoteTotals(q: Pick<Quotation, "lines" | "discount">, settings: Settings) {
  const subtotal = q.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  return calcTotals(subtotal, q.discount, settings);
}

export function jobQuotes(db: DbState, jobId: string) {
  return db.quotations.filter((q) => q.jobId === jobId).sort((a, b) => b.version - a.version);
}

export function latestQuote(db: DbState, jobId: string): Quotation | undefined {
  return jobQuotes(db, jobId)[0];
}

export function approvedQuote(db: DbState, jobId: string): Quotation | undefined {
  return jobQuotes(db, jobId).find((q) => q.status === "approved");
}

export function salePaid(db: DbState, saleId: string): number {
  return db.payments
    .filter((p) => p.saleId === saleId)
    .reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
}

export function saleRefunded(db: DbState, saleId: string): number {
  return db.refunds.filter((r) => r.saleId === saleId).reduce((s, r) => s + r.amount, 0);
}

/** Outstanding = (invoice total − refunded value) − (payments in − payouts). */
export function saleBalance(db: DbState, sale: Sale): number {
  return sale.total - saleRefunded(db, sale.id) - salePaid(db, sale.id);
}

export type PaymentStatus = "unpaid" | "deposit" | "partial" | "paid" | "no_charge";

export function jobFinancials(db: DbState, job: RepairJob) {
  const aq = approvedQuote(db, job.id);
  const quoteTotal = aq ? quoteTotals(aq, db.settings).total : 0;
  const deposits = db.payments
    .filter((p) => p.repairJobId === job.id && p.kind === "deposit")
    .reduce((s, p) => s + p.amount, 0);
  const sale = job.saleId ? db.sales.find((s) => s.id === job.saleId) : undefined;
  let status: PaymentStatus;
  let balance: number;
  if (sale) {
    balance = saleBalance(db, sale);
    status = balance <= 0 ? "paid" : "partial";
  } else if (job.status === "completed") {
    balance = 0;
    status = "no_charge";
  } else {
    const expected = aq ? quoteTotal : 0;
    balance = Math.max(0, expected - deposits);
    status = deposits > 0 ? "deposit" : "unpaid";
  }
  const partsCost = db.repairParts
    .filter((p) => p.jobId === job.id && !p.reversed)
    .reduce((s, p) => s + p.unitCost * p.qty, 0);
  return { approved: aq, quoteTotal, deposits, sale, balance, status, partsCost };
}

// ───────────────────────────── POS ─────────────────────────────

export interface PaymentInput {
  methodId: string;
  amount: number;
  tendered?: number;
  reference?: string;
}

function validatePayments(db: DbState, payments: PaymentInput[]) {
  for (const p of payments) {
    const m = db.settings.paymentMethods.find((x) => x.id === p.methodId && x.active);
    if (!m) throw new ServiceError("Invalid or inactive payment method.");
    if (!Number.isInteger(p.amount) || p.amount <= 0) throw new ServiceError("Payment amount must be greater than zero.");
    if (m.isCash && p.tendered !== undefined && p.tendered < p.amount) {
      throw new ServiceError("Cash tendered is less than the amount due.");
    }
  }
}

function writePayments(db: DbState, payments: PaymentInput[], link: { saleId?: string; repairJobId?: string }, kind: Payment["kind"]) {
  for (const p of payments) {
    db.payments.unshift({
      id: uid("py_"),
      ...link,
      kind,
      methodId: p.methodId,
      amount: p.amount,
      tendered: p.tendered,
      reference: p.reference?.trim() || undefined,
      receivedBy: db.currentUserId,
      at: now(),
    });
  }
}

export interface CompleteSaleInput {
  idempotencyKey: string;
  lines: { itemId: string; qty: number }[];
  discount: number;
  overridePin?: string;
  customerId?: string;
  payments: PaymentInput[];
}

export function completeSale(db: DbState, input: CompleteSaleInput): Sale {
  const a = requirePerm(db, "pos.sell");
  const prior = db.processedKeys[input.idempotencyKey];
  if (prior) return db.sales.find((s) => s.id === prior)!; // duplicate submission → original sale
  if (!db.settings.retailEnabled) throw new ServiceError("Retail sales are switched off for this business (Settings → Retail sales).");

  if (!input.lines.length) throw new ServiceError("Cart is empty.");
  const lines: SaleLine[] = input.lines.map((l) => {
    const it = getItem(db, l.itemId);
    if (!it.active) throw new ServiceError(`${it.name} is inactive.`);
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw new ServiceError("Invalid quantity.");
    // Prices come from the item master, never from the client.
    return {
      id: uid("sl_"),
      type: it.type === "part" ? "part" : "product",
      itemId: it.id,
      description: it.name,
      qty: l.qty,
      unitPrice: it.price,
      unitCost: it.cost,
      refundedQty: 0,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  if (input.discount < 0 || input.discount > subtotal) throw new ServiceError("Invalid discount.");
  let discountAuthorizedBy: string | undefined;
  if (input.discount > 0) {
    const pct = (input.discount / subtotal) * 100;
    if (pct > a.discountLimitPct + 1e-9) {
      discountAuthorizedBy = verifyOverride(db, input.overridePin, "pos.discount.override").id;
    } else {
      discountAuthorizedBy = a.id;
    }
  }
  const t = calcTotals(subtotal, input.discount, db.settings);
  validatePayments(db, input.payments);
  const paid = input.payments.reduce((s, p) => s + p.amount, 0);
  if (paid !== t.total) throw new ServiceError(`Payments (${money(paid)}) must equal the total (${money(t.total)}).`);

  const at = now();
  const receiptNo = nextNo(db, db.settings.prefixes.receipt, 5, at);
  for (const l of lines) moveStock(db, l.itemId!, -l.qty, "sale", receiptNo);
  const sale: Sale = {
    id: uid("sa_"),
    receiptNo,
    kind: "retail",
    customerId: input.customerId,
    cashierId: a.id,
    lines,
    ...t,
    discountAuthorizedBy,
    cogs: lines.reduce((s, l) => s + l.unitCost * l.qty, 0),
    status: "completed",
    idempotencyKey: input.idempotencyKey,
    at,
  };
  db.sales.unshift(sale);
  writePayments(db, input.payments, { saleId: sale.id }, "payment");
  db.processedKeys[input.idempotencyKey] = sale.id;
  if (discountAuthorizedBy && discountAuthorizedBy !== a.id) {
    audit(db, "discount.override", `${receiptNo}: discount ${money(t.discount)} authorised by ${db.staff.find((s) => s.id === discountAuthorizedBy)?.name}`);
  }
  return sale;
}

export function receiveSalePayment(db: DbState, saleId: string, payments: PaymentInput[]) {
  requirePerm(db, "payment.receive");
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) throw new ServiceError("Sale not found.");
  validatePayments(db, payments);
  const bal = saleBalance(db, sale);
  const amt = payments.reduce((s, p) => s + p.amount, 0);
  if (amt > bal) throw new ServiceError(`Amount exceeds outstanding balance (${money(bal)}).`);
  writePayments(db, payments, { saleId, repairJobId: sale.repairJobId }, "payment");
  audit(db, "payment.balance", `${sale.receiptNo}: received ${money(amt)}`);
}

export interface RefundInput {
  saleId: string;
  lines: { saleLineId: string; qty: number; restock: boolean }[];
  reason: string;
  methodId: string;
  overridePin?: string;
}

export function refundSale(db: DbState, input: RefundInput) {
  const a = actor(db);
  if (!can(a.role, "pos.sell") && !can(a.role, "sales.refund")) throw new ServiceError("Permission denied.");
  const auth = verifyOverride(db, input.overridePin, "sales.refund");
  if (!input.reason.trim()) throw new ServiceError("A refund reason is required.");
  const sale = db.sales.find((s) => s.id === input.saleId);
  if (!sale) throw new ServiceError("Sale not found.");
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new ServiceError("Select at least one item to refund.");

  let amount = 0;
  const refundLines = lines.map((rl) => {
    const sl = sale.lines.find((l) => l.id === rl.saleLineId);
    if (!sl) throw new ServiceError("Invalid sale line.");
    if (rl.qty > sl.qty - sl.refundedQty) throw new ServiceError(`Cannot refund more than sold for ${sl.description}.`);
    const gross = sl.unitPrice * rl.qty;
    const discShare = sale.subtotal ? Math.round((sale.discount * gross) / sale.subtotal) : 0;
    const taxShare = sale.subtotal - sale.discount ? Math.round((sale.tax * (gross - discShare)) / (sale.subtotal - sale.discount)) : 0;
    const amt = gross - discShare + taxShare;
    amount += amt;
    return { sl, rl, amt };
  });
  const netPaid = salePaid(db, sale.id);
  if (amount > netPaid) throw new ServiceError(`Refund ${money(amount)} exceeds amount paid (${money(netPaid)}).`);

  const refundNo = nextNo(db, db.settings.prefixes.refund, 4);
  for (const { sl, rl } of refundLines) {
    sl.refundedQty += rl.qty;
    if (rl.restock && sl.itemId && (sl.type === "product" || sl.type === "part")) {
      moveStock(db, sl.itemId, rl.qty, "refund_restock", refundNo);
    }
  }
  db.refunds.unshift({
    id: uid("rf_"),
    refundNo,
    saleId: sale.id,
    authorizedBy: auth.id,
    performedBy: a.id,
    reason: input.reason.trim(),
    amount,
    methodId: input.methodId,
    lines: refundLines.map(({ rl, amt }) => ({ saleLineId: rl.saleLineId, qty: rl.qty, amount: amt, restock: rl.restock })),
    at: now(),
  });
  writePayments(db, [{ methodId: input.methodId, amount }], { saleId: sale.id }, "refund");
  const allRefunded = sale.lines.every((l) => l.refundedQty >= l.qty);
  sale.status = allRefunded ? "refunded" : "partially_refunded";
  audit(db, "sale.refund", `${refundNo} on ${sale.receiptNo}: ${money(amount)} — authorised by ${auth.name}. Reason: ${input.reason}`);
  return refundNo;
}

// ───────────────────────────── Repairs ─────────────────────────────

export interface NewJobInput {
  customer: { id?: string; name: string; phone: string; email?: string };
  device: { id?: string; category: Device["category"]; brand: string; model: string; serial?: string; color?: string };
  accessories: string[];
  condition: string;
  reportedProblem: string;
  diagnosis?: string;
  technicianId?: string;
  estCost: number;
  estCompletion?: string;
  internalNotes: string;
  photos: { dataUrl: string; caption: string }[];
  deposit?: PaymentInput;
}

export function normalisePhone(p: string): string {
  return p.replace(/[^0-9+]/g, "");
}

export function createRepairJob(db: DbState, input: NewJobInput): RepairJob {
  const a = requirePerm(db, "repair.create");
  if (!input.customer.name.trim() || !input.customer.phone.trim()) throw new ServiceError("Customer name and phone are required.");
  if (!input.device.brand.trim() || !input.device.model.trim()) throw new ServiceError("Device brand and model are required.");
  if (!input.reportedProblem.trim()) throw new ServiceError("Reported problem is required.");
  guardSecrets(input.condition, input.reportedProblem, input.internalNotes, input.diagnosis);
  if (input.technicianId) {
    const t = db.staff.find((s) => s.id === input.technicianId);
    if (!t || t.role !== "technician" || !t.active) throw new ServiceError("Invalid technician.");
  }

  let customer: Customer | undefined = input.customer.id ? db.customers.find((c) => c.id === input.customer.id) : undefined;
  if (!customer) {
    const phone = normalisePhone(input.customer.phone);
    customer = db.customers.find((c) => normalisePhone(c.phone) === phone);
  }
  if (!customer) {
    customer = {
      id: uid("cu_"),
      name: input.customer.name.trim(),
      phone: input.customer.phone.trim(),
      email: input.customer.email?.trim() || undefined,
      createdAt: now(),
    };
    db.customers.unshift(customer);
  }
  let device: Device | undefined = input.device.id ? db.devices.find((d) => d.id === input.device.id && d.customerId === customer!.id) : undefined;
  if (!device) {
    device = { id: uid("dv_"), customerId: customer.id, ...input.device, serial: input.device.serial?.trim() || undefined };
    db.devices.unshift(device);
  }
  const at = now();
  const job: RepairJob = {
    id: uid("jb_"),
    jobNo: nextNo(db, db.settings.prefixes.job, 4, at),
    customerId: customer.id,
    deviceId: device.id,
    status: "received",
    accessories: input.accessories,
    condition: input.condition.trim(),
    reportedProblem: input.reportedProblem.trim(),
    diagnosis: input.diagnosis?.trim() ?? "",
    technicianId: input.technicianId || undefined,
    estCost: input.estCost,
    estCompletion: input.estCompletion,
    internalNotes: input.internalNotes.trim(),
    photos: input.photos.map((p) => ({ id: uid("ph_"), ...p, at })),
    createdBy: a.id,
    createdAt: at,
    updatedAt: at,
  };
  db.jobs.unshift(job);
  db.statusEvents.unshift({ id: uid("se_"), jobId: job.id, to: "received", actorId: a.id, note: "Device received at counter", at });
  if (input.deposit && input.deposit.amount > 0) {
    requirePerm(db, "payment.receive");
    validatePayments(db, [input.deposit]);
    writePayments(db, [input.deposit], { repairJobId: job.id }, "deposit");
  }
  return job;
}

export function updateJob(
  db: DbState,
  jobId: string,
  patch: Partial<Pick<RepairJob, "diagnosis" | "internalNotes" | "technicianId" | "estCost" | "estCompletion">>,
) {
  const job = getJob(db, jobId);
  const a = requireJobAccess(db, job);
  if (["completed", "cancelled"].includes(job.status)) throw new ServiceError("Job is closed.");
  if (patch.diagnosis !== undefined && !can(a.role, "repair.diagnose")) throw new ServiceError("Permission denied: diagnosis.");
  if (patch.technicianId !== undefined && !can(a.role, "repair.assign")) throw new ServiceError("Permission denied: assigning technicians.");
  if ((patch.estCost !== undefined || patch.estCompletion !== undefined) && !can(a.role, "repair.diagnose") && !can(a.role, "repair.create")) {
    throw new ServiceError("Permission denied.");
  }
  guardSecrets(patch.diagnosis, patch.internalNotes);
  if (patch.technicianId !== undefined && patch.technicianId !== job.technicianId) {
    const t = db.staff.find((s) => s.id === patch.technicianId);
    db.statusEvents.unshift({
      id: uid("se_"),
      jobId,
      to: job.status,
      from: job.status,
      actorId: a.id,
      note: `Assigned to ${t?.name ?? "—"}`,
      at: now(),
    });
  }
  Object.assign(job, patch, { updatedAt: now() });
}

export function addJobPhoto(db: DbState, jobId: string, dataUrl: string, caption: string) {
  const job = getJob(db, jobId);
  requireJobAccess(db, job);
  if (job.photos.length >= 6) throw new ServiceError("Maximum 6 photos per job in the prototype.");
  job.photos.push({ id: uid("ph_"), dataUrl, caption, at: now() });
}

export function changeStatus(db: DbState, jobId: string, to: RepairStatus, note?: string) {
  const job = getJob(db, jobId);
  const a = requireJobAccess(db, job);
  const rule = TRANSITIONS[job.status].find((t) => t.to === to);
  if (!rule) throw new ServiceError(`Cannot move from ${job.status} to ${to}.`);
  if (!rule.roles.includes(a.role)) throw new ServiceError("Permission denied for this status change.");
  const lq = latestQuote(db, job.id);
  if (to === "awaiting_approval" && (!lq || (lq.status !== "sent" && lq.status !== "draft"))) {
    throw new ServiceError("Create a quotation first — it will be sent to the customer for approval.");
  }
  if (to === "awaiting_approval" && lq && lq.status === "draft") {
    lq.status = "sent";
    lq.sentAt = now();
  }
  if (job.status === "awaiting_approval" && (to === "waiting_parts" || to === "in_progress")) {
    if (!lq || lq.status !== "approved") throw new ServiceError("The latest quotation has no recorded customer approval.");
  }
  if (job.status === "awaiting_approval" && to === "ready") {
    if (!lq || lq.status !== "rejected") throw new ServiceError("Only possible after the customer rejects the quotation.");
  }
  if (job.status === "quality_check" && db.settings.qcRequiresDifferentPerson && job.technicianId === a.id) {
    throw new ServiceError("Quality check must be done by someone other than the repairing technician.");
  }
  if (to === "cancelled" && !note?.trim()) throw new ServiceError("A reason is required to cancel a job.");
  guardSecrets(note);
  setStatus(db, job, to, note?.trim() || rule.label);
}

// ───────────────────────────── Quotations ─────────────────────────────

export function saveQuote(db: DbState, jobId: string, data: { quoteId?: string; lines: QuoteLine[]; discount: number }): Quotation {
  const job = getJob(db, jobId);
  const a = requireJobAccess(db, job);
  if (!can(a.role, "quote.create")) throw new ServiceError("Permission denied: quotations.");
  if (["completed", "cancelled"].includes(job.status)) throw new ServiceError("Job is closed.");
  if (!data.lines.length) throw new ServiceError("Add at least one quotation line.");
  for (const l of data.lines) {
    if (!l.description.trim() || l.qty <= 0 || l.unitPrice < 0) throw new ServiceError("Each line needs a description, quantity and price.");
  }
  const subtotal = data.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  if (data.discount < 0 || data.discount > subtotal) throw new ServiceError("Invalid discount.");
  if (data.quoteId) {
    const q = db.quotations.find((x) => x.id === data.quoteId);
    if (!q || q.status !== "draft") throw new ServiceError("Only draft quotations can be edited. Create a new version instead.");
    q.lines = data.lines;
    q.discount = data.discount;
    return q;
  }
  const prev = jobQuotes(db, jobId);
  for (const p of prev) if (p.status === "draft" || p.status === "sent") p.status = "expired";
  const version = (prev[0]?.version ?? 0) + 1;
  const base = prev.find((p) => p.version === 1)?.quoteNo;
  const at = now();
  const q: Quotation = {
    id: uid("qt_"),
    quoteNo: base ? `${base.replace(/-v\d+$/, "")}-v${version}` : nextNo(db, db.settings.prefixes.quote, 4, at),
    jobId,
    version,
    status: "draft",
    lines: data.lines,
    discount: data.discount,
    validUntil: addDays(at, db.settings.quoteValidityDays),
    createdBy: a.id,
    createdAt: at,
  };
  db.quotations.push(q);
  return q;
}

export function sendQuote(db: DbState, quoteId: string) {
  const q = db.quotations.find((x) => x.id === quoteId);
  if (!q) throw new ServiceError("Quotation not found.");
  const job = getJob(db, q.jobId);
  const a = requireJobAccess(db, job);
  if (!can(a.role, "quote.create")) throw new ServiceError("Permission denied.");
  if (q.status !== "draft") throw new ServiceError("Only draft quotations can be sent.");
  q.status = "sent";
  q.sentAt = now();
  q.validUntil = addDays(q.sentAt, db.settings.quoteValidityDays);
  if (job.status === "diagnosing" || job.status === "in_progress") {
    setStatus(db, job, "awaiting_approval", `Quotation ${q.quoteNo} sent to customer`);
  }
}

export function recordQuoteDecision(
  db: DbState,
  quoteId: string,
  input: { decision: "approved" | "rejected"; channel: ApprovalChannel; customerName: string },
) {
  const a = requirePerm(db, "quote.decide");
  const q = db.quotations.find((x) => x.id === quoteId);
  if (!q) throw new ServiceError("Quotation not found.");
  if (q.status !== "sent") throw new ServiceError("Only a sent quotation can be approved or rejected.");
  if (new Date(q.validUntil).getTime() < Date.now()) {
    q.status = "expired";
    throw new ServiceError("This quotation has expired. Create a new version.");
  }
  if (!input.customerName.trim()) throw new ServiceError("Record who gave the decision.");
  db.decisions.push({ id: uid("qd_"), quoteId, ...input, customerName: input.customerName.trim(), recordedBy: a.id, at: now() });
  q.status = input.decision;
  const job = getJob(db, q.jobId);
  const label = input.channel === "simulated_demo" ? "SIMULATED (demo)" : input.channel.replace("_", " ");
  db.statusEvents.unshift({
    id: uid("se_"),
    jobId: job.id,
    from: job.status,
    to: job.status,
    actorId: a.id,
    note: `Quotation ${q.quoteNo} ${input.decision} by ${input.customerName} via ${label}`,
    at: now(),
  });
}

// ───────────────────────────── Parts ─────────────────────────────

export function useRepairPart(db: DbState, jobId: string, itemId: string, qty: number) {
  const job = getJob(db, jobId);
  const a = requireJobAccess(db, job);
  if (!can(a.role, "repair.parts")) throw new ServiceError("Permission denied: recording parts.");
  if (!["in_progress", "quality_check", "waiting_parts"].includes(job.status)) {
    throw new ServiceError("Parts can be recorded only while the repair is approved and in progress.");
  }
  const it = getItem(db, itemId);
  if (it.type !== "part") throw new ServiceError("Only spare parts can be used in repairs.");
  if (!Number.isInteger(qty) || qty <= 0) throw new ServiceError("Invalid quantity.");
  const mv = moveStock(db, itemId, -qty, "repair_use", job.jobNo);
  db.repairParts.push({ id: uid("rp_"), jobId, itemId, qty, unitCost: it.cost, movementId: mv.id, reversed: false, actorId: a.id, at: now() });
}

export function returnRepairPart(db: DbState, repairPartId: string) {
  const rp = db.repairParts.find((p) => p.id === repairPartId);
  if (!rp || rp.reversed) throw new ServiceError("Part record not found.");
  const job = getJob(db, rp.jobId);
  const a = requireJobAccess(db, job);
  if (!can(a.role, "repair.parts")) throw new ServiceError("Permission denied.");
  if (job.status === "completed") throw new ServiceError("Job is completed.");
  moveStock(db, rp.itemId, rp.qty, "repair_return", job.jobNo, "Recorded in error / unused");
  rp.reversed = true;
}

// ───────────────────────────── Payments & collection ─────────────────────────────

export function recordDeposit(db: DbState, jobId: string, p: PaymentInput) {
  requirePerm(db, "payment.receive");
  const job = getJob(db, jobId);
  if (["completed", "cancelled"].includes(job.status)) throw new ServiceError("Job is closed.");
  validatePayments(db, [p]);
  writePayments(db, [p], { repairJobId: jobId }, "deposit");
  db.statusEvents.unshift({ id: uid("se_"), jobId, from: job.status, to: job.status, actorId: db.currentUserId, note: `Deposit received ${money(p.amount)}`, at: now() });
}

export function collectionInvoice(db: DbState, job: RepairJob) {
  const aq = approvedQuote(db, job.id);
  let lines: SaleLine[] = [];
  let discount = 0;
  if (aq && job.status === "ready" && !jobWasReturnedUnrepaired(db, job)) {
    lines = aq.lines.map((l) => ({
      id: uid("sl_"),
      type: l.type === "labour" ? "labour" : l.type === "part" ? "part" : "service",
      itemId: l.itemId,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
      unitCost: 0,
      refundedQty: 0,
    }));
    discount = aq.discount;
  } else if (db.settings.diagnosisFee > 0) {
    lines = [{ id: uid("sl_"), type: "service", description: "Diagnosis / inspection fee", qty: 1, unitPrice: db.settings.diagnosisFee, unitCost: 0, refundedQty: 0 }];
  }
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  return { lines, ...calcTotals(subtotal, discount, db.settings), quote: aq };
}

function jobWasReturnedUnrepaired(db: DbState, job: RepairJob) {
  const lastIn = db.statusEvents.find((e) => e.jobId === job.id && e.to === "ready" && e.from !== "ready");
  return lastIn?.from === "awaiting_approval" || lastIn?.from === "unrepairable";
}

export interface CollectInput {
  idempotencyKey: string;
  payments: PaymentInput[];
  warrantyRuleId?: string;
  note?: string;
}

export function collectRepair(db: DbState, jobId: string, input: CollectInput) {
  const a = requirePerm(db, "payment.receive");
  const prior = db.processedKeys[input.idempotencyKey];
  if (prior) return db.sales.find((s) => s.id === prior);
  const job = getJob(db, jobId);
  if (job.status !== "ready") throw new ServiceError("Job must be Ready for Collection.");
  const inv = collectionInvoice(db, job);
  const deposits = db.payments.filter((p) => p.repairJobId === job.id && p.kind === "deposit" && !p.saleId);
  const depTotal = deposits.reduce((s, p) => s + p.amount, 0);
  if (input.payments.length) validatePayments(db, input.payments);
  const paying = input.payments.reduce((s, p) => s + p.amount, 0);
  const due = Math.max(0, inv.total - depTotal);
  if (paying > due) throw new ServiceError(`Payment exceeds balance due (${money(due)}).`);
  if (paying < due && !db.settings.allowCollectWithBalance) {
    throw new ServiceError(`Balance of ${money(due - paying)} must be paid before collection (see Settings).`);
  }

  let sale: Sale | undefined;
  const at = now();
  if (inv.total > 0 || depTotal > 0) {
    const receiptNo = nextNo(db, db.settings.prefixes.receipt, 5, at);
    const partsCost = db.repairParts.filter((p) => p.jobId === job.id && !p.reversed).reduce((s, p) => s + p.unitCost * p.qty, 0);
    sale = {
      id: uid("sa_"),
      receiptNo,
      kind: "repair",
      repairJobId: job.id,
      customerId: job.customerId,
      cashierId: a.id,
      lines: inv.lines,
      subtotal: inv.subtotal,
      discount: inv.discount,
      tax: inv.tax,
      total: inv.total,
      cogs: partsCost,
      status: "completed",
      idempotencyKey: input.idempotencyKey,
      at,
    };
    db.sales.unshift(sale);
    for (const d of deposits) d.saleId = sale.id; // deposits applied — counted once, as payments against this invoice
    writePayments(db, input.payments, { saleId: sale.id, repairJobId: job.id }, "payment");
    if (depTotal > inv.total) {
      // Deposit exceeds final invoice → record refund of the excess.
      writePayments(db, [{ methodId: deposits[0].methodId, amount: depTotal - inv.total }], { saleId: sale.id, repairJobId: job.id }, "refund");
      audit(db, "deposit.excess_refund", `${receiptNo}: refunded excess deposit ${money(depTotal - inv.total)}`);
    }
    job.saleId = sale.id;
    db.processedKeys[input.idempotencyKey] = sale.id;
  }

  if (input.warrantyRuleId && inv.quote && !jobWasReturnedUnrepaired(db, job)) {
    const rule = db.warrantyRules.find((r) => r.id === input.warrantyRuleId && r.active);
    if (!rule) throw new ServiceError("Invalid warranty rule.");
    db.warranties.unshift({
      id: uid("wr_"),
      warrantyNo: nextNo(db, db.settings.prefixes.warranty, 4, at),
      jobId: job.id,
      saleId: sale?.id,
      customerId: job.customerId,
      ruleId: rule.id,
      coverage: inv.quote.lines.filter((l) => l.type !== "service").map((l) => l.description).join("; ") || job.reportedProblem,
      startsOn: at,
      endsOn: addDays(at, rule.durationDays),
      voided: false,
    });
  }
  setStatus(db, job, "completed", input.note?.trim() || "Device collected by customer");
  return sale;
}

// ───────────────────────────── Inventory ─────────────────────────────

export function saveItem(db: DbState, item: Omit<Item, "id" | "stock"> & { id?: string; openingStock?: number }) {
  requirePerm(db, "inventory.edit");
  if (!item.sku.trim() || !item.name.trim()) throw new ServiceError("SKU and name are required.");
  if (item.type === "retail" && !db.settings.retailEnabled) throw new ServiceError("Retail products are disabled. Enable retail sales in Settings first.");
  const dup = db.items.find((i) => i.sku.toLowerCase() === item.sku.trim().toLowerCase() && i.id !== item.id);
  if (dup) throw new ServiceError(`SKU ${item.sku} already exists.`);
  if (item.price < 0 || item.cost < 0) throw new ServiceError("Prices cannot be negative.");
  if (item.id) {
    const ex = getItem(db, item.id);
    const priceChanged = ex.price !== item.price || ex.cost !== item.cost;
    const { openingStock: _o, ...rest } = item;
    Object.assign(ex, rest, { sku: item.sku.trim(), name: item.name.trim() });
    if (priceChanged) audit(db, "item.price", `${ex.sku}: cost ${money(ex.cost)}, price ${money(ex.price)}`);
    return ex;
  }
  const { openingStock = 0, ...rest } = item;
  const it: Item = { ...rest, id: uid("it_"), sku: item.sku.trim(), name: item.name.trim(), stock: 0 };
  db.items.unshift(it);
  if (openingStock) moveStock(db, it.id, openingStock, "opening", undefined, "Opening stock");
  audit(db, "item.create", `${it.sku} ${it.name}`);
  return it;
}

export function adjustStock(db: DbState, itemId: string, qty: number, reason: "adjustment" | "receive", note: string) {
  requirePerm(db, "inventory.adjust");
  if (!Number.isInteger(qty) || qty === 0) throw new ServiceError("Enter a non-zero whole quantity.");
  if (!note.trim()) throw new ServiceError("A note is required for stock adjustments.");
  if (reason === "receive" && qty < 0) throw new ServiceError("Received quantity must be positive.");
  moveStock(db, itemId, qty, reason, undefined, note.trim());
  audit(db, `stock.${reason}`, `${getItem(db, itemId).sku}: ${qty > 0 ? "+" : ""}${qty} — ${note}`);
}

// ───────────────────────────── Customers ─────────────────────────────

export function saveCustomer(db: DbState, c: { id?: string; name: string; phone: string; email?: string; notes?: string }) {
  requirePerm(db, "customers.edit");
  if (!c.name.trim() || !c.phone.trim()) throw new ServiceError("Name and phone are required.");
  guardSecrets(c.notes);
  const phone = normalisePhone(c.phone);
  const dup = db.customers.find((x) => normalisePhone(x.phone) === phone && x.id !== c.id);
  if (dup) throw new ServiceError(`Phone number already belongs to ${dup.name}.`);
  if (c.id) {
    const ex = db.customers.find((x) => x.id === c.id);
    if (!ex) throw new ServiceError("Customer not found.");
    Object.assign(ex, { name: c.name.trim(), phone: c.phone.trim(), email: c.email?.trim() || undefined, notes: c.notes?.trim() || undefined });
    return ex;
  }
  const n: Customer = { id: uid("cu_"), name: c.name.trim(), phone: c.phone.trim(), email: c.email?.trim() || undefined, notes: c.notes?.trim() || undefined, createdAt: now() };
  db.customers.unshift(n);
  return n;
}

// ───────────────────────────── Warranty ─────────────────────────────

export function createClaim(db: DbState, warrantyId: string, issue: string) {
  requirePerm(db, "warranty.manage");
  const w = db.warranties.find((x) => x.id === warrantyId);
  if (!w) throw new ServiceError("Warranty not found.");
  if (w.voided) throw new ServiceError("Warranty is void.");
  if (new Date(w.endsOn).getTime() < Date.now()) throw new ServiceError("Warranty has expired.");
  if (!issue.trim()) throw new ServiceError("Describe the issue.");
  db.claims.unshift({ id: uid("wc_"), warrantyId, issue: issue.trim(), outcome: "pending", actorId: db.currentUserId, at: now() });
}

export function resolveClaim(db: DbState, claimId: string, outcome: "accepted" | "rejected") {
  requirePerm(db, "repair.cancel"); // owner decision
  const c = db.claims.find((x) => x.id === claimId);
  if (!c || c.outcome !== "pending") throw new ServiceError("Claim not pending.");
  c.outcome = outcome;
  audit(db, "warranty.claim", `Claim ${outcome}`);
}

// ───────────────────────────── Settings & staff ─────────────────────────────

export function updateSettings(db: DbState, patch: Partial<Settings>) {
  requirePerm(db, "settings.edit");
  if (patch.paymentMethods && !patch.paymentMethods.some((m) => m.active)) throw new ServiceError("At least one payment method must be active.");
  if (patch.taxRatePct !== undefined && (patch.taxRatePct < 0 || patch.taxRatePct > 100)) throw new ServiceError("Invalid tax rate.");
  Object.assign(db.settings, patch);
  audit(db, "settings.update", Object.keys(patch).join(", "));
}

export function saveWarrantyRule(db: DbState, r: Omit<WarrantyRule, "id"> & { id?: string }) {
  requirePerm(db, "settings.edit");
  if (!r.name.trim() || r.durationDays <= 0) throw new ServiceError("Name and a positive duration are required.");
  if (r.id) {
    const ex = db.warrantyRules.find((x) => x.id === r.id);
    if (!ex) throw new ServiceError("Rule not found.");
    Object.assign(ex, r);
  } else db.warrantyRules.push({ ...r, id: uid("wrr_") });
}

export function saveStaff(db: DbState, s: Partial<Staff> & { id: string }) {
  requirePerm(db, "staff.manage");
  const ex = db.staff.find((x) => x.id === s.id);
  if (!ex) throw new ServiceError("Staff not found.");
  if (ex.id === db.currentUserId && s.active === false) throw new ServiceError("You cannot deactivate yourself.");
  if (ex.role === "owner" && s.role && s.role !== "owner" && db.staff.filter((x) => x.role === "owner" && x.active).length <= 1) {
    throw new ServiceError("At least one active owner is required.");
  }
  Object.assign(ex, s);
  audit(db, "staff.update", ex.name);
}

export function switchUser(db: DbState, staffId: string) {
  const s = db.staff.find((x) => x.id === staffId && x.active);
  if (!s) throw new ServiceError("Staff not available.");
  db.currentUserId = s.id;
}

/** Read-only PIN check used by the UI before applying an override (re-verified on commit). */
export function checkOverridePin(db: DbState, pin: string, p: Permission): Staff | undefined {
  return db.staff.find((s) => s.active && s.pin === pin && can(s.role, p));
}
