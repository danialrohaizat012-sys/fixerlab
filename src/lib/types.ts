// Domain model for the Fixerlab POS & Repair prototype.
// All money values are integer SEN (RM 12.90 => 1290). All timestamps are ISO-8601 UTC strings,
// displayed in Asia/Kuala_Lumpur.

export type Role = "owner" | "cashier" | "technician";

export interface Staff {
  id: string;
  name: string;
  role: Role;
  /** Demo-only PIN used for owner overrides. Production: hashed + verified server-side. */
  pin: string;
  discountLimitPct: number;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  /** True for the pre-loaded fictional sample records. */
  sample?: boolean;
  createdAt: string;
}

export type DeviceCategory = "Smartphone" | "Tablet" | "Laptop" | "Gaming Console" | "Other";

export interface Device {
  id: string;
  customerId: string;
  category: DeviceCategory;
  brand: string;
  model: string;
  serial?: string;
  color?: string;
}

export type ItemType = "retail" | "part";

export interface Item {
  id: string;
  type: ItemType;
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  allowNegative: boolean;
  active: boolean;
}

export type MovementReason =
  | "opening"
  | "sale"
  | "repair_use"
  | "repair_return"
  | "refund_restock"
  | "adjustment"
  | "receive";

export interface StockMovement {
  id: string;
  itemId: string;
  qty: number;
  balanceAfter: number;
  reason: MovementReason;
  refNo?: string;
  actorId: string;
  note?: string;
  at: string;
}

export type RepairStatus =
  | "received"
  | "diagnosing"
  | "awaiting_approval"
  | "waiting_parts"
  | "in_progress"
  | "quality_check"
  | "ready"
  | "completed"
  | "cancelled"
  | "unrepairable";

export interface RepairPhoto {
  id: string;
  dataUrl: string;
  caption: string;
  at: string;
}

export interface RepairJob {
  id: string;
  jobNo: string;
  customerId: string;
  deviceId: string;
  status: RepairStatus;
  accessories: string[];
  condition: string;
  reportedProblem: string;
  diagnosis: string;
  technicianId?: string;
  estCost: number;
  estCompletion?: string;
  internalNotes: string;
  photos: RepairPhoto[];
  saleId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StatusEvent {
  id: string;
  jobId: string;
  from?: RepairStatus;
  to: RepairStatus;
  actorId: string;
  note?: string;
  at: string;
}

export interface RepairPart {
  id: string;
  jobId: string;
  itemId: string;
  qty: number;
  unitCost: number;
  movementId: string;
  reversed: boolean;
  actorId: string;
  at: string;
}

export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired";
export type QuoteLineType = "labour" | "part" | "service";

export interface QuoteLine {
  id: string;
  type: QuoteLineType;
  itemId?: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export interface Quotation {
  id: string;
  quoteNo: string;
  jobId: string;
  version: number;
  status: QuoteStatus;
  lines: QuoteLine[];
  discount: number;
  validUntil: string;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
}

export type ApprovalChannel = "in_person" | "phone" | "whatsapp" | "simulated_demo";

export interface QuoteDecision {
  id: string;
  quoteId: string;
  decision: "approved" | "rejected";
  channel: ApprovalChannel;
  customerName: string;
  recordedBy: string;
  at: string;
}

export type SaleLineType = "product" | "part" | "labour" | "service";

export interface SaleLine {
  id: string;
  type: SaleLineType;
  itemId?: string;
  description: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  refundedQty: number;
}

export type SaleStatus = "completed" | "partially_refunded" | "refunded";

export interface Sale {
  id: string;
  receiptNo: string;
  kind: "retail" | "repair";
  repairJobId?: string;
  customerId?: string;
  cashierId: string;
  lines: SaleLine[];
  subtotal: number;
  discount: number;
  discountAuthorizedBy?: string;
  tax: number;
  total: number;
  /** Cost of goods for gross profit estimation. Repair: actual parts used. */
  cogs: number;
  status: SaleStatus;
  idempotencyKey: string;
  at: string;
}

export interface Payment {
  id: string;
  saleId?: string;
  repairJobId?: string;
  kind: "deposit" | "payment" | "refund";
  methodId: string;
  amount: number;
  tendered?: number;
  reference?: string;
  receivedBy: string;
  at: string;
}

export interface RefundLine {
  saleLineId: string;
  qty: number;
  amount: number;
  restock: boolean;
}

export interface Refund {
  id: string;
  refundNo: string;
  saleId: string;
  authorizedBy: string;
  performedBy: string;
  reason: string;
  amount: number;
  methodId: string;
  lines: RefundLine[];
  at: string;
}

export interface WarrantyRule {
  id: string;
  name: string;
  durationDays: number;
  terms: string;
  active: boolean;
}

export interface Warranty {
  id: string;
  warrantyNo: string;
  jobId?: string;
  saleId?: string;
  customerId: string;
  ruleId: string;
  coverage: string;
  startsOn: string;
  endsOn: string;
  voided: boolean;
}

export interface WarrantyClaim {
  id: string;
  warrantyId: string;
  issue: string;
  outcome: "pending" | "accepted" | "rejected";
  newJobId?: string;
  actorId: string;
  at: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  isCash: boolean;
  active: boolean;
}

export interface Settings {
  businessName: string;
  branchName: string;
  address: string;
  phone: string;
  receiptFooter: string;
  taxEnabled: boolean;
  taxLabel: string;
  taxRatePct: number;
  paymentMethods: PaymentMethod[];
  retailCategories: string[];
  partCategories: string[];
  deviceCategories: DeviceCategory[];
  prefixes: { receipt: string; job: string; quote: string; warranty: string; refund: string };
  allowCollectWithBalance: boolean;
  qcRequiresDifferentPerson: boolean;
  diagnosisFee: number;
  quoteValidityDays: number;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  detail: string;
  at: string;
}

export interface DbState {
  version: number;
  seededAt: string;
  currentUserId: string;
  settings: Settings;
  staff: Staff[];
  customers: Customer[];
  devices: Device[];
  items: Item[];
  movements: StockMovement[];
  jobs: RepairJob[];
  statusEvents: StatusEvent[];
  repairParts: RepairPart[];
  quotations: Quotation[];
  decisions: QuoteDecision[];
  sales: Sale[];
  payments: Payment[];
  refunds: Refund[];
  warrantyRules: WarrantyRule[];
  warranties: Warranty[];
  claims: WarrantyClaim[];
  audit: AuditEntry[];
  sequences: Record<string, number>;
  processedKeys: Record<string, string>;
}
