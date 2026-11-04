import type { RepairStatus, QuoteStatus, Role } from "./types";

export const STATUS_ORDER: RepairStatus[] = [
  "received",
  "diagnosing",
  "awaiting_approval",
  "waiting_parts",
  "in_progress",
  "quality_check",
  "ready",
  "completed",
];

export const STATUS_META: Record<RepairStatus, { label: string; tone: string }> = {
  received: { label: "Received", tone: "slate" },
  diagnosing: { label: "Diagnosing", tone: "blue" },
  awaiting_approval: { label: "Awaiting Approval", tone: "amber" },
  waiting_parts: { label: "Waiting for Parts", tone: "orange" },
  in_progress: { label: "Repair in Progress", tone: "violet" },
  quality_check: { label: "Quality Check", tone: "cyan" },
  ready: { label: "Ready for Collection", tone: "green" },
  completed: { label: "Completed", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "gray" },
  unrepairable: { label: "Unrepairable", tone: "gray" },
};

export const QUOTE_META: Record<QuoteStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "slate" },
  sent: { label: "Sent", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  expired: { label: "Expired", tone: "gray" },
};

/**
 * Allowed transitions and which roles may perform each.
 * "completed" is reachable only through the Collect Repair (payment) flow, never directly.
 */
export const TRANSITIONS: Record<RepairStatus, { to: RepairStatus; roles: Role[]; label: string }[]> = {
  received: [
    { to: "diagnosing", roles: ["owner", "technician"], label: "Start diagnosis" },
    { to: "cancelled", roles: ["owner"], label: "Cancel job" },
  ],
  diagnosing: [
    { to: "awaiting_approval", roles: ["owner", "technician", "cashier"], label: "Request customer approval" },
    { to: "unrepairable", roles: ["owner", "technician"], label: "Mark unrepairable" },
    { to: "cancelled", roles: ["owner"], label: "Cancel job" },
  ],
  awaiting_approval: [
    { to: "waiting_parts", roles: ["owner", "technician", "cashier"], label: "Approved — wait for parts" },
    { to: "in_progress", roles: ["owner", "technician"], label: "Approved — start repair" },
    { to: "ready", roles: ["owner", "cashier"], label: "Rejected — return device" },
    { to: "cancelled", roles: ["owner"], label: "Cancel job" },
  ],
  waiting_parts: [
    { to: "in_progress", roles: ["owner", "technician"], label: "Parts arrived — start repair" },
    { to: "cancelled", roles: ["owner"], label: "Cancel job" },
  ],
  in_progress: [
    { to: "quality_check", roles: ["owner", "technician"], label: "Submit for quality check" },
    { to: "waiting_parts", roles: ["owner", "technician"], label: "Waiting for parts" },
    { to: "awaiting_approval", roles: ["owner", "technician"], label: "Needs revised quotation" },
    { to: "cancelled", roles: ["owner"], label: "Cancel job" },
  ],
  quality_check: [
    { to: "ready", roles: ["owner", "technician"], label: "QC passed — ready for collection" },
    { to: "in_progress", roles: ["owner", "technician"], label: "QC failed — back to repair" },
  ],
  ready: [],
  unrepairable: [{ to: "ready", roles: ["owner", "cashier", "technician"], label: "Ready to return device" }],
  completed: [],
  cancelled: [],
};

export const OPEN_STATUSES: RepairStatus[] = [
  "received",
  "diagnosing",
  "awaiting_approval",
  "waiting_parts",
  "in_progress",
  "quality_check",
  "ready",
  "unrepairable",
];

export const TONE_CLASS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/40",
  blue: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/40",
  amber: "bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/40",
  orange: "bg-orange-50 text-orange-800 ring-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/40",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/40",
  cyan: "bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/40",
  green: "bg-green-50 text-green-800 ring-green-300 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/40",
  emerald: "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40",
  gray: "bg-zinc-100 text-zinc-600 ring-zinc-300 dark:bg-zinc-500/15 dark:text-zinc-400 dark:ring-zinc-500/40",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/40",
};
