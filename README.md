# Fixerlab Solutions — Cashier POS & Repair Management System

Demonstration prototype developed by **BinaLab** for Fixerlab Solutions, an electronic device repair and retail business in Putrajaya, Malaysia.

> **Fixerlab is a repair-only business.** Retail product sales are switched **off** by default (Settings → Business type). The cashier handles repair collections, and inventory holds spare parts only. The retail module remains available behind that switch if Fixerlab later sells accessories.

> **Status:** Phase 2 — Interactive prototype. All data is **fictional sample data** stored only in the viewer's browser. No real payment gateway, database or client system is connected.

## What's in the prototype

| Module | Highlights |
|---|---|
| **Dashboard** | Today's / monthly repair revenue, active repairs, pending approvals, ready for collection, low-stock parts, outstanding balances, 14-day revenue chart |
| **Cashier (Collect Repair)** | Final invoice from the approved quotation, deposits applied, split payments, cash change, idempotent submission, warranty issued, 80mm receipt, job completed |
| **Retail POS (off by default)** | Barcode/SKU search, cart, discounts with owner PIN override — only shown if retail sales are enabled in Settings |
| **Repair jobs** | Intake form (customer lookup by phone, device, accessories, condition, photos, deposit), kanban board + list, status workflow with enforced transitions, full timeline, intake slip print |
| **Quotations** | Versioned (v1, v2…), draft → sent → approved/rejected/expired, explicit approval record (channel, who, when), clearly-labelled simulated approval |
| **Inventory** | Repair spare parts, add/edit/deactivate, receive & adjust stock, movement ledger, low-stock alerts, no negative stock unless allowed |
| **Customers** | Search by name/phone, purchase & repair history, devices, outstanding balance, warranty |
| **Warranty** | Records created at collection from configurable rules, claims with owner decision |
| **Reports** | Daily repair revenue, payment methods, average invoice, job volume, technician workload, inventory movement, gross profit estimate |
| **Staff & roles** | Owner / Cashier / Technician permission matrix, discount limits, activate/deactivate |
| **Settings** | Business info, receipt footer, tax (off by default), payment methods, categories, numbering prefixes, repair policies, warranty rules |
| **Demo scenarios** | Guided walkthroughs: iPhone screen replacement and PS5 overheating, with live progress and fast-forward (the retail scenario appears only if retail is enabled) |

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use **Reset demo** in the top banner to restore the original sample data.

Demo staff (switch from the top bar): **Aiman** (Owner, PIN 1234), **Sofia** (Cashier), **Haziq** and **Mei Ling** (Technicians).

## Business rules enforced

- Every action goes through a service layer (`src/lib/services.ts`) that checks the acting user's permissions — UI hiding is never the only guard. These functions map one-to-one to the Postgres functions planned for Supabase.
- Unique, never-reused document numbers: `RCP-YYMM-00001`, `JOB-`, `QUO-` (with `-v2` revisions), `WTY-`, `RFD-`.
- Duplicate submissions are blocked with an idempotency key per checkout.
- Stock is changed only through ledger movements (sale, repair use/return, refund restock, adjustment, receipt).
- Repair revenue is recognised once, on the repair invoice at collection; deposits are applied, not double-counted.
- Completing a repair does not mark it paid; collection with a balance is a configurable owner policy.
- Customer approval is required before a repair proceeds; QC can require a different person than the technician.
- Refunds require owner authorisation and a reason; they are new records, never edits.
- Device passcodes/passwords are rejected if typed into notes.
- Malaysian time (Asia/Kuala_Lumpur) and MYR throughout; money stored as integer sen.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · lucide-react. Deployed on Vercel.

## Project structure

```
src/
  app/            Pages (dashboard, pos, transactions, repairs, customers, inventory, warranty, reports, staff, settings, demo)
  components/     Shell, UI kit, receipt (80mm), payment panel, charts
  lib/
    types.ts        Domain model
    services.ts     Business logic + permission checks (future Supabase RPCs)
    permissions.ts  Role → permission matrix
    seed.ts         Fictional sample data
    store.tsx       Browser persistence (localStorage) for the demo
    demo.ts         Scenario definitions + fast-forward
docs/PHASE-1-PLAN.md   Requirements, architecture, database design, questions for Fixerlab
```

## Next phase (after client approval)

Dedicated Supabase project (Postgres + Auth + Storage, `ap-southeast-1`), RLS policies and RPC functions as designed in [`docs/PHASE-1-PLAN.md`](docs/PHASE-1-PLAN.md), real staff accounts, data migration, security testing, UAT and staff training.
