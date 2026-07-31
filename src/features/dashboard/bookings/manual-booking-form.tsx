"use client";

import { useMemo, useState } from "react";

import { ButtonLink } from "@/features/ui-kit/button";
import { cn } from "@/features/ui-kit/cn";
import { Field, Input, Select } from "@/features/ui-kit/field";
import { SubmitButton } from "@/features/ui-kit/submit-button";

type Staff = { id: string; displayName: string };
type Service = { id: string; name: string; branchId: string; staffMembers: Staff[] };
type Branch = { id: string; name: string; timeZone: string };

export function ManualBookingForm({ action, branches, services, error }: { action: (formData: FormData) => void | Promise<void>; branches: Branch[]; services: Service[]; error?: string }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const branchServices = useMemo(() => services.filter((item) => item.branchId === branchId), [services, branchId]);
  const timeZone = branches.find((item) => item.id === branchId)?.timeZone ?? "Asia/Dushanbe";
  const [serviceId, setServiceId] = useState("");
  const service = branchServices.find((item) => item.id === serviceId);
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [starts, setStarts] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [slotError, setSlotError] = useState("");

  async function loadSlots(nextDate: string, nextStaffId = staffId, nextServiceId = serviceId) {
    setDate(nextDate); setStarts([]); setStartsAt(""); setSlotError("");
    if (!nextDate || !nextStaffId || !nextServiceId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/availability?${new URLSearchParams({ branchId, serviceId: nextServiceId, staffId: nextStaffId, date: nextDate })}`);
      if (!response.ok) throw new Error("availability");
      setStarts(((await response.json()) as { starts: string[] }).starts);
    } catch { setSlotError("Не удалось загрузить свободное время. Попробуйте ещё раз."); }
    finally { setLoading(false); }
  }

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Запись из кабинета</p>
        <h2 className="text-xl font-semibold text-foreground">Новая запись</h2>
        <p className="text-sm text-muted-foreground">Выберите свободное время и добавьте контакты клиента. Запись сразу станет подтверждённой, оплата останется в статусе «Не оплачено».</p>
      </div>
      <input type="hidden" name="startsAt" value={startsAt} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Филиал">
          <Select name="branchId" value={branchId} onChange={(event) => { setBranchId(event.target.value); setServiceId(""); setStaffId(""); setDate(""); setStarts([]); }} required>
            {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Услуга">
          <Select name="serviceId" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setStaffId(""); setDate(""); setStarts([]); }} required>
            <option value="">Выберите услугу</option>
            {branchServices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Специалист">
          <Select name="staffId" value={staffId} onChange={(event) => { setStaffId(event.target.value); void loadSlots(date, event.target.value); }} required disabled={!service}>
            <option value="">Выберите специалиста</option>
            {service?.staffMembers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
          </Select>
        </Field>
        <Field label="Дата">
          <Input type="date" value={date} onChange={(event) => void loadSlots(event.target.value)} required disabled={!staffId} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-foreground">Свободное время</legend>
        {loading ? (
          <p className="text-sm text-muted-foreground" role="status">Ищем свободное время…</p>
        ) : starts.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {starts.map((value) => (
              <button
                data-slot
                key={value}
                type="button"
                aria-pressed={startsAt === value}
                onClick={() => setStartsAt(value)}
                className={cn(
                  "rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-secondary",
                  "aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground",
                )}
              >
                {new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value))}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{date && staffId ? "На эту дату свободного времени нет." : "Сначала выберите услугу, специалиста и дату."}</p>
        )}
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Имя клиента"><Input name="customerName" required minLength={2} maxLength={120} /></Field>
        <Field label="Телефон клиента"><Input name="customerPhone" type="tel" required placeholder="+992 90 000 00 00" /></Field>
      </div>
      {slotError || error ? <p className="text-sm text-destructive" role="alert">{slotError || error}</p> : null}
      <div className="flex justify-end gap-3">
        <ButtonLink variant="quiet" href="/dashboard/bookings">Отмена</ButtonLink>
        <SubmitButton idle="Создать запись" pending="Создаём запись" disabled={!startsAt} />
      </div>
    </form>
  );
}
