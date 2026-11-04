import type { Role } from "./types";

export type Permission =
  | "pos.sell"
  | "pos.discount.override"
  | "sales.view"
  | "sales.refund"
  | "payment.receive"
  | "repair.create"
  | "repair.view.all"
  | "repair.diagnose"
  | "repair.parts"
  | "repair.qc"
  | "repair.cancel"
  | "repair.assign"
  | "quote.create"
  | "quote.decide"
  | "inventory.view"
  | "inventory.edit"
  | "inventory.adjust"
  | "inventory.cost.view"
  | "customers.view"
  | "customers.edit"
  | "warranty.manage"
  | "reports.view"
  | "staff.manage"
  | "settings.edit";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "pos.sell",
    "pos.discount.override",
    "sales.view",
    "sales.refund",
    "payment.receive",
    "repair.create",
    "repair.view.all",
    "repair.diagnose",
    "repair.parts",
    "repair.qc",
    "repair.cancel",
    "repair.assign",
    "quote.create",
    "quote.decide",
    "inventory.view",
    "inventory.edit",
    "inventory.adjust",
    "inventory.cost.view",
    "customers.view",
    "customers.edit",
    "warranty.manage",
    "reports.view",
    "staff.manage",
    "settings.edit",
  ],
  cashier: [
    "pos.sell",
    "sales.view",
    "payment.receive",
    "repair.create",
    "repair.view.all",
    "repair.assign",
    "quote.create",
    "quote.decide",
    "inventory.view",
    "customers.view",
    "customers.edit",
    "warranty.manage",
  ],
  technician: ["repair.diagnose", "repair.parts", "repair.qc", "quote.create", "inventory.view"],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner / Admin",
  cashier: "Cashier",
  technician: "Technician",
};

export function can(role: Role | undefined, p: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(p);
}

export const PERMISSION_LABEL: Record<Permission, string> = {
  "pos.sell": "Process sales",
  "pos.discount.override": "Approve discounts above limit",
  "sales.view": "View transactions",
  "sales.refund": "Authorise refunds",
  "payment.receive": "Receive payments & deposits",
  "repair.create": "Register repair jobs",
  "repair.view.all": "View all repair jobs",
  "repair.diagnose": "Update diagnosis & progress",
  "repair.parts": "Record parts used",
  "repair.qc": "Perform quality check",
  "repair.cancel": "Cancel jobs / override status",
  "repair.assign": "Assign technician",
  "quote.create": "Create quotations",
  "quote.decide": "Record customer approval",
  "inventory.view": "View inventory",
  "inventory.edit": "Add / edit items & prices",
  "inventory.adjust": "Stock adjustments",
  "inventory.cost.view": "View cost prices",
  "customers.view": "View customers",
  "customers.edit": "Edit customers",
  "warranty.manage": "Manage warranty claims",
  "reports.view": "View reports",
  "staff.manage": "Manage staff",
  "settings.edit": "System settings",
};
