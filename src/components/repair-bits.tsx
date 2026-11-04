"use client";

import { Smartphone, Laptop, Tablet, Gamepad2, Cpu } from "lucide-react";
import type { DeviceCategory } from "@/lib/types";
import { money } from "@/lib/format";
import { Badge } from "./ui";

export function DeviceIcon({ category, className = "size-4" }: { category?: DeviceCategory; className?: string }) {
  if (category === "Smartphone") return <Smartphone className={className} />;
  if (category === "Laptop") return <Laptop className={className} />;
  if (category === "Tablet") return <Tablet className={className} />;
  if (category === "Gaming Console") return <Gamepad2 className={className} />;
  return <Cpu className={className} />;
}

export function PaymentChip({ status, balance }: { status: string; balance: number }) {
  if (status === "paid") return <Badge tone="green">Paid</Badge>;
  if (status === "no_charge") return <Badge tone="gray">No charge</Badge>;
  if (status === "partial") return <Badge tone="amber">Balance {money(balance)}</Badge>;
  if (status === "deposit") return <Badge tone="blue">Deposit paid</Badge>;
  return <Badge tone="slate">Unpaid</Badge>;
}

