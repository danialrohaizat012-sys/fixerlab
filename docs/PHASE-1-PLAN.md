# Fixerlab Solutions — Phase 1 Product Plan

**Cashier POS & Repair Management System** · Developed by BinaLab
**Status:** Awaiting approval before implementation

---

## 1. Understanding of Fixerlab's business

Fixerlab runs two fundamentally different businesses through one counter:

| | Retail | Repair |
|---|---|---|
| Duration | Seconds | Days to weeks |
| What's sold | A stocked item | Labour, parts and expertise |
| Price known upfront? | Yes | No — set after diagnosis and requires customer approval |
| Money flow | Paid once, immediately | Deposit, then balance; sometimes diagnosis fee only |
| Stock impact | Item leaves on sale | Parts consumed during repair, not when the customer pays |
| Risk | Low | Customer property held on premises, condition disputes, warranty claims |

The system must keep the counter fast for retail while making repairs **traceable** — every device, status change, part and payment accountable to a person and a time. Most repair-shop disputes are about state ("it wasn't scratched when I dropped it off", "I never approved that price"), so intake records, approval records and the timeline are core features.

Note: the badge logo reads **"Fixerlab Putrajaya"**, implying a branch-based business (see open questions).

---

## 2. Recommended system modules

| # | Module | Priority | Notes |
|---|---|---|---|
| A | **POS / Cashier** | Core | Retail sales, repair collection payments, receipts, refunds |
| B | **Repair Jobs** | Core | Intake, job board, status machine, timeline, photos, parts used |
| C | **Quotations** | Core (minimal in first build) | Versioned, explicit approval record |
| D | **Inventory** | Core | One item table split by type (retail / part); movement ledger |
| E | **Customers & Devices** | Core | Profiles, devices, purchase + repair history, outstanding balance |
| F | **Warranty** | Phase 3 | Rules, records, claims linked to the original job |
| G | **Dashboard & Reports** | Dashboard core, reports Phase 3 | |
| H | **Staff & Permissions** | Phase 3 (simulated earlier) | Owner, Cashier, Technician |
| — | **Settings** | Partial | Business info, payment methods, tax, numbering, receipt footer |
| — | **Audit Log** | Built in from the start | Discounts, refunds, stock adjustments, status overrides |

---

## 3. Navigation structure

```
Sidebar (collapsible; icon rail on tablet; bottom tabs on mobile)

├─ Dashboard
├─ POS ................................ [Owner, Cashier]
│   ├─ New Sale
│   └─ Collect Repair (scan/enter job no. → pay balance)
├─ Transactions ....................... [Owner, Cashier]
│   ├─ History (filter by date, cashier, method, retail/repair)
│   └─ Refunds (Owner-authorised)
├─ Repairs
│   ├─ Job Board (kanban by status + list view)
│   ├─ New Intake ..................... [Owner, Cashier]
│   ├─ My Jobs ........................ [Technician landing page]
│   └─ Job Detail (tabs)
│        Overview · Diagnosis · Quotation · Parts & Labour ·
│        Payments · Photos · Timeline · Warranty
├─ Quotations (all quotes, by status)
├─ Customers
│   └─ Profile: Contact · Devices · Repairs · Purchases · Balance · Warranty
├─ Inventory
│   ├─ Retail Products
│   ├─ Spare Parts
│   ├─ Stock Movements (ledger)
│   ├─ Stock Adjustment ............... [Owner]
│   └─ Low Stock
├─ Warranty
│   ├─ Records
│   └─ Claims
├─ Reports ............................ [Owner]
├─ Staff .............................. [Owner]
└─ Settings ........................... [Owner]

Top bar: global search (Ctrl+K: customer, phone, job no., receipt no., SKU),
         theme toggle, signed-in user.
Demo only: role switcher + permanent "DEMONSTRATION · SAMPLE DATA" banner.
```

---

## 4. Cashier workflow

### Retail sale (Scenario A)

