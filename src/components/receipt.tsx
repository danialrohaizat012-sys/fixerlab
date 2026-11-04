"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import type { DbState, Sale } from "@/lib/types";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { saleBalance } from "@/lib/services";
import { Button, Modal } from "./ui";

function Row({ l, r, bold }: { l: React.ReactNode; r: React.ReactNode; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: bold ? 700 : 400 }}>
      <span>{l}</span>
      <span style={{ whiteSpace: "nowrap" }}>{r}</span>
    </div>
  );
}

export function ReceiptBody({ db, sale }: { db: DbState; sale: Sale }) {
  const s = db.settings;
  const cashier = db.staff.find((x) => x.id === sale.cashierId);
  const cust = sale.customerId ? db.customers.find((c) => c.id === sale.customerId) : undefined;
  const job = sale.repairJobId ? db.jobs.find((j) => j.id === sale.repairJobId) : undefined;
  const device = job ? db.devices.find((d) => d.id === job.deviceId) : undefined;
  const pays = db.payments.filter((p) => p.saleId === sale.id).sort((a, b) => a.at.localeCompare(b.at));
  const refunds = db.refunds.filter((r) => r.saleId === sale.id);
  const warranty = db.warranties.find((w) => w.saleId === sale.id);
  const rule = warranty ? db.warrantyRules.find((r) => r.id === warranty.ruleId) : undefined;
  const method = (id: string) => s.paymentMethods.find((m) => m.id === id)?.name ?? id;
  const bal = saleBalance(db, sale);

  return (
    <div className="receipt">
      <div style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/fixerlab-badge-mono.png" alt="" style={{ width: 56, height: 56, margin: "0 auto 4px", display: "block" }} />
        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.businessName.toUpperCase()}</div>
        {s.branchName && <div>{s.branchName}</div>}
        <div style={{ whiteSpace: "pre-line" }}>{s.address}</div>
        <div>{s.phone}</div>
      </div>
      <hr />
      <div style={{ textAlign: "center", fontWeight: 700 }}>{sale.kind === "repair" ? "REPAIR INVOICE / RECEIPT" : "SALES RECEIPT"}</div>
      <div style={{ textAlign: "center", fontSize: 10 }}>*** DEMONSTRATION — NOT A VALID RECEIPT ***</div>
      <hr />
      <Row l="Receipt No" r={sale.receiptNo} />
      <Row l="Date" r={fmtDateTime(sale.at)} />
      <Row l="Cashier" r={cashier?.name ?? "—"} />
      {cust && <Row l="Customer" r={cust.name} />}
      {job && <Row l="Job Ref" r={job.jobNo} />}
      {device && <Row l="Device" r={`${device.brand} ${device.model}`} />}
      <hr />
      {sale.lines.map((l) => (
        <div key={l.id} style={{ marginBottom: 3 }}>
          <div>
            {l.description}
            {l.type === "labour" ? " (labour)" : ""}
          </div>
          <Row l={`  ${l.qty} x ${money(l.unitPrice).replace("RM ", "")}`} r={money(l.qty * l.unitPrice).replace("RM ", "")} />
          {l.refundedQty > 0 && <div style={{ fontSize: 10 }}>  Refunded qty: {l.refundedQty}</div>}
        </div>
      ))}
      <hr />
      <Row l="Subtotal" r={money(sale.subtotal)} />
      {sale.discount > 0 && <Row l="Discount" r={`-${money(sale.discount)}`} />}
      {(s.taxEnabled || sale.tax > 0) && <Row l={`${s.taxLabel}${s.taxRatePct ? ` (${s.taxRatePct}%)` : ""}`} r={money(sale.tax)} />}
      <Row l="TOTAL" r={money(sale.total)} bold />
      <hr />
      {pays.map((p) => (
        <div key={p.id}>
          <Row
            l={p.kind === "deposit" ? `Deposit (${method(p.methodId)}) ${fmtDate(p.at)}` : p.kind === "refund" ? `Refund (${method(p.methodId)})` : method(p.methodId)}
            r={`${p.kind === "refund" ? "-" : ""}${money(p.amount)}`}
          />
          {p.tendered !== undefined && p.tendered > p.amount && (
            <>
              <Row l="  Tendered" r={money(p.tendered)} />
              <Row l="  Change" r={money(p.tendered - p.amount)} />
            </>
          )}
          {p.reference && <div style={{ fontSize: 10 }}>  Ref: {p.reference}</div>}
        </div>
      ))}
      {refunds.map((r) => (
        <div key={r.id} style={{ fontSize: 10 }}>
          {r.refundNo} — {r.reason}
        </div>
      ))}
      {bal > 0 && <Row l="BALANCE DUE" r={money(bal)} bold />}
      {warranty && (
        <>
          <hr />
          <div style={{ fontWeight: 700 }}>WARRANTY {warranty.warrantyNo}</div>
          <div>{rule?.name}</div>
          <div>Valid until {fmtDate(warranty.endsOn)}</div>
          <div style={{ fontSize: 10 }}>{warranty.coverage}</div>
        </>
      )}
      <hr />
      <div style={{ textAlign: "center", whiteSpace: "pre-line" }}>{s.receiptFooter}</div>
      <div style={{ textAlign: "center", fontSize: 9, marginTop: 6 }}>Powered by BinaLab</div>
    </div>
  );
}

/** Mounts content into #print-root while open, so window.print() prints only the receipt. */
export function PrintPortal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("print-root")), []);
  return el ? createPortal(children, el) : null;
}

export function ReceiptModal({ db, sale, open, onClose, footer }: { db: DbState; sale?: Sale; open: boolean; onClose: () => void; footer?: React.ReactNode }) {
  if (!sale) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Receipt ${sale.receiptNo}`}
      size="sm"
      footer={
        <>
          {footer}
          <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Print (80mm)
          </Button>
        </>
      }
    >
      <div className="rounded-lg bg-zinc-100 py-3 dark:bg-zinc-800">
        <div className="mx-auto w-fit shadow-md">
          <ReceiptBody db={db} sale={sale} />
        </div>
      </div>
      {open && (
        <PrintPortal>
          <ReceiptBody db={db} sale={sale} />
        </PrintPortal>
      )}
    </Modal>
  );
}
