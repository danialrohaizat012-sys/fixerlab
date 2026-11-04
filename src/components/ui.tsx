"use client";

import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { X, Lock, Info } from "lucide-react";
import { cx } from "@/lib/format";
import { STATUS_META, QUOTE_META, TONE_CLASS } from "@/lib/repair-meta";
import type { QuoteStatus, RepairStatus } from "@/lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode }>(
  function Button({ variant = "secondary", size = "md", icon, className, children, type = "button", ...p }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx(
          "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" && "h-8 px-3 text-[13px]",
          size === "md" && "h-10 px-4 text-sm",
          size === "lg" && "h-12 px-5 text-base",
          variant === "primary" && "bg-brand text-brand-ink shadow-sm hover:bg-brand-hover",
          variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-surface-2",
          variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
          variant === "dark" && "bg-ink text-surface hover:opacity-90",
          // Destructive actions: outlined + icon + confirmation — never colour alone.
          variant === "danger" && "border border-red-300 bg-surface text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10",
          className,
        )}
        {...p}
      >
        {icon}
        {children}
      </button>
    );
  },
);

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)} {...p}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-ink-3">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ tone = "slate", children, className }: { tone?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: RepairStatus }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {m.label}
    </Badge>
  );
}

export function QuoteBadge({ status }: { status: QuoteStatus }) {
  const m = QUOTE_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function SampleChip() {
  return (
    <span className="rounded border border-dashed border-amber-400 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300" title="Fictional sample record">
      Sample
    </span>
  );
}

export function Field({ label, hint, children, required, className }: { label: string; hint?: ReactNode; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="text-brand"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

const inputCls =
  "rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputCls, "h-10", !/(^|\s)w-/.test(className ?? "") && "w-full", className)} {...p} />;
});

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, "h-10 pr-8", !/(^|\s)w-/.test(className ?? "") && "w-full", className)} {...p}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, "w-full min-h-20 py-2", className)} {...p} />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => panel.current?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        className={cx(
          "relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl",
          size === "xl" && "sm:max-w-4xl",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function Denied({ what }: { what: string }) {
  return (
    <Card>
      <EmptyState icon={<Lock className="size-8" />} title="Access restricted">
        Your role does not have permission to {what}. Switch role from the top bar to explore (demo).
      </EmptyState>
    </Card>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "demo" }) {
  return (
    <div
      className={cx(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]",
        tone === "info" && "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
        tone === "warn" && "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
        tone === "demo" && "border-dashed border-amber-400 bg-amber-50/60 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/5 dark:text-amber-200",
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="scroll-thin -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            value === t.id ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-surface-2 px-1.5 text-xs text-ink-3 ring-1 ring-line">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap";
export const td = "px-3 py-2.5 align-middle";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("scroll-thin overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-line [&_tbody_tr:hover]:bg-surface-2/70">{children}</table>
    </div>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-ink-3">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
