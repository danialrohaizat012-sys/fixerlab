"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ShieldAlert, X, UserCheck, ClipboardPlus } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { createRepairJob, normalisePhone, type PaymentInput } from "@/lib/services";
import { resizeImage } from "@/lib/image";
import { cx, money, toSen } from "@/lib/format";
import type { DeviceCategory } from "@/lib/types";
import { Button, Card, CardHeader, Denied, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { DeviceIcon } from "@/components/repair-bits";

const ACCESSORIES = ["Charger", "Cable", "Case / cover", "SIM tray", "SIM card", "Memory card", "Stylus / pen", "Controller", "Box", "Laptop bag"];
const CONDITIONS = ["Screen cracked", "Back glass cracked", "Scratches on body", "Dents on frame", "Bent", "Water damage signs", "Missing screws", "Swollen battery"];
const BRANDS: Record<DeviceCategory, string[]> = {
  Smartphone: ["Apple", "Samsung", "Xiaomi", "Oppo", "Vivo", "Huawei", "Honor", "Realme"],
  Tablet: ["Apple", "Samsung", "Xiaomi", "Huawei", "Lenovo"],
  Laptop: ["Apple", "HP", "Lenovo", "Asus", "Acer", "Dell", "MSI"],
  "Gaming Console": ["Sony", "Nintendo", "Microsoft", "Valve"],
  Other: [],
};

interface IntakePrefill {
  name?: string;
  phone?: string;
  category?: DeviceCategory;
  brand?: string;
  model?: string;
  color?: string;
  problem?: string;
  condition?: string;
  accessories?: string[];
  est?: string;
}

export default function NewIntakePage() {
  const { db, me, run, toast } = useStore();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [customerId, setCustomerId] = useState<string>();
  const [deviceId, setDeviceId] = useState<string>("");
  const [category, setCategory] = useState<DeviceCategory>("Smartphone");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [color, setColor] = useState("");
  const [accessories, setAccessories] = useState<string[]>([]);
  const [condition, setCondition] = useState("");
  const [problem, setProblem] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [est, setEst] = useState("");
  const [estDate, setEstDate] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<{ dataUrl: string; caption: string }[]>([]);
  const [depAmt, setDepAmt] = useState("");
  const [depMethod, setDepMethod] = useState(db.settings.paymentMethods.find((m) => m.active)?.id ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Demo scenarios can pre-fill the form (?prefill=<json>).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("prefill");
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as IntakePrefill;
      if (p.phone) setPhone(p.phone);
      if (p.name) setName(p.name);
      if (p.category) setCategory(p.category);
      if (p.brand) setBrand(p.brand);
      if (p.model) setModel(p.model);
      if (p.color) setColor(p.color);
      if (p.problem) setProblem(p.problem);
      if (p.condition) setCondition(p.condition);
      if (p.accessories) setAccessories(p.accessories);
      if (p.est) setEst(p.est);
    } catch {}
  }, []);

  const match = useMemo(() => {
    const d = normalisePhone(phone);
    if (d.length < 9) return undefined;
    return db.customers.find((c) => normalisePhone(c.phone) === d);
  }, [phone, db.customers]);
  const custDevices = customerId ? db.devices.filter((d) => d.customerId === customerId) : [];

  useEffect(() => {
    if (match && !customerId) {
      setCustomerId(match.id);
      setName(match.name);
      setEmail(match.email ?? "");
    }
    if (!match && customerId) {
      setCustomerId(undefined);
      setDeviceId("");
    }
  }, [match, customerId]);

  useEffect(() => {
    const d = db.devices.find((x) => x.id === deviceId);
    if (d) {
      setCategory(d.category);
      setBrand(d.brand);
      setModel(d.model);
      setSerial(d.serial ?? "");
      setColor(d.color ?? "");
    }
  }, [deviceId, db.devices]);

  if (!can(me.role, "repair.create")) return <Denied what="register repair jobs" />;

  const techs = db.staff.filter((s) => s.role === "technician" && s.active);
  const toggleAcc = (a: string) => setAccessories((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]));
  const addCond = (c: string) => setCondition((x) => (x.includes(c) ? x : x ? `${x}; ${c}` : c));

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 6 - photos.length)) {
      try {
        const dataUrl = await resizeImage(f);
        setPhotos((p) => [...p, { dataUrl, caption: "Condition at intake" }]);
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
  };

  const submit = () => {
    setBusy(true);
    const deposit: PaymentInput | undefined = toSen(depAmt) > 0 ? { methodId: depMethod, amount: toSen(depAmt) } : undefined;
    const r = run(
      (d) =>
        createRepairJob(d, {
          customer: { id: customerId, name, phone, email },
          device: { id: deviceId || undefined, category, brand, model, serial, color },
          accessories,
          condition,
          reportedProblem: problem,
          diagnosis,
          technicianId: technicianId || undefined,
          estCost: toSen(est),
          estCompletion: estDate ? new Date(estDate + "T18:00:00+08:00").toISOString() : undefined,
          internalNotes: notes,
          photos,
          deposit,
        }),
      (j) => `Job ${j.jobNo} registered`,
    );
    if (r.ok) router.push(`/repairs/${r.value.id}?new=1`);
    else setBusy(false);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New repair intake" subtitle="Register the customer's device at the counter. Fields marked * are required." />
      <div className="mb-4">
        <Notice tone="warn">
          <span className="inline-flex items-center gap-1 font-semibold">
            <ShieldAlert className="size-4" /> Do not record device passcodes, PINs, pattern locks or account passwords.
          </span>{" "}
          Ask the customer to unlock the device in person when testing is needed.
        </Notice>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="1 · Customer" />
          <div className="space-y-3 p-4 sm:p-5">
            <Field label="Phone number" required hint={match ? undefined : "We look up existing customers by phone."}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="012-345 6789" autoFocus />
            </Field>
            {match && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-500/10 dark:text-green-200">
                <UserCheck className="size-4" /> Returning customer: <b>{match.name}</b>
              </div>
            )}
            <Field label="Full name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!!match} />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!match} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="2 · Device" />
          <div className="space-y-3 p-4 sm:p-5">
            {custDevices.length > 0 && (
              <Field label="Previously serviced device">
                <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                  <option value="">New device</option>
                  {custDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.brand} {d.model} {d.serial ? `· ${d.serial}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {db.settings.deviceCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cx(
                    "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11.5px] font-medium",
                    category === c ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line text-ink-2 hover:border-line-strong",
                  )}
                  aria-pressed={category === c}
                >
                  <DeviceIcon category={c} className="size-5" />
                  {c}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Brand" required>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} list="brands" />
                <datalist id="brands">
                  {BRANDS[category].map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </Field>
              <Field label="Model" required>
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. iPhone 13" />
              </Field>
              <Field label="Serial no. / IMEI (optional)">
                <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Colour">
                <Input value={color} onChange={(e) => setColor(e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="3 · Condition & accessories" subtitle="Record what the customer handed over and visible condition." />
          <div className="space-y-3 p-4 sm:p-5">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-2">Accessories received</div>
              <div className="flex flex-wrap gap-1.5">
                {ACCESSORIES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAcc(a)}
                    aria-pressed={accessories.includes(a)}
                    className={cx("rounded-full border px-3 py-1 text-[13px]", accessories.includes(a) ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:border-line-strong")}
                  >
                    {a}
                  </button>
                ))}
              </div>
              {!accessories.length && <p className="mt-1 text-xs text-ink-3">None selected = device only.</p>}
            </div>
            <Field label="Physical condition">
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {CONDITIONS.map((c) => (
                  <button key={c} type="button" onClick={() => addCond(c)} className="rounded-md border border-dashed border-line-strong px-2 py-0.5 text-xs text-ink-2 hover:bg-surface-2">
                    + {c}
                  </button>
                ))}
              </div>
              <Textarea value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Describe scratches, cracks, dents…" />
            </Field>
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-2">Condition photos (optional, max 6)</div>
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt={`Intake photo ${i + 1}`} className="size-20 rounded-lg object-cover ring-1 ring-line" />
                    <button type="button" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-surface" aria-label="Remove photo">
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {photos.length < 6 && (
                  <button type="button" onClick={() => fileRef.current?.click()} className="grid size-20 place-items-center rounded-lg border border-dashed border-line-strong text-ink-3 hover:bg-surface-2">
                    <span className="flex flex-col items-center gap-1 text-[11px]">
                      <Camera className="size-5" /> Add photo
                    </span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              <p className="mt-1 text-xs text-ink-3">Photos are resized and location metadata removed. Prototype stores them in this browser only.</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="4 · Problem & assignment" />
          <div className="space-y-3 p-4 sm:p-5">
            <Field label="Reported problem" required>
              <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What the customer says is wrong" />
            </Field>
            <Field label="Initial diagnosis (optional)">
              <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="min-h-14" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Technician">
                <Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                  <option value="">Assign later</option>
                  {techs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Estimated cost (RM)" hint="Indicative only">
                <Input inputMode="decimal" value={est} onChange={(e) => setEst(e.target.value)} className="num text-right" placeholder="0.00" />
              </Field>
              <Field label="Est. completion">
                <Input type="date" value={estDate} onChange={(e) => setEstDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Internal notes" hint="Visible to staff only">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-14" />
            </Field>
            {can(me.role, "payment.receive") && (
              <div className="grid gap-3 rounded-lg border border-dashed border-line-strong p-3 sm:grid-cols-2">
                <Field label="Deposit (optional, RM)">
                  <Input inputMode="decimal" value={depAmt} onChange={(e) => setDepAmt(e.target.value)} className="num text-right" placeholder="0.00" />
                </Field>
                <Field label="Deposit method">
                  <Select value={depMethod} onChange={(e) => setDepMethod(e.target.value)}>
                    {db.settings.paymentMethods
                      .filter((m) => m.active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>
        </Card>
      </div>
      <div className="sticky bottom-0 z-10 -mx-3 mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-bg/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        {toSen(depAmt) > 0 && <span className="text-sm text-ink-3">Deposit {money(toSen(depAmt))} will be recorded</span>}
        <Button onClick={() => router.back()}>Cancel</Button>
        <Button variant="primary" size="lg" disabled={busy || !phone || !name || !brand || !model || !problem} icon={<ClipboardPlus className="size-5" />} onClick={submit}>
          Register job
        </Button>
      </div>
    </div>
  );
}
