"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { saveCustomer } from "@/lib/services";
import type { Customer } from "@/lib/types";
import { Button, Field, Input, Modal, Textarea } from "./ui";

export function CustomerDialog({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const { run } = useStore();
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  return (
    <Modal
      open
      onClose={onClose}
      title={customer ? "Edit customer" : "Add customer"}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!name.trim() || !phone.trim()}
            onClick={() => {
              const r = run((d) => saveCustomer(d, { id: customer?.id, name, phone, email, notes }), "Customer saved");
              if (r.ok) onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Full name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Phone number" required>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Email (optional)">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Notes" hint="Do not store passwords or sensitive personal content.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-14" />
        </Field>
      </div>
    </Modal>
  );
}
