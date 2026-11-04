export const TZ = "Asia/Kuala_Lumpur";

const rm = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format integer sen as "RM 1,234.50". */
export function money(sen: number): string {
  const neg = sen < 0;
  return `${neg ? "-" : ""}RM ${rm.format(Math.abs(sen) / 100)}`;
}

/** Parse a user-entered ringgit string ("12.9", "1,200") into integer sen. */
export function toSen(input: string | number): number {
  const n = typeof input === "number" ? input : parseFloat(String(input).replace(/[^0-9.\-]/g, ""));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function senToInput(sen: number): string {
  return (sen / 100).toFixed(2);
}

const dtFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const dFmt = new Intl.DateTimeFormat("en-MY", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const tFmt = new Intl.DateTimeFormat("en-MY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });

export const fmtDateTime = (iso: string) => dtFmt.format(new Date(iso));
export const fmtDate = (iso: string) => dFmt.format(new Date(iso));
export const fmtTime = (iso: string) => tFmt.format(new Date(iso));

const partsFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Malaysian calendar date key, "YYYY-MM-DD", for grouping by business day. */
export function myDateKey(iso: string | Date): string {
  return partsFmt.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** "YYMM" period in Malaysian time for document numbering. */
export function myPeriod(iso: string | Date): string {
  const k = myDateKey(iso);
  return k.slice(2, 4) + k.slice(5, 7);
}

export function relativeDays(iso: string, now = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export function uid(prefix = ""): string {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix + r.replace(/-/g, "").slice(0, 16);
}

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}
