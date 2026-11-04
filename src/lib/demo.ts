/**
 * Guided demonstration scenarios (fictional data). Each scenario can be walked through manually
 * (with live progress detection) or fast-forwarded using the same service functions the UI uses,
 * so every rule (permissions, stock, approvals, payments) is still enforced.
 */
import type { DbState, QuoteLine, RepairJob } from "./types";
import {
  changeStatus,
  collectRepair,
  completeSale,
  createRepairJob,
  jobFinancials,
  latestQuote,
  normalisePhone,
  recordQuoteDecision,
  saveQuote,
  sendQuote,
  updateJob,
  useRepairPart,
  collectionInvoice,
} from "./services";
import { uid } from "./format";

export interface RepairScenario {
  id: "B" | "C";
  title: string;
  customer: { name: string; phone: string };
  device: { category: "Smartphone" | "Gaming Console"; brand: string; model: string; color: string };
  problem: string;
  condition: string;
  accessories: string[];
  estCost: number;
  deposit: number;
  techId: string;
  diagnosis: string;
  quote: { type: QuoteLine["type"]; sku?: string; description: string; qty: number; unitPrice: number }[];
  parts: { sku: string; qty: number }[];
  warrantyRuleId: string;
}

export const SCENARIO_B: RepairScenario = {
  id: "B",
  title: "Smartphone repair — iPhone screen replacement",
  customer: { name: "Amir Hakim (Demo)", phone: "012-555 0201" },
  device: { category: "Smartphone", brand: "Apple", model: "iPhone 13", color: "Midnight" },
  problem: "Screen cracked after drop; touch works intermittently",
  condition: "Screen cracked; Scratches on body",
  accessories: ["Case / cover"],
  estCost: 50000,
  deposit: 5000,
  techId: "st_tech1",
  diagnosis: "OLED panel cracked, digitizer partially responsive. Frame OK. Replace screen assembly.",
  quote: [
    { type: "part", sku: "P-SCR-IP13", description: "iPhone 13 Screen Assembly (OLED)", qty: 1, unitPrice: 45000 },
    { type: "labour", description: "Screen replacement labour", qty: 1, unitPrice: 5000 },
  ],
  parts: [{ sku: "P-SCR-IP13", qty: 1 }],
  warrantyRuleId: "wrr_parts",
};

export const SCENARIO_C: RepairScenario = {
  id: "C",
  title: "Gaming console repair — PlayStation 5 overheating",
  customer: { name: "Jason Ong (Demo)", phone: "012-555 0202" },
  device: { category: "Gaming Console", brand: "Sony", model: "PlayStation 5 (Disc)", color: "White" },
  problem: "Overheats and shuts down after ~20 minutes of gaming; loud fan",
  condition: "Dust build-up visible at vents; Scratches on body",
  accessories: ["Controller"],
  estCost: 25000,
  deposit: 0,
  techId: "st_tech2",
  diagnosis: "Heavy dust in heatsink, worn fan bearing, dried thermal interface. Replace fan + liquid metal, full clean.",
  quote: [
    { type: "part", sku: "P-PS5-FAN", description: "PS5 Cooling Fan", qty: 1, unitPrice: 18000 },
    { type: "part", sku: "P-PS5-LM", description: "PS5 Liquid Metal TIM Kit", qty: 1, unitPrice: 6000 },
    { type: "labour", description: "Teardown, deep clean & reassembly", qty: 1, unitPrice: 8000 },
  ],
  parts: [
    { sku: "P-PS5-FAN", qty: 1 },
    { sku: "P-PS5-LM", qty: 1 },
  ],
  warrantyRuleId: "wrr_labour",
};

export function findScenarioJob(db: DbState, sc: RepairScenario, since?: string): RepairJob | undefined {
  const phone = normalisePhone(sc.customer.phone);
  const cust = db.customers.find((c) => normalisePhone(c.phone) === phone);
  if (!cust) return undefined;
  return db.jobs.find((j) => j.customerId === cust.id && (!since || j.createdAt >= since));
}

function as<T>(db: DbState, staffId: string, fn: () => T): T {
  const prev = db.currentUserId;
  db.currentUserId = staffId;
  try {
    return fn();
  } finally {
    db.currentUserId = prev;
  }
}

