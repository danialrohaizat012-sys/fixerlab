"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Wrench,
  Users,
  Package,
  ShieldCheck,
  BarChart3,
  UserCog,
  Settings,
  PlayCircle,
  Search,
  Moon,
  Sun,
  Menu,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  RotateCcw,
  ClipboardPlus,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { can, ROLE_LABEL, type Permission } from "@/lib/permissions";
import { cx, money } from "@/lib/format";
import { canViewJob } from "@/lib/services";
import { Modal, Button, StatusBadge } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  perm?: Permission;
  anyOf?: Permission[];
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Counter",
    items: [
      { href: "/", label: "Dashboard", icon: <LayoutDashboard className="size-[18px]" /> },
      { href: "/pos", label: "POS / Cashier", icon: <ShoppingCart className="size-[18px]" />, perm: "pos.sell" },
      { href: "/transactions", label: "Transactions", icon: <Receipt className="size-[18px]" />, perm: "sales.view" },
    ],
  },
  {
    group: "Service",
    items: [
      { href: "/repairs", label: "Repair Jobs", icon: <Wrench className="size-[18px]" /> },
      { href: "/repairs/new", label: "New Intake", icon: <ClipboardPlus className="size-[18px]" />, perm: "repair.create" },
      { href: "/customers", label: "Customers", icon: <Users className="size-[18px]" />, perm: "customers.view" },
      { href: "/warranty", label: "Warranty", icon: <ShieldCheck className="size-[18px]" />, perm: "warranty.manage" },
    ],
  },
  {
    group: "Manage",
    items: [
      { href: "/inventory", label: "Inventory", icon: <Package className="size-[18px]" />, perm: "inventory.view" },
      { href: "/reports", label: "Reports", icon: <BarChart3 className="size-[18px]" />, perm: "reports.view" },
      { href: "/staff", label: "Staff & Roles", icon: <UserCog className="size-[18px]" />, perm: "staff.manage" },
      { href: "/settings", label: "Settings", icon: <Settings className="size-[18px]" />, perm: "settings.edit" },
    ],
  },
  {
    group: "Demonstration",
    items: [{ href: "/demo", label: "Demo Scenarios", icon: <PlayCircle className="size-[18px]" /> }],
  },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/repairs") return path === "/repairs" || (path.startsWith("/repairs/") && path !== "/repairs/new");
  return path === href || path.startsWith(href + "/");
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/fixerlab-badge.png" alt="Fixerlab Putrajaya logo" className="size-10 shrink-0 rounded-full bg-white" />
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-[17px] font-bold tracking-[0.08em]">
            <span className="text-white">FIXER</span>
            <span className="text-[#e5333f]">LAB</span>
          </div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-sidebar-muted">POS & Repair</div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { me, db } = useStore();
  const readyCount = db.jobs.filter((j) => j.status === "ready").length;
  const myOpen = db.jobs.filter((j) => j.technicianId === me.id && !["completed", "cancelled", "ready"].includes(j.status)).length;
  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-ink" aria-label="Main">
      <div className="px-4 pb-4 pt-5">
        <Logo />
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(me.role, i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group} className="mt-4 first:mt-0">
              <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">{g.group}</div>
              {items.map((i) => {
                const active = isActive(path, i.href);
                const badge = i.href === "/repairs" ? (me.role === "technician" ? myOpen : readyCount) : 0;
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={onNavigate}
                    className={cx(
                      "relative mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-sidebar-active text-white" : "text-sidebar-ink/80 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[#e5333f]" />}
                    <span className={active ? "text-[#f04e59]" : "text-sidebar-muted"}>{i.icon}</span>
                    <span className="flex-1">{i.href === "/repairs" && me.role === "technician" ? "My Repair Jobs" : i.label}</span>
                    {badge > 0 && (
                      <span className="rounded-full bg-white/10 px-1.5 text-[11px] text-white" title={me.role === "technician" ? "Open jobs assigned to you" : "Ready for collection"}>
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-sidebar-muted">
        Prototype by <span className="font-semibold text-sidebar-ink">BinaLab</span>
        <br />
        All data shown is fictional sample data.
      </div>
    </nav>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string>("light");
  useEffect(() => setTheme(document.documentElement.dataset.theme || "light"), []);
  const toggle = () => {
    const t = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("fixerlab-theme", t);
    } catch {}
    setTheme(t);
  };
  return (
    <button onClick={toggle} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

function RoleSwitcher() {
  const { db, me, run } = useStore();
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="hidden text-xs text-ink-3 md:inline">Signed in as</span>
      <span className="relative">
        <select
          value={me.id}
          onChange={(e) => {
            const r = run((d) => {
              d.currentUserId = e.target.value;
              return d.staff.find((s) => s.id === e.target.value)!;
            }, (s) => `Now acting as ${s.name} (${ROLE_LABEL[s.role]})`);
            if (r.ok && r.value.role === "technician") router.push("/repairs");
          }}
          className="h-9 appearance-none rounded-lg border border-line-strong bg-surface py-0 pl-9 pr-8 text-sm font-medium"
          aria-label="Switch demo user"
        >
          {db.staff
            .filter((s) => s.active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {ROLE_LABEL[s.role]}
              </option>
            ))}
        </select>
        <span
          className={cx(
            "pointer-events-none absolute left-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-[11px] font-bold text-white",
            me.role === "owner" ? "bg-ink dark:bg-zinc-600" : me.role === "cashier" ? "bg-brand" : "bg-slate-500",
          )}
        >
          {me.name[0]}
        </span>
      </span>
    </label>
  );
}

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, me } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const digits = s.replace(/\D/g, "");
    const out: { href: string; title: string; sub: string; extra?: ReactNode }[] = [];
    if (can(me.role, "customers.view")) {
      for (const c of db.customers) {
        if (c.name.toLowerCase().includes(s) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits))) {
          out.push({ href: `/customers/${c.id}`, title: c.name, sub: `Customer · ${c.phone}` });
        }
      }
    }
    for (const j of db.jobs) {
      if (!canViewJob(me, j)) continue;
      const dev = db.devices.find((d) => d.id === j.deviceId);
      const cust = db.customers.find((c) => c.id === j.customerId);
      const hay = `${j.jobNo} ${dev?.brand} ${dev?.model} ${dev?.serial ?? ""} ${cust?.name}`.toLowerCase();
      if (hay.includes(s)) out.push({ href: `/repairs/${j.id}`, title: `${j.jobNo} · ${dev?.brand} ${dev?.model}`, sub: `Repair · ${cust?.name}`, extra: <StatusBadge status={j.status} /> });
    }
    if (can(me.role, "sales.view")) {
      for (const sa of db.sales) if (sa.receiptNo.toLowerCase().includes(s)) out.push({ href: `/transactions?r=${sa.id}`, title: sa.receiptNo, sub: `Receipt · ${money(sa.total)}` });
    }
    for (const it of db.items) {
      if (it.sku.toLowerCase().includes(s) || it.name.toLowerCase().includes(s) || it.barcode === s) {
        out.push({ href: `/inventory?item=${it.id}`, title: it.name, sub: `${it.type === "part" ? "Spare part" : "Product"} · ${it.sku} · ${it.stock} in stock` });
      }
    }
    return out.slice(0, 12);
  }, [q, db, me]);

  return (
    <Modal open={open} onClose={onClose} title="Search" size="lg">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Customer name or phone, job no., receipt no., SKU, device…"
          className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm focus:border-brand focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              router.push(results[0].href);
              onClose();
            }
          }}
        />
      </div>
      <ul className="mt-3 divide-y divide-line">
        {results.map((r) => (
          <li key={r.href + r.title}>
            <button
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-2"
              onClick={() => {
                router.push(r.href);
                onClose();
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.title}</span>
                <span className="block truncate text-xs text-ink-3">{r.sub}</span>
              </span>
              {r.extra}
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && !results.length && <li className="py-6 text-center text-sm text-ink-3">No matches.</li>}
      </ul>
    </Modal>
  );
}

function Toaster() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg",
            t.kind === "success" && "border-green-200 bg-white text-ink dark:border-green-500/30 dark:bg-zinc-900",
            t.kind === "error" && "border-red-300 bg-white text-ink dark:border-red-500/40 dark:bg-zinc-900",
            t.kind === "info" && "border-line bg-white text-ink dark:bg-zinc-900",
          )}
          role={t.kind === "error" ? "alert" : "status"}
        >
          {t.kind === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />}
          {t.kind === "error" && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />}
          {t.kind === "info" && <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { reset } = useStore();
  const path = usePathname();

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="border-b border-dashed border-amber-400/70 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        DEMONSTRATION PROTOTYPE · Fictional sample data · Data is stored only in this browser
        <button onClick={() => setConfirmReset(true)} className="ml-3 inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline">
          <RotateCcw className="size-3" /> Reset demo
        </button>
      </div>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5">
        <button className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <button
          onClick={() => setSearch(true)}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink-3 hover:border-line-strong sm:max-w-md"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">Search customers, jobs, receipts…</span>
          <kbd className="ml-auto hidden rounded border border-line bg-surface px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <RoleSwitcher />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5 lg:px-6">{children}</main>

      <GlobalSearch open={search} onClose={() => setSearch(false)} />
      <Toaster />
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Keep current data</Button>
            <Button
              variant="danger"
              icon={<RotateCcw className="size-4" />}
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">All transactions, jobs and changes made during this demo will be replaced with the original fictional sample data.</p>
      </Modal>
    </div>
  );
}