```
Scan barcode / search / tap product
  → Cart (qty ±, remove line)
  → Discount? ── above cashier limit ──→ Owner PIN override (logged)
  → [Charge]  (F9)
  → Payment method: Cash (tendered → change) | DuitNow QR |
                    Bank transfer | Card | Other (configurable)
     Split payment supported
  → [Complete] → ONE atomic server transaction:
        receipt no. allocated · sale + lines written ·
        payment(s) written · stock deducted · movement ledger rows
  → 80mm receipt preview → Print / New sale
```

### Repair collection (Scenarios B and C)

```
POS → Collect Repair → enter/scan JOB-xxxx
  → Final invoice built from APPROVED quotation + recorded parts/labour
  → Deposits already paid shown as credits → balance due
  → Pay balance → receipt → job may move to "Completed" (collected)
```

### Safeguards

- **No double submission:** Charge button locks on first press; each checkout carries an idempotency key enforced unique in the database. A retry returns the original receipt.
- **Price snapshots:** sale lines store price and cost at time of sale.
- **Refunds:** Owner only, with reason; line-level or full; optional restock. Recorded as new records — the original sale is never edited.

---

## 5. Repair job workflow

```
          ┌──────────── Cancelled (any open stage, reason required)
          │
Received → Diagnosing → Awaiting Customer Approval ─┬→ Waiting for Parts ─┐
                              │                     └→ Repair in Progress ←┘
                              │ rejected                    │
                              ▼                             ▼
                      Ready for Collection*           Quality Check ── fail ──┐
                     (*return unrepaired,                   │ pass           │
                      diagnosis fee if                      ▼                │
                      configured)               Ready for Collection     back to
                                                            │            Repair in
                              Unrepairable ──→ Ready for    ▼            Progress
                              (from Diagnosing)  Collection  Completed (= collected)
```

### Rules enforced server-side

1. Only **allowed transitions** are accepted.
2. **Every** transition writes a timeline row: from, to, who, when, note.
3. A job leaves **Awaiting Customer Approval** towards repair only if an **approval record** exists (who approved, channel, when, recorded by). In the demo: a button labelled **"Simulate customer approval (demo)"**.
4. Cost exceeding the approved quotation requires a **new quotation version** and returns the job to Awaiting Approval.
5. **Parts used** create a `repair_use` stock movement in one DB transaction; fails if stock would go negative unless the item allows it. Corrections are reversing movements — nothing is deleted.
6. **Completed = collected, not paid.** Payment status is separate (Unpaid / Deposit Paid / Paid / Written-off). Whether collection with an outstanding balance is allowed is an Owner setting.
7. Technicians submit to **Quality Check**; QC pass may require a different person (configurable).

### Responsibilities

| Step | Cashier | Technician | Owner |
|---|---|---|---|
| Intake / register device | ✅ | — | ✅ |
| Diagnosis, notes | — | ✅ (own jobs) | ✅ |
| Create / send quotation | ✅ | ✅ draft | ✅ |
| Record customer approval | ✅ | — | ✅ |
| Record parts used | — | ✅ (own jobs) | ✅ |
| QC pass / fail | — | configurable | ✅ |
| Payment, collection | ✅ | — | ✅ |
| Cancel job, override status | — | — | ✅ |

---

## 6. Proposed database architecture (Supabase Postgres)

### Principles

- **Money stored as integer sen** (`bigint`): RM12.90 → `1290`.
- **Timestamps** as `timestamptz` (UTC), displayed in **Asia/Kuala_Lumpur**; report day boundaries computed in MYT.
- **Ledgers, not overwrites:** stock, payments, status history and approvals are append-only.
- **All money and stock writes go through Postgres functions (RPC)** in a single transaction with role checks. Client roles get **no direct INSERT/UPDATE** on financial tables.

### Tables

