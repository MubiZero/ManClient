"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Field } from "@/features/ui/field";
import { SubmitButton } from "@/features/ui/submit-button";

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

  return <form action={action} className="entity-form manual-booking-form">
    <div className="entity-form-heading"><p className="step-kicker">Запись из кабинета</p><h2>Новая запись</h2><p>Выберите свободное время и добавьте контакты клиента. Запись сразу станет подтверждённой, оплата останется в статусе «Не оплачено».</p></div>
    <input type="hidden" name="startsAt" value={startsAt} />
    <div className="entity-form-grid">
      <label className="ui-field"><span className="ui-field-label">Филиал</span><select className="ui-input" name="branchId" value={branchId} onChange={(event) => { setBranchId(event.target.value); setServiceId(""); setStaffId(""); setDate(""); setStarts([]); }} required>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="ui-field"><span className="ui-field-label">Услуга</span><select className="ui-input" name="serviceId" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setStaffId(""); setDate(""); setStarts([]); }} required><option value="">Выберите услугу</option>{branchServices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="ui-field"><span className="ui-field-label">Специалист</span><select className="ui-input" name="staffId" value={staffId} onChange={(event) => { setStaffId(event.target.value); void loadSlots(date, event.target.value); }} required disabled={!service}><option value="">Выберите специалиста</option>{service?.staffMembers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <label className="ui-field"><span className="ui-field-label">Дата</span><input className="ui-input" type="date" value={date} onChange={(event) => void loadSlots(event.target.value)} required disabled={!staffId} /></label>
    </div>
    <fieldset className="manual-slots"><legend>Свободное время</legend>{loading ? <p role="status">Ищем свободное время…</p> : starts.length ? <div>{starts.map((value) => <button key={value} type="button" aria-pressed={startsAt === value} onClick={() => setStartsAt(value)}>{new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value))}</button>)}</div> : <p>{date && staffId ? "На эту дату свободного времени нет." : "Сначала выберите услугу, специалиста и дату."}</p>}</fieldset>
    <div className="entity-form-grid"><Field label="Имя клиента" name="customerName" required minLength={2} maxLength={120} /><Field label="Телефон клиента" name="customerPhone" type="tel" required placeholder="+992 90 000 00 00" /></div>
    {slotError || error ? <p className="entity-error" role="alert">{slotError || error}</p> : null}
    <div className="entity-form-actions"><Link className="ui-button ui-button-quiet" href="/dashboard/bookings">Отмена</Link><SubmitButton idle="Создать запись" pending="Создаём запись" disabled={!startsAt} /></div>
  </form>;
}
