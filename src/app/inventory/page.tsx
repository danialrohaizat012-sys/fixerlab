"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, PackagePlus, Pencil, Search, SlidersHorizontal } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { adjustStock, saveItem } from "@/lib/services";
import { cx, fmtDateTime, money, senToInput, toSen } from "@/lib/format";
import type { Item, ItemType, MovementReason } from "@/lib/types";
import { Badge, Button, Card, Denied, Field, Input, Modal, Notice, PageHeader, Select, Table, Tabs, Textarea, td, th } from "@/components/ui";

const REASON_LABEL: Record<MovementReason, string> = {
  opening: "Opening stock",
  sale: "Sale",
  repair_use: "Used in repair",
  repair_return: "Returned from repair",
  refund_restock: "Refund restock",
  adjustment: "Adjustment",
  receive: "Stock received",
};

type Tab = "retail" | "part" | "movements";

export default function InventoryPage() {
  const { db, me } = useStore();
  const [tab, setTab] = useState<Tab>("retail");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [low, setLow] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [edit, setEdit] = useState<Item | "new">();
  const [adjust, setAdjust] = useState<Item>();
  const [history, setHistory] = useState<Item>();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("low")) setLow(true);
    const it = p.get("item");
    if (it) {
      const found = db.items.find((i) => i.id === it);
      if (found) {
        setTab(found.type);
        setQ(found.sku);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showCost = can(me.role, "inventory.cost.view");
  const rows = useMemo(() => {
    if (tab === "movements") return [];
    const s = q.trim().toLowerCase();
    return db.items.filter(
      (i) =>
        i.type === tab &&
        (inactive || i.active) &&
        (!cat || i.category === cat) &&
        (!low || i.stock <= i.minStock) &&
        (!s || i.name.toLowerCase().includes(s) || i.sku.toLowerCase().includes(s) || i.barcode === s),
    );
  }, [db.items, tab, q, cat, low, inactive]);

  if (!can(me.role, "inventory.view")) return <Denied what="view inventory" />;
  const cats = tab === "part" ? db.settings.partCategories : db.settings.retailCategories;
  const lowCount = (t: ItemType) => db.items.filter((i) => i.type === t && i.active && i.stock <= i.minStock).length;
  const stockValue = rows.reduce((a, i) => a + i.cost * Math.max(0, i.stock), 0);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Retail products and repair spare parts. Every stock change is recorded in the movement ledger."
        actions={
          can(me.role, "inventory.edit") && (
            <Button variant="primary" icon={<PackagePlus className="size-4" />} onClick={() => setEdit("new")}>
              Add item
            </Button>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          setCat("");
        }}
        tabs={[
          { id: "retail", label: <>Retail products {lowCount("retail") > 0 && <AlertTriangle className="size-3.5 text-amber-600" />}</>, count: db.items.filter((i) => i.type === "retail" && i.active).length },
          { id: "part", label: <>Spare parts {lowCount("part") > 0 && <AlertTriangle className="size-3.5 text-amber-600" />}</>, count: db.items.filter((i) => i.type === "part" && i.active).length },
          { id: "movements", label: "Stock movements" },
        ]}
      />
      {tab === "movements" ? (
        <Movements />
      ) : (
        <>
          <div className="my-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, SKU or barcode" className="pl-9" />
            </div>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto">
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock only
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Show inactive
            </label>
            {showCost && <span className="ml-auto text-sm text-ink-3">Stock value at cost: <span className="num font-semibold text-ink">{money(stockValue)}</span></span>}
          </div>
          <Card>
            <Table>
              <thead>
                <tr>
                  <th className={th}>SKU</th>
                  <th className={th}>Name</th>
                  <th className={th}>Category</th>
                  {showCost && <th className={cx(th, "text-right")}>Cost</th>}
                  <th className={cx(th, "text-right")}>Price</th>
                  <th className={cx(th, "text-right")}>Stock</th>
                  <th className={cx(th, "text-right")}>Min</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const isLow = i.stock <= i.minStock;
                  return (
                    <tr key={i.id} className={cx(!i.active && "opacity-50")}>
                      <td className={cx(td, "font-mono text-xs")}>{i.sku}</td>
                      <td className={td}>
                        <span className="font-medium">{i.name}</span>
                        {!i.active && <Badge tone="gray" className="ml-2">Inactive</Badge>}
                      </td>
                      <td className={cx(td, "text-ink-2")}>{i.category}</td>
                      {showCost && <td className={cx(td, "num text-right text-ink-2")}>{money(i.cost)}</td>}
                      <td className={cx(td, "num text-right")}>{money(i.price)}</td>
                      <td className={cx(td, "num text-right")}>
                        <span className={cx("inline-flex items-center gap-1 font-semibold", i.stock <= 0 ? "text-red-600" : isLow ? "text-amber-700 dark:text-amber-300" : "")}>
                          {isLow && <AlertTriangle className="size-3.5" />}
                          {i.stock}
                        </span>
                      </td>
                      <td className={cx(td, "num text-right text-ink-3")}>{i.minStock}</td>
                      <td className={cx(td, "whitespace-nowrap text-right")}>
                        <button className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" title="Movement history" onClick={() => setHistory(i)}>
                          <History className="size-4" />
                        </button>
                        {can(me.role, "inventory.adjust") && (
                          <button className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" title="Adjust / receive stock" onClick={() => setAdjust(i)}>
                            <SlidersHorizontal className="size-4" />
                          </button>
                        )}
                        {can(me.role, "inventory.edit") && (
                          <button className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" title="Edit item" onClick={() => setEdit(i)}>
                            <Pencil className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-sm text-ink-3">
                      No items match.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </>
      )}
      {edit && <ItemDialog item={edit === "new" ? undefined : edit} defaultType={tab === "part" ? "part" : "retail"} onClose={() => setEdit(undefined)} />}
      {adjust && <AdjustDialog item={adjust} onClose={() => setAdjust(undefined)} />}
      {history && <HistoryDialog item={history} onClose={() => setHistory(undefined)} />}
    </div>
  );
}

function Movements() {
  const { db } = useStore();
  const [reason, setReason] = useState("");
  const rows = db.movements.filter((m) => !reason || m.reason === reason).slice(0, 200);
  return (
    <div className="mt-4">
      <Select value={reason} onChange={(e) => setReason(e.target.value)} className="mb-3 w-auto">
        <option value="">All movement types</option>
        {Object.entries(REASON_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
      <Card>
        <Table>
          <thead>
            <tr>
              <th className={th}>Date / time</th>
              <th className={th}>Item</th>
              <th className={th}>Type</th>
              <th className={th}>Reference</th>
              <th className={cx(th, "text-right")}>Qty</th>
              <th className={cx(th, "text-right")}>Balance</th>
              <th className={th}>By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const it = db.items.find((i) => i.id === m.itemId);
              return (
                <tr key={m.id}>
                  <td className={cx(td, "whitespace-nowrap text-ink-2")}>{fmtDateTime(m.at)}</td>
                  <td className={td}>
                    {it?.name} <span className="font-mono text-xs text-ink-3">{it?.sku}</span>
                  </td>
                  <td className={td}>
                    <Badge tone={m.qty > 0 ? "green" : "slate"}>{REASON_LABEL[m.reason]}</Badge>
                  </td>
                  <td className={cx(td, "font-mono text-xs text-ink-2")}>{m.refNo ?? m.note ?? "—"}</td>
                  <td className={cx(td, "num text-right font-semibold", m.qty > 0 ? "text-green-700 dark:text-green-400" : "")}>
                    {m.qty > 0 ? "+" : ""}
                    {m.qty}
                  </td>
                  <td className={cx(td, "num text-right")}>{m.balanceAfter}</td>
                  <td className={td}>{db.staff.find((s) => s.id === m.actorId)?.name}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function ItemDialog({ item, defaultType, onClose }: { item?: Item; defaultType: ItemType; onClose: () => void }) {
  const { db, run } = useStore();
  const [f, setF] = useState({
    type: item?.type ?? defaultType,
    sku: item?.sku ?? "",
    barcode: item?.barcode ?? "",
    name: item?.name ?? "",
    category: item?.category ?? "",
    cost: item ? senToInput(item.cost) : "",
    price: item ? senToInput(item.price) : "",
    minStock: String(item?.minStock ?? 2),
    opening: "0",
    allowNegative: item?.allowNegative ?? false,
    active: item?.active ?? true,
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const cats = f.type === "part" ? db.settings.partCategories : db.settings.retailCategories;
  const margin = toSen(f.price) - toSen(f.cost);
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${item.sku}` : "Add item"}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const r = run(
                (d) =>
                  saveItem(d, {
                    id: item?.id,
                    type: f.type,
                    sku: f.sku,
                    barcode: f.barcode || undefined,
                    name: f.name,
                    category: f.category || cats[0],
                    cost: toSen(f.cost),
                    price: toSen(f.price),
                    minStock: parseInt(f.minStock, 10) || 0,
                    allowNegative: f.allowNegative,
                    active: f.active,
                    openingStock: item ? undefined : parseInt(f.opening, 10) || 0,
                  }),
                "Item saved",
              );
              if (r.ok) onClose();
            }}
          >
            Save item
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <Select value={f.type} onChange={(e) => set({ type: e.target.value as ItemType, category: "" })} disabled={!!item}>
            <option value="retail">Retail product</option>
            <option value="part">Repair spare part</option>
          </Select>
        </Field>
        <Field label="Category">
          <Select value={f.category || cats[0]} onChange={(e) => set({ category: e.target.value })}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="SKU" required>
          <Input value={f.sku} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} className="font-mono" />
        </Field>
        <Field label="Barcode (optional)">
          <Input value={f.barcode} onChange={(e) => set({ barcode: e.target.value })} className="font-mono" />
        </Field>
        <Field label="Cost price (RM)">
          <Input inputMode="decimal" value={f.cost} onChange={(e) => set({ cost: e.target.value })} className="num text-right" />
        </Field>
        <Field label="Selling price (RM)" hint={toSen(f.price) ? `Margin ${money(margin)} (${((margin / toSen(f.price)) * 100).toFixed(0)}%)` : undefined}>
          <Input inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} className="num text-right" />
        </Field>
        <Field label="Minimum stock threshold">
          <Input inputMode="numeric" value={f.minStock} onChange={(e) => set({ minStock: e.target.value.replace(/\D/g, "") })} className="num" />
        </Field>
        {!item && (
          <Field label="Opening stock">
            <Input inputMode="numeric" value={f.opening} onChange={(e) => set({ opening: e.target.value.replace(/\D/g, "") })} className="num" />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.allowNegative} onChange={(e) => set({ allowNegative: e.target.checked })} />
          Allow negative stock (e.g. sell before stock is received) — off by default
        </label>
        {item && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
            Active (inactive items are hidden from POS and quotations; history is kept)
          </label>
        )}
      </div>
      {item && <p className="mt-3 text-xs text-ink-3">Stock quantity changes only through adjustments, receipts, sales and repairs — never by editing the item.</p>}
    </Modal>
  );
}

function AdjustDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { run } = useStore();
  const [mode, setMode] = useState<"receive" | "adjustment">("receive");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const n = parseInt(qty, 10) || 0;
  const after = item.stock + n;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Stock — ${item.name}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!n || !note.trim()} onClick={() => run((d) => adjustStock(d, item.id, n, mode, note), "Stock updated").ok && onClose()}>
            Save
          </Button>
        </>
      }
    >
      <div className="mb-3 inline-flex rounded-lg border border-line p-0.5">
        {(["receive", "adjustment"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={cx("rounded-md px-3 py-1 text-sm", mode === m ? "bg-ink text-surface" : "text-ink-2")}>
            {m === "receive" ? "Receive stock" : "Adjust (count / damage)"}
          </button>
        ))}
      </div>
      <Field label={mode === "receive" ? "Quantity received" : "Change (+ or −)"} hint={`Current ${item.stock} → after ${after}`}>
        <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(mode === "receive" ? /[^0-9]/g : /[^0-9-]/g, ""))} className="num" autoFocus />
      </Field>
      <Field label="Note (required)" className="mt-3">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "receive" ? "Supplier / invoice ref." : "e.g. Stock count variance, damaged unit"} className="min-h-14" />
      </Field>
      {after < 0 && !item.allowNegative && <Notice tone="warn">Stock cannot go below zero for this item.</Notice>}
    </Modal>
  );
}

function HistoryDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { db } = useStore();
  const rows = db.movements.filter((m) => m.itemId === item.id);
  return (
    <Modal open onClose={onClose} title={`Movement history — ${item.sku}`} size="lg">
      <ul className="divide-y divide-line text-sm">
        {rows.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <span className="w-36 shrink-0 text-xs text-ink-3">{fmtDateTime(m.at)}</span>
            <span className="flex-1">
              {REASON_LABEL[m.reason]} <span className="font-mono text-xs text-ink-3">{m.refNo ?? m.note ?? ""}</span>
            </span>
            <span className={cx("num w-12 text-right font-semibold", m.qty > 0 && "text-green-700 dark:text-green-400")}>
              {m.qty > 0 ? "+" : ""}
              {m.qty}
            </span>
            <span className="num w-12 text-right text-ink-3">{m.balanceAfter}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