```
── Identity & config ────────────────────────────────────────────
business_settings      single row: name, address, phone, logo_path, receipt_footer,
                       tax_enabled, tax_rate, tax_label, currency='MYR'
profiles               id = auth.users.id · full_name · role(owner|cashier|technician)
                       · discount_limit_pct · active
role_permissions       role · permission_key
document_sequences     doc_type · prefix · period · next_value   (row-locked)
payment_methods        name · type · active · sort_order
audit_log              actor · action · entity · entity_id · before/after jsonb · at

── Customers & devices ──────────────────────────────────────────
customers              name · phone (normalised +60) · email? · notes
devices                customer_id → customers · category · brand · model
                       · serial_imei? · color

── Inventory ────────────────────────────────────────────────────
item_categories        name · item_type(retail|part)
items                  item_type · sku (unique) · barcode? · name · category_id
                       · cost_sen · price_sen · stock_qty · min_stock
                       · allow_negative · active
stock_movements        item_id · qty_change · balance_after · reason
                       (sale|repair_use|repair_return|refund_restock|adjustment|receive)
                       · ref_type · ref_id · actor · note · at

── Repairs ──────────────────────────────────────────────────────
repair_jobs            job_no (unique) · customer_id · device_id · status
                       · accessories_received[] · condition_notes · reported_problem
                       · diagnosis · technician_id → profiles · est_cost_sen
                       · est_completion · internal_notes · payment_status
                       · created_by · created_at
repair_status_history  job_id · from_status · to_status · actor · note · at
repair_photos          job_id · storage_path · caption · uploaded_by
repair_parts           job_id · item_id · qty · unit_cost_sen · unit_price_sen
                       · stock_movement_id
repair_labour          job_id · description · amount_sen · technician_id

── Quotations ───────────────────────────────────────────────────
quotations             quote_no · job_id · version · status
                       (draft|sent|approved|rejected|expired) · valid_until
                       · subtotal/discount/tax/total_sen
quotation_lines        quote_id · line_type(labour|part|service) · item_id? · desc
                       · qty · unit_price_sen
quotation_decisions    quote_id · decision(approved|rejected) · channel
                       (in_person|phone|whatsapp|simulated_demo) · customer_name
                       · recorded_by · at

── Sales & payments ─────────────────────────────────────────────
sales                  receipt_no (unique) · kind(retail|repair) · repair_job_id?
                       · customer_id? · cashier_id · subtotal/discount/tax/total_sen
                       · status(completed|partially_refunded|refunded)
                       · idempotency_key (unique) · at
sale_lines             sale_id · line_type(product|part|labour|service)
                       · item_id? · desc · qty · unit_price_sen · unit_cost_sen
                       · discount_sen
payments               sale_id? · repair_job_id? · kind(deposit|payment|refund)
                       · method_id · amount_sen · reference? · received_by
                       · idempotency_key (unique) · at
refunds                sale_id · authorised_by · reason · amount_sen · at
refund_lines           refund_id · sale_line_id · qty · amount_sen · restock(bool)

── Warranty ─────────────────────────────────────────────────────
warranty_rules         name · applies_to · duration_days · terms_text
warranties             warranty_no · job_id? · sale_line_id? · rule_id · coverage
                       · starts_on · ends_on · status
warranty_claims        warranty_id · new_job_id? · issue · outcome · at
```

### Avoiding double-counted repair revenue

- **Revenue** = `sale_lines` (net of `refund_lines`) only.
- **Cash collected** = `payments` only.
- **Repair deposits** are `payments` linked to the `repair_job` with no sale yet. At collection, one `sales` row (kind `repair`) is created from the approved quotation and recorded parts/labour; deposits are linked to it and only the balance is charged.
- **Parts used** move stock and feed cost of goods but are not revenue on their own — they become revenue only as lines on the final repair invoice.
- Outstanding balance = repair invoice total − payments linked to that job.

### Key server functions (atomic, role-checked)

`complete_sale` · `record_repair_deposit` · `collect_repair` · `refund_sale` (Owner) · `change_job_status` · `record_quote_decision` · `use_part` / `return_part` · `adjust_stock` (Owner) · `next_document_no`

### Document numbering

Configurable, e.g. `RCP-2611-00042`, `JOB-2611-0017`, `QUO-2611-0009-v2`, `WTY-2611-0003`. Allocated with a row lock — no duplicates under concurrency; voided numbers are never reused.

### Authentication