/** Advance a repair scenario to completion, acting as the correct role at each step. */
export function autoRunRepair(db: DbState, sc: RepairScenario, since?: string): string {
  let job = findScenarioJob(db, sc, since);
  if (!job || job.status === "completed" || job.status === "cancelled") {
    job = as(db, "st_cashier", () =>
      createRepairJob(db, {
        customer: { name: sc.customer.name, phone: sc.customer.phone },
        device: sc.device,
        accessories: sc.accessories,
        condition: sc.condition,
        reportedProblem: sc.problem,
        technicianId: sc.techId,
        estCost: sc.estCost,
        internalNotes: "Created by demo fast-forward",
        photos: [],
        deposit: sc.deposit ? { methodId: "pm_duitnow", amount: sc.deposit } : undefined,
      }),
    );
  }
  const j = job;
  for (let guard = 0; guard < 12 && j.status !== "completed"; guard++) {
    switch (j.status) {
      case "received":
        if (!j.technicianId) as(db, "st_cashier", () => updateJob(db, j.id, { technicianId: sc.techId }));
        as(db, j.technicianId!, () => changeStatus(db, j.id, "diagnosing", "Started diagnosis"));
        break;
      case "diagnosing": {
        as(db, j.technicianId!, () => {
          if (!j.diagnosis) updateJob(db, j.id, { diagnosis: sc.diagnosis });
          const lq = latestQuote(db, j.id);
          const q =
            lq && lq.status === "draft"
              ? lq
              : saveQuote(db, j.id, {
                  lines: sc.quote.map((l) => ({ id: uid("ql_"), type: l.type, itemId: l.sku ? `it_${l.sku}` : undefined, description: l.description, qty: l.qty, unitPrice: l.unitPrice })),
                  discount: 0,
                });
          sendQuote(db, q.id);
        });
        break;
      }
      case "awaiting_approval": {
        const lq = latestQuote(db, j.id);
        if (lq?.status === "draft") as(db, j.technicianId!, () => sendQuote(db, lq.id));
        const q = latestQuote(db, j.id)!;
        if (q.status === "sent") {
          as(db, "st_cashier", () => recordQuoteDecision(db, q.id, { decision: "approved", channel: "simulated_demo", customerName: sc.customer.name }));
        }
        if (latestQuote(db, j.id)!.status !== "approved") throw new Error("Quotation was not approved — finish this job manually.");
        as(db, j.technicianId!, () => changeStatus(db, j.id, "in_progress", "Customer approved — repair started"));
        break;
      }
      case "waiting_parts":
        as(db, j.technicianId!, () => changeStatus(db, j.id, "in_progress"));
        break;
      case "in_progress":
        as(db, j.technicianId!, () => {
          for (const p of sc.parts) {
            const done = db.repairParts.filter((r) => r.jobId === j.id && !r.reversed && r.itemId === `it_${p.sku}`).reduce((a, r) => a + r.qty, 0);
            if (done < p.qty) useRepairPart(db, j.id, `it_${p.sku}`, p.qty - done);
          }
          changeStatus(db, j.id, "quality_check", "Repair done — submitted for QC");
        });
        break;
      case "quality_check":
        as(db, "st_owner", () => changeStatus(db, j.id, "ready", "QC passed: tested display/thermals, all functions OK"));
        break;
      case "ready": {
        const inv = collectionInvoice(db, j);
        const fin = jobFinancials(db, j);
        const due = Math.max(0, inv.total - fin.deposits);
        as(db, "st_cashier", () =>
          collectRepair(db, j.id, {
            idempotencyKey: uid("demo_"),
            payments: due ? [{ methodId: "pm_card", amount: due }] : [],
            warrantyRuleId: sc.warrantyRuleId,
          }),
        );
        break;
      }
      default:
        throw new Error(`Job is ${j.status}; finish it manually.`);
    }
  }
  return j.jobNo;
}

export function autoRunRetail(db: DbState) {
  return as(db, "st_cashier", () =>
    completeSale(db, {
      idempotencyKey: uid("demo_"),
      lines: [{ itemId: "it_R-CHG-20W", qty: 1 }],
      discount: 0,
      payments: [{ methodId: "pm_cash", amount: db.items.find((i) => i.id === "it_R-CHG-20W")!.price, tendered: 5000 }],
    }),
  );
}
