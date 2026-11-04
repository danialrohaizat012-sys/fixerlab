"use client";

import { useState } from "react";
import { money } from "@/lib/format";

/**
 * Stacked daily revenue bars (retail + repair). Two series → legend always shown;
 * tooltip on hover/focus; values stay in text ink, never series colour.
 */
export function RevenueBars({ data, height = 200 }: { data: { key: string; retail: number; repair: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.retail + d.repair));
  const nice = niceMax(max);
  const ticks = [0, nice / 2, nice];
  const h = hover !== null ? data[hover] : null;
  const label = (k: string) => {
    const d = new Date(k + "T00:00:00");
    return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--chart-1)" }} /> Retail
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--chart-2)" }} /> Repair
        </span>
        <span className="ml-auto min-h-4 text-ink-2">
          {h ? (
            <>
              <span className="font-medium text-ink">{label(h.key)}</span> · Retail <span className="num">{money(h.retail)}</span> · Repair{" "}
              <span className="num">{money(h.repair)}</span> · Total <span className="num font-semibold text-ink">{money(h.retail + h.repair)}</span>
            </>
          ) : (
            <span className="text-ink-3">Hover a bar for details</span>
          )}
        </span>
      </div>
      <div className="relative flex gap-2">
        <div className="flex w-12 shrink-0 flex-col justify-between text-right text-[10.5px] text-ink-3" style={{ height }}>
          {[...ticks].reverse().map((t) => (
            <span key={t} className="num -translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {t >= 100000 ? `${(t / 100000).toFixed(t % 100000 ? 1 : 0)}k` : (t / 100).toFixed(0)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className="border-t border-line" />
            ))}
          </div>
          <div className="relative flex items-end gap-[3px]" style={{ height }} role="img" aria-label="Daily revenue, retail and repair">
            {data.map((d, i) => {
              const rh = (d.retail / nice) * height;
              const ph = (d.repair / nice) * height;
              return (
                <button
                  key={d.key}
                  className="group flex h-full flex-1 flex-col justify-end focus:outline-none"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${label(d.key)}: retail ${money(d.retail)}, repair ${money(d.repair)}`}
                >
                  <span className={`flex flex-col justify-end gap-[2px] ${hover === i ? "opacity-100" : hover !== null ? "opacity-60" : ""}`}>
                    {ph > 0 && <span className="block rounded-t-[4px]" style={{ height: Math.max(2, ph), background: "var(--chart-2)" }} />}
                    {rh > 0 && <span className={`block ${ph > 0 ? "" : "rounded-t-[4px]"}`} style={{ height: Math.max(2, rh), background: "var(--chart-1)" }} />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-[3px] text-[10px] text-ink-3">
            {data.map((d, i) => (
              <span key={d.key} className="flex-1 text-center">
                {i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? label(d.key) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * exp;
}

/** Horizontal single-series bars for a ranked breakdown. */
export function HBars({ rows, format = money }: { rows: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}`}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="text-ink-2">{r.label}</span>
            <span className="num font-medium">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%`, background: "var(--chart-1)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