- Supabase Auth, email + password; **MFA required for Owner**.
- No public sign-up; Owner invites staff; deactivation blocks login immediately.
- **Owner PIN override** for counter actions (discount above limit, refunds), verified server-side and logged as "authorised by X, performed by Y".
- Optional quick staff switching by PIN on a shared counter device (to be confirmed).

### Row Level Security

- RLS enabled on **every** table. Helper `auth_role()` reads `profiles` for `auth.uid()`; returns nothing for inactive staff.
- **customers, devices:** Owner/Cashier read & write. Technician reads only customers on assigned jobs, via a restricted view (name and phone only).
- **repair_jobs and children:** Owner/Cashier see all; Technician sees only `technician_id = auth.uid()`.
- **items:** all staff read; only Owner changes prices/costs; `cost_sen` hidden from Technician via a view.
- **sales, payments, refunds, stock_movements:** read by role; **no direct writes** — RPC only.
- **audit_log:** Owner read; no update or delete for anyone.

### Storage security

- Private bucket `repair-photos`, path `{job_id}/{uuid}.jpg`; policies mirror `repair_jobs` access.
- Served via short-lived signed URLs; EXIF/GPS stripped and images resized on upload.
- Public bucket `branding` for the logo only.
- **No fields for device passcodes or account passwords.** Intake form shows a reminder not to record them (PDPA-aligned).

### Backups

- Supabase Pro daily backups + Point-in-Time Recovery for production.
- Additional encrypted weekly `pg_dump` and photo bucket sync to BinaLab-controlled storage.
- Documented restore drill before go-live.
- Customer data retention policy to be agreed with Fixerlab.

---

## 7. UI/UX direction (from the supplied logos)

The logos use **crimson red**, **glossy black/charcoal**, **chrome silver** and white. The badge suits a light theme; the 3D wordmark suits a dark theme — both are justified by the brand.

### Design tokens (approximate; refine against original vector files)

| Token | Light | Dark | Source |
|---|---|---|---|
| `brand-red` | `#C8202F` | `#E5333F` | Badge ring, "LAB" |
| `brand-red-hover` | `#A81A27` | `#F04E59` | |
| `ink` | `#1A1A1C` | `#F2F2F3` | "F" mark |
| `silver` | `#B8BCC2` | `#8C9198` | Chrome wordmark |
| `surface` | `#FFFFFF` / `#F5F6F7` | `#17181A` / `#202226` | |
| `border` | `#E3E5E8` | `#2E3136` | |

`#C8202F` on white ≈ 5.9:1 (WCAG AA). On dark surfaces red text uses `#E5333F`.

### Brand red vs. danger semantics

- Red = **primary actions and active navigation only**.
- Destructive actions (Refund, Cancel job, Delete) use **outlined style + warning icon + confirmation dialog** — never colour alone.
- Errors always show **icon + text**.

### Repair status colours (badge + text label)

Received = slate · Diagnosing = blue · Awaiting Approval = amber · Waiting for Parts = orange · In Progress = violet · Quality Check = cyan · Ready for Collection = green · Completed = dark green · Cancelled = grey · Unrepairable = grey with icon.

### Typography

- **Inter** for UI, tabular numerals for all RM amounts.
- A squared technical display face (e.g. **Chakra Petch**) for page titles and dashboard figures only.

### Layouts

- **POS desktop:** category rail · product grid with always-focused search · fixed cart with large **Charge** button. Shortcuts: `F2` search, `F9` charge, `Esc` clear. Barcode scanners work as keyboard input.
- **POS tablet:** product grid + slide-up cart drawer; touch targets ≥ 44px.
- **Repairs:** kanban board with time-in-status badges; job detail with sticky header (job no., status, customer, device, balance due).
- **Mobile:** dashboard, job lookup, status updates, customer search. Full POS not optimised for phones.
- **Receipt:** 80mm thermal stylesheet (72mm printable width) + A4 invoice layout for repairs.

---

## 8. First build scope (Phase 2 interactive prototype)

A **minimal quotation flow** is brought forward from Phase 3 because Scenarios B and C cannot be demonstrated end to end without it.

