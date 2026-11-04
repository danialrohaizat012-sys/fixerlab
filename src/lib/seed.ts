/**
 * FICTIONAL SAMPLE DATA for demonstration only.
 * Names, phone numbers (all use the 555 range), transactions and prices are invented
 * and do not represent real Fixerlab customers, pricing or policies.
 */
import type {
  Customer,
  DbState,
  Device,
  Item,
  Payment,
  Quotation,
  QuoteLine,
  RepairJob,
  RepairPart,
  RepairStatus,
  Sale,
  SaleLine,
  StatusEvent,
  StockMovement,
  Warranty,
} from "./types";
import { myPeriod } from "./format";

export const DB_VERSION = 3;

// Deterministic PRNG so every reset produces the same demo story.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ISO timestamp for N days ago at a Malaysian local time. */
function myt(daysAgo: number, hour: number, minute = 0): string {
  const nowMy = new Date(Date.now() + 8 * 3_600_000); // shift to MYT wall-clock
  const y = nowMy.getUTCFullYear();
  const m = nowMy.getUTCMonth();
  const d = nowMy.getUTCDate() - daysAgo;
  const t = Date.UTC(y, m, d, hour - 8, minute);
  // Never generate history in the future (e.g. when the demo is reset before opening hours).
  return new Date(daysAgo >= 0 ? Math.min(t, Date.now() - 20 * 60_000) : t).toISOString();
}

const RETAIL: [string, string, string, number, number, number, number][] = [
  // sku, name, category, cost, price, stock(final), min
  ["R-CHG-20W", "USB-C 20W Fast Charger", "Chargers", 1800, 3900, 24, 5],
  ["R-CHG-65W", "65W GaN Charger (3-port)", "Chargers", 4500, 8900, 8, 3],
  ["R-CBL-CC1", "USB-C to USB-C Cable 1m", "Cables", 600, 1900, 40, 10],
  ["R-CBL-CL1", "USB-C to Lightning Cable 1m", "Cables", 900, 2500, 30, 10],
  ["R-CBL-MIC", "Micro-USB Cable 1m", "Cables", 300, 1000, 3, 5],
  ["R-CAS-IP15", "iPhone 15 Clear Case", "Cases", 500, 2500, 15, 5],
  ["R-CAS-S24", "Galaxy S24 Armour Case", "Cases", 800, 3500, 6, 3],
  ["R-TG-IP15", "Tempered Glass — iPhone 15", "Screen Protection", 200, 1500, 50, 15],
  ["R-TG-PRV", "Privacy Tempered Glass (universal fit)", "Screen Protection", 400, 2500, 2, 10],
  ["R-PB-10K", "Power Bank 10,000mAh", "Power & Audio", 3500, 6900, 10, 3],
  ["R-EAR-TWS", "Wireless Earbuds", "Power & Audio", 4000, 8900, 7, 3],
  ["R-MOU-WL", "Wireless Mouse", "Computer Accessories", 1500, 3500, 12, 4],
  ["R-HUB-C7", "USB-C 7-in-1 Hub", "Computer Accessories", 5500, 11900, 5, 2],
  ["R-GRP-CTL", "Controller Thumb Grips (pair)", "Gaming Accessories", 300, 1500, 20, 5],
];

const PARTS: [string, string, string, number, number, number, number][] = [
  ["P-SCR-IP13", "iPhone 13 Screen Assembly (OLED)", "Screens", 28000, 45000, 3, 2],
  ["P-SCR-IP14", "iPhone 14 Screen Assembly (OLED)", "Screens", 32000, 52000, 2, 2],
  ["P-SCR-A54", "Galaxy A54 Screen Assembly", "Screens", 15000, 28000, 1, 2],
  ["P-DIG-IPD9", "iPad 9th Gen Digitizer", "Screens", 9000, 18000, 2, 1],
  ["P-BAT-IP12", "iPhone 12 Battery", "Batteries", 6000, 15000, 5, 2],
  ["P-BAT-IP13", "iPhone 13 Battery", "Batteries", 6500, 16000, 4, 2],
  ["P-PRT-S22", "Galaxy S22 Charging Port Flex", "Charging Ports", 3500, 9000, 4, 2],
  ["P-PRT-UNI", "USB-C Port (board-level, generic)", "Charging Ports", 500, 4000, 10, 4],
  ["P-SSD-512", "NVMe SSD 512GB", "Laptop Components", 15000, 26000, 6, 2],
  ["P-KBD-HP14", "HP 14\" Laptop Keyboard", "Laptop Components", 5500, 12000, 2, 1],
  ["P-FAN-LT", "Laptop Cooling Fan (generic)", "Laptop Components", 3000, 8000, 4, 2],
  ["P-PS5-FAN", "PS5 Cooling Fan", "Console Components", 9000, 18000, 2, 1],
  ["P-PS5-LM", "PS5 Liquid Metal TIM Kit", "Console Components", 2500, 6000, 5, 2],
  ["P-PS5-HDMI", "PS5 HDMI Port", "Console Components", 1500, 6000, 3, 2],
  ["P-THM-PST", "Thermal Paste (service use)", "Consumables", 300, 1500, 25, 5],
];

export function createSeed(): DbState {
  const r = rng(20261104);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  let idc = 0;
  const id = (p: string) => `${p}${(++idc).toString(36).padStart(5, "0")}`;

  const staff = [
    { id: "st_owner", name: "Aiman", role: "owner" as const, pin: "1234", discountLimitPct: 100, active: true },
    { id: "st_cashier", name: "Sofia", role: "cashier" as const, pin: "2222", discountLimitPct: 10, active: true },
    { id: "st_tech1", name: "Haziq", role: "technician" as const, pin: "3333", discountLimitPct: 0, active: true },
    { id: "st_tech2", name: "Mei Ling", role: "technician" as const, pin: "4444", discountLimitPct: 0, active: true },
  ];

  const items: Item[] = [
    ...RETAIL.map(([sku, name, category, cost, price, stock, min]) => ({
      id: `it_${sku}`, type: "retail" as const, sku, barcode: `955000${String(idc++).padStart(6, "0")}`, name, category, cost, price, stock, minStock: min, allowNegative: false, active: true,
    })),
    ...PARTS.map(([sku, name, category, cost, price, stock, min]) => ({
      id: `it_${sku}`, type: "part" as const, sku, name, category, cost, price, stock, minStock: min, allowNegative: false, active: true,
    })),
  ];
  const item = (sku: string) => items.find((i) => i.sku === sku)!;

  const customers: Customer[] = [
    ["Nur Aisyah Kamal", "012-555 0101", "aisyah.sample@example.com"],
    ["Daniel Lim Wei Jie", "013-555 0102"],
    ["Priya Raman", "016-555 0103", "priya.sample@example.com"],
    ["Muhammad Faris Azman", "017-555 0104"],
    ["Tan Mei Xin", "011-5550 0105"],
    ["Hafiz Rahman", "019-555 0106"],
    ["Mariam Yusof", "012-555 0107"],
    ["Kevin Raj", "014-555 0108", "kevin.sample@example.com"],
  ].map(([name, phone, email], i) => ({ id: `cu_s${i + 1}`, name, phone, email, sample: true, createdAt: myt(60 - i * 5, 11) }));

  const movements: StockMovement[] = [];
  const sales: Sale[] = [];
  const payments: Payment[] = [];
  const pendingMoves: { sale: Sale; itemId: string; qty: number; at: string }[] = [];

  // ── Retail history: 30 days ──
  const methods = ["pm_cash", "pm_cash", "pm_duitnow", "pm_duitnow", "pm_card", "pm_transfer"];
  for (let d = 30; d >= 0; d--) {
    const n = d === 0 ? 3 : 2 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const at = myt(d, 10 + Math.floor(r() * (d === 0 ? 1 : 11)), Math.floor(r() * 60));
      const lines: SaleLine[] = [];
      const count = 1 + Math.floor(r() * 2);
      for (let c = 0; c < count; c++) {
        const it = pick(items.filter((i) => i.type === "retail"));
        if (lines.some((l) => l.itemId === it.id)) continue;
        lines.push({ id: id("sl_"), type: "product", itemId: it.id, description: it.name, qty: r() < 0.85 ? 1 : 2, unitPrice: it.price, unitCost: it.cost, refundedQty: 0 });
      }
      const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
      const discount = r() < 0.12 ? Math.round(subtotal * 0.05) : 0;
      const sale: Sale = {
        id: id("sa_"), receiptNo: "", kind: "retail", cashierId: r() < 0.7 ? "st_cashier" : "st_owner", lines, subtotal, discount,
        discountAuthorizedBy: discount ? "st_cashier" : undefined, tax: 0, total: subtotal - discount,
        cogs: lines.reduce((s, l) => s + l.qty * l.unitCost, 0), status: "completed", idempotencyKey: id("seed_"), at,
      };
      if (r() < 0.3) sale.customerId = pick(customers).id;
      sales.push(sale);
      payments.push({ id: id("py_"), saleId: sale.id, kind: "payment", methodId: pick(methods), amount: sale.total, receivedBy: sale.cashierId, at });
      for (const l of lines) pendingMoves.push({ sale, itemId: l.itemId!, qty: -l.qty, at });
    }
  }

  // ── Repair history ──
  const devices: Device[] = [];
  const jobs: RepairJob[] = [];
  const events: StatusEvent[] = [];
  const quotations: Quotation[] = [];
  const decisions: DbState["decisions"] = [];
  const repairParts: RepairPart[] = [];
  const warranties: Warranty[] = [];
  const partMoves: { job: RepairJob; itemId: string; qty: number; at: string; rp: RepairPart }[] = [];

  interface JobSpec {
    cust: number;
    device: Omit<Device, "id" | "customerId">;
    problem: string;
    condition: string;
    accessories: string[];
    diagnosis: string;
    tech?: string;
    path: RepairStatus[];
    startDaysAgo: number;
    quote?: { lines: [QuoteLine["type"], string, number, number, string?][]; discount?: number; decision?: "approved" | "rejected" };
    parts?: [string, number][];
    deposit?: number;
    warrantyRule?: string;
    estCost: number;
    notes?: string;
  }

  const specs: JobSpec[] = [
    {
      cust: 7, device: { category: "Laptop", brand: "Lenovo", model: "IdeaPad Slim 3", color: "Grey", serial: "PF-SAMPLE-0099" },
      problem: "Very slow boot, wants SSD upgrade", condition: "Light scratches on lid", accessories: ["Charger"],
      diagnosis: "HDD health 61%. Recommend NVMe SSD + OS migration.", tech: "st_tech2",
      path: ["received", "diagnosing", "awaiting_approval", "in_progress", "quality_check", "ready", "completed"], startDaysAgo: 9,
      quote: { lines: [["part", "NVMe SSD 512GB", 1, 26000, "P-SSD-512"], ["labour", "Installation & data migration", 1, 8000]], decision: "approved" },
      parts: [["P-SSD-512", 1]], warrantyRule: "wrr_parts", estCost: 34000,
    },
    {
      cust: 0, device: { category: "Smartphone", brand: "Samsung", model: "Galaxy A54", color: "Lime" },
      problem: "Cracked screen after drop", condition: "Screen shattered, frame dented at bottom-left", accessories: ["Case"],
      diagnosis: "Display assembly damaged; touch partially working.", tech: "st_tech1",
      path: ["received", "diagnosing", "awaiting_approval", "in_progress", "quality_check", "ready", "completed"], startDaysAgo: 16,
      quote: { lines: [["part", "Galaxy A54 Screen Assembly", 1, 28000, "P-SCR-A54"], ["labour", "Screen replacement labour", 1, 5000]], decision: "approved" },
      parts: [["P-SCR-A54", 1]], deposit: 10000, warrantyRule: "wrr_labour", estCost: 33000,
    },
    {
      cust: 6, device: { category: "Smartphone", brand: "Apple", model: "iPhone 12", color: "Blue" },
      problem: "Battery drains fast, battery health 72%", condition: "Good overall, minor scuffs", accessories: [],
      diagnosis: "Battery worn. Replace battery.", tech: "st_tech1",
      path: ["received", "diagnosing", "awaiting_approval", "in_progress", "quality_check", "ready"], startDaysAgo: 3,
      quote: { lines: [["part", "iPhone 12 Battery", 1, 15000, "P-BAT-IP12"], ["labour", "Battery replacement labour", 1, 3000]], decision: "approved" },
      parts: [["P-BAT-IP12", 1]], deposit: 5000, estCost: 18000,
    },
    {
      cust: 1, device: { category: "Smartphone", brand: "Samsung", model: "Galaxy S22", color: "Phantom Black" },
      problem: "Not charging, cable loose", condition: "Back glass hairline crack (pre-existing)", accessories: ["SIM tray"],
      diagnosis: "Charging port worn and corroded. Replace port flex.", tech: "st_tech1",
      path: ["received", "diagnosing", "awaiting_approval", "in_progress"], startDaysAgo: 2,
      quote: { lines: [["part", "Galaxy S22 Charging Port Flex", 1, 9000, "P-PRT-S22"], ["labour", "Port replacement labour", 1, 3000]], decision: "approved" },
      parts: [["P-PRT-S22", 1]], estCost: 12000,
    },
    {
      cust: 3, device: { category: "Tablet", brand: "Apple", model: "iPad (9th gen)", color: "Space Grey" },
      problem: "Touch glass cracked", condition: "Cracked digitizer, LCD fine", accessories: ["Pencil case"],
      diagnosis: "Digitizer replacement required.", tech: "st_tech2",
      path: ["received", "diagnosing", "awaiting_approval", "in_progress", "quality_check"], startDaysAgo: 4,
      quote: { lines: [["part", "iPad 9th Gen Digitizer", 1, 18000, "P-DIG-IPD9"], ["labour", "Digitizer replacement labour", 1, 6000]], decision: "approved" },
      parts: [["P-DIG-IPD9", 1]], estCost: 24000,
    },
    {
      cust: 2, device: { category: "Laptop", brand: "HP", model: "Pavilion 14", color: "Silver", serial: "5CD-SAMPLE-14" },
      problem: "Several keys not responding", condition: "Good, sticker residue on palm rest", accessories: ["Charger", "Laptop sleeve"],
      diagnosis: "Liquid residue under keyboard. Keyboard replacement recommended.", tech: "st_tech2",
      path: ["received", "diagnosing", "awaiting_approval"], startDaysAgo: 1,
      quote: { lines: [["part", "HP 14\" Laptop Keyboard", 1, 12000, "P-KBD-HP14"], ["labour", "Keyboard replacement & cleaning", 1, 6000]] },
      estCost: 18000,
    },
    {
      cust: 4, device: { category: "Laptop", brand: "Apple", model: "MacBook Air M1", color: "Gold" },
      problem: "Does not power on", condition: "Small dent near hinge", accessories: ["Charger"],
      diagnosis: "", tech: "st_tech1", path: ["received", "diagnosing"], startDaysAgo: 1, estCost: 0,
      notes: "Customer says no liquid exposure.",
    },
    {
      cust: 5, device: { category: "Gaming Console", brand: "Nintendo", model: "Switch OLED", color: "White" },
      problem: "Left Joy-Con drifting", condition: "Good", accessories: ["Left Joy-Con", "Right Joy-Con"],
      diagnosis: "", path: ["received"], startDaysAgo: 0, estCost: 6000,
    },
    {
      cust: 1, device: { category: "Smartphone", brand: "Apple", model: "iPhone 11", color: "Black" },
      problem: "Face ID not working", condition: "Rear camera lens cracked", accessories: [],
      diagnosis: "Face ID module damaged; repair not economical.", tech: "st_tech1",
      path: ["received", "diagnosing", "cancelled"], startDaysAgo: 20, estCost: 0,
    },
  ];

  specs.forEach((s, idx) => {
    const cust = customers[s.cust];
    const dev: Device = { id: `dv_s${idx}`, customerId: cust.id, ...s.device };
    devices.push(dev);
    const createdAt = myt(s.startDaysAgo, 10 + (idx % 6), 15 + idx);
    const job: RepairJob = {
      id: `jb_s${idx}`, jobNo: "", customerId: cust.id, deviceId: dev.id, status: s.path[s.path.length - 1],
      accessories: s.accessories, condition: s.condition, reportedProblem: s.problem, diagnosis: s.diagnosis,
      technicianId: s.tech, estCost: s.estCost, estCompletion: myt(s.startDaysAgo - 3, 18), internalNotes: s.notes ?? "",
      photos: [], createdBy: "st_cashier", createdAt, updatedAt: createdAt,
    };
    // Spread status changes across the job's lifetime (never into the future).
    const span = Math.max(1, s.startDaysAgo) * 24 * 3_600_000 * 0.85;
    const step = span / Math.max(1, s.path.length);
    let prev: RepairStatus | undefined;
    s.path.forEach((st, i) => {
      const at = new Date(new Date(createdAt).getTime() + Math.min(i * step, Date.now() - new Date(createdAt).getTime() - 60_000 * (s.path.length - i))).toISOString();
      const actor = st === "received" || st === "completed" ? "st_cashier" : st === "ready" && prev === "quality_check" ? "st_owner" : s.tech ?? "st_owner";
      events.push({ id: id("se_"), jobId: job.id, from: prev, to: st, actorId: actor, note: st === "received" ? "Device received at counter" : st === "cancelled" ? "Customer declined repair — device returned (no charge)" : undefined, at });
      if (st === "awaiting_approval" && s.quote) {
        const q: Quotation = {
          id: `qt_s${idx}`, quoteNo: "", jobId: job.id, version: 1, status: s.quote.decision ?? "sent",
          lines: s.quote.lines.map(([type, desc, qty, price, sku]) => ({ id: id("ql_"), type, description: desc, qty, unitPrice: price, itemId: sku ? `it_${sku}` : undefined })),
          discount: s.quote.discount ?? 0, validUntil: new Date(new Date(at).getTime() + 7 * 86_400_000).toISOString(), createdBy: s.tech ?? "st_owner", createdAt: at, sentAt: at,
        };
        quotations.push(q);
        if (s.quote.decision) {
          const dat = new Date(new Date(at).getTime() + step * 0.5).toISOString();
          decisions.push({ id: id("qd_"), quoteId: q.id, decision: s.quote.decision, channel: idx % 2 ? "whatsapp" : "phone", customerName: cust.name, recordedBy: "st_cashier", at: dat });
          events.push({ id: id("se_"), jobId: job.id, from: st, to: st, actorId: "st_cashier", note: `Quotation approved by ${cust.name} via ${idx % 2 ? "WhatsApp" : "phone"}`, at: dat });
        }
      }
      if (st === "in_progress" && s.parts) {
        for (const [sku, qty] of s.parts) {
          const pat = new Date(new Date(at).getTime() + 3_600_000).toISOString();
          const rp: RepairPart = { id: id("rp_"), jobId: job.id, itemId: `it_${sku}`, qty, unitCost: item(sku).cost, movementId: "", reversed: false, actorId: s.tech ?? "st_owner", at: pat };
          repairParts.push(rp);
          partMoves.push({ job, itemId: rp.itemId, qty: -qty, at: pat, rp });
        }
      }
      job.updatedAt = at;
      prev = st;
    });
    if (s.deposit) {
      payments.push({ id: id("py_"), repairJobId: job.id, kind: "deposit", methodId: "pm_duitnow", amount: s.deposit, receivedBy: "st_cashier", at: createdAt });
    }
    if (job.status === "completed" && s.quote) {
      const at = job.updatedAt;
      const lines: SaleLine[] = s.quote.lines.map(([type, desc, qty, price, sku]) => ({
        id: id("sl_"), type: type === "labour" ? "labour" : type === "part" ? "part" : "service", itemId: sku ? `it_${sku}` : undefined, description: desc, qty, unitPrice: price, unitCost: 0, refundedQty: 0,
      }));
      const subtotal = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
      const sale: Sale = {
        id: id("sa_"), receiptNo: "", kind: "repair", repairJobId: job.id, customerId: cust.id, cashierId: "st_cashier", lines, subtotal, discount: 0, tax: 0, total: subtotal,
        cogs: (s.parts ?? []).reduce((a, [sku, q]) => a + item(sku).cost * q, 0), status: "completed", idempotencyKey: id("seed_"), at,
      };
      sales.push(sale);
      job.saleId = sale.id;
      for (const p of payments) if (p.repairJobId === job.id && p.kind === "deposit") p.saleId = sale.id;
      payments.push({ id: id("py_"), saleId: sale.id, repairJobId: job.id, kind: "payment", methodId: "pm_card", amount: subtotal - (s.deposit ?? 0), receivedBy: "st_cashier", at });
      if (s.warrantyRule) {
        const days = s.warrantyRule === "wrr_parts" ? 90 : 30;
        warranties.push({
          id: id("wr_"), warrantyNo: "", jobId: job.id, saleId: sale.id, customerId: cust.id, ruleId: s.warrantyRule,
          coverage: lines.filter((l) => l.type !== "service").map((l) => l.description).join("; "), startsOn: at,
          endsOn: new Date(new Date(at).getTime() + days * 86_400_000).toISOString(), voided: false,
        });
      }
    }
    jobs.push(job);
  });

  // ── Number documents chronologically, per Malaysian month ──
  const sequences: Record<string, number> = {};
  const next = (prefix: string, at: string, digits: number) => {
    const key = `${prefix}-${myPeriod(at)}`;
    sequences[key] = (sequences[key] ?? 0) + 1;
    return `${key}-${String(sequences[key]).padStart(digits, "0")}`;
  };
  sales.sort((a, b) => a.at.localeCompare(b.at)).forEach((s) => (s.receiptNo = next("RCP", s.at, 5)));
  jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((j) => (j.jobNo = next("JOB", j.createdAt, 4)));
  quotations.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((q) => (q.quoteNo = next("QUO", q.createdAt, 4)));
  warranties.sort((a, b) => a.startsOn.localeCompare(b.startsOn)).forEach((w) => (w.warrantyNo = next("WTY", w.startsOn, 4)));

  // ── Stock ledger: opening balance + every movement reconciles to current stock ──
  const allMoves = [
    ...pendingMoves.map((m) => ({ itemId: m.itemId, qty: m.qty, at: m.at, reason: "sale" as const, refNo: m.sale.receiptNo, actor: m.sale.cashierId, rp: undefined as RepairPart | undefined })),
    ...partMoves.map((m) => ({ itemId: m.itemId, qty: m.qty, at: m.at, reason: "repair_use" as const, refNo: m.job.jobNo, actor: m.rp.actorId, rp: m.rp })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const consumed: Record<string, number> = {};
  for (const m of allMoves) consumed[m.itemId] = (consumed[m.itemId] ?? 0) - m.qty;
  const bal: Record<string, number> = {};
  const openAt = myt(35, 9);
  for (const it of items) {
    const opening = it.stock + (consumed[it.id] ?? 0);
    bal[it.id] = opening;
    movements.push({ id: id("mv_"), itemId: it.id, qty: opening, balanceAfter: opening, reason: "opening", actorId: "st_owner", note: "Opening stock (sample)", at: openAt });
  }
  for (const m of allMoves) {
    bal[m.itemId] += m.qty;
    const mv: StockMovement = { id: id("mv_"), itemId: m.itemId, qty: m.qty, balanceAfter: bal[m.itemId], reason: m.reason, refNo: m.refNo, actorId: m.actor, at: m.at };
    movements.push(mv);
    if (m.rp) m.rp.movementId = mv.id;
  }

  const desc = <T,>(arr: T[], key: (x: T) => string) => arr.sort((a, b) => key(b).localeCompare(key(a)));

  return {
    version: DB_VERSION,
    seededAt: new Date().toISOString(),
    currentUserId: "st_owner",
    settings: {
      businessName: "Fixerlab Solutions",
      branchName: "Putrajaya",
      address: "[Business address — to be confirmed by Fixerlab]",
      phone: "[Phone — to be confirmed]",
      receiptFooter: "Thank you for choosing Fixerlab!\n[Receipt footer text to be confirmed by Fixerlab]",
      taxEnabled: false,
      taxLabel: "SST",
      taxRatePct: 0,
      paymentMethods: [
        { id: "pm_cash", name: "Cash", isCash: true, active: true },
        { id: "pm_duitnow", name: "DuitNow QR", isCash: false, active: true },
        { id: "pm_transfer", name: "Bank Transfer", isCash: false, active: true },
        { id: "pm_card", name: "Debit / Credit Card", isCash: false, active: true },
        { id: "pm_ewallet", name: "E-Wallet (Other)", isCash: false, active: true },
      ],
      retailCategories: Array.from(new Set(RETAIL.map((x) => x[2]))),
      partCategories: Array.from(new Set(PARTS.map((x) => x[2]))),
      deviceCategories: ["Smartphone", "Tablet", "Laptop", "Gaming Console", "Other"],
      prefixes: { receipt: "RCP", job: "JOB", quote: "QUO", warranty: "WTY", refund: "RFD" },
      allowCollectWithBalance: false,
      qcRequiresDifferentPerson: true,
      diagnosisFee: 0,
      quoteValidityDays: 7,
    },
    staff,
    customers,
    devices,
    items,
    movements: desc(movements, (m) => m.at),
    jobs: desc(jobs, (j) => j.createdAt),
    statusEvents: desc(events, (e) => e.at),
    repairParts,
    quotations,
    decisions,
    sales: desc(sales, (s) => s.at),
    payments: desc(payments, (p) => p.at),
    refunds: [],
    warrantyRules: [
      { id: "wrr_labour", name: "SAMPLE — Repair workmanship (30 days)", durationDays: 30, terms: "Sample terms for demonstration only. Fixerlab to provide official warranty policy.", active: true },
      { id: "wrr_parts", name: "SAMPLE — Replacement part (90 days)", durationDays: 90, terms: "Sample terms for demonstration only. Fixerlab to provide official warranty policy.", active: true },
    ],
    warranties: desc(warranties, (w) => w.startsOn),
    claims: [],
    audit: [],
    sequences,
    processedKeys: {},
  };
}