### In scope

- Dashboard with clearly labelled sample KPIs
- POS: search, scan, categories, cart, discounts with Owner override, split payment, cash change, **80mm receipt**, transaction history
- Repair intake including condition photos
- Job board, job detail, status machine, full timeline
- Minimal quotation: lines, versions, send, **simulated approval clearly labelled**
- Parts used with controlled stock deduction
- Deposits and balance collection via POS
- Basic inventory: list, add/edit, deactivate, adjust, movement ledger, low-stock alerts
- Basic warranty record on collection (for Scenario C)
- Demo role switcher (Owner / Cashier / Technician) with permissions applied
- **Guided demo mode:** Scenarios A, B, C as one-click walkthroughs with reset
- Light and dark themes; responsive desktop / tablet / mobile

### Deferred to Phase 3

Full reports, warranty claims, staff management screens, full settings, quotation expiry automation, refund workflow (can be pulled into the demo on request).

### Labelled demo placeholders

Physical printer integration (browser print only), WhatsApp/SMS quotation sending, payment gateway integration.

### Stack and hosting

**Stack:** Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui; Supabase Postgres, Auth and Storage.

**Phase 2:** mock data in the browser behind a data-access layer with the same interface as the future Supabase functions; permissions enforced in that layer and labelled "Demo — permissions simulated". Fast to reset, isolated from any client database.

**Optional before client demo:** a **new dedicated demo Supabase project** to show real RLS enforcement. Never connected to existing BinaLab client data.

**Hosting — Vercel, not GitHub Pages:**
- GitHub Pages is static-only: no server, no secrets, no server-side enforcement. Acceptable for a mock-only demo, but would require re-platforming for production.
- Vercel runs Next.js natively, keeps secrets server-side, and gives per-change preview URLs for client review.
- Production: Vercel **Singapore (sin1)** + Supabase **ap-southeast-1**.

---

## 9. Questions for Fixerlab

### Business and branding
1. Is the trading name **"Fixerlab Solutions"** or **"Fixerlab Putrajaya"**? Are there, or will there be, **other branches**?
2. Can Fixerlab provide **original logo files** (SVG / AI / transparent PNG)?
3. Receipt contents: company registration number, address, phone, footer text?

### Tax and compliance
4. Is Fixerlab **SST-registered**? Which rates apply to goods vs. repair services; prices inclusive or exclusive?
5. Is Fixerlab in scope for **LHDN e-Invoicing (MyInvois)**? (Affects production planning, not the demo.)

### Counter operations
6. Number of counters, cashiers and technicians? Shared devices?
7. Existing **barcode scanner, thermal printer, cash drawer**? Models?
8. Cashier **discount limit** without Owner approval?
9. Payment methods used; is **split payment** common?
10. Who approves **refunds**, and what is the policy?

### Repair operations
11. **Deposit** at intake — required? Fixed or percentage?
12. **Diagnosis/inspection fee** if quotation rejected or device unrepairable?
13. How do customers **approve quotations** — in person, phone, WhatsApp? Signature needed?
14. Can a device be **collected with a balance owed**?
15. Must **QC be done by someone other than** the repairing technician?
16. **Reserve parts on quotation approval**, or deduct only when used?
17. Policy for **uncollected devices** (e.g. after 30 / 90 days)?
18. Printed **intake slip / job tag** signed by the customer?

### Inventory and warranty
19. Approximate SKU count; existing data available for later migration?
20. Parts tracked by **serial number** or quantity only?
21. **Warranty periods** by repair type; separate accessory policy?

### Data
22. Retention period for customer/device records; PDPA responsible person at Fixerlab?

---

## Decisions required before implementation

1. Approve the Phase 2 scope, including the early minimal quotation.
2. Phase 2 data approach: browser mock data (recommended) or a dedicated demo Supabase project from the start.
3. Hosting: Vercel account to deploy to.
4. Logo assets: proceed with cleaned-up versions of the supplied images, or wait for originals.

---

*All customer, device and transaction data used in this prototype is fictional sample data.*
