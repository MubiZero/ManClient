"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Dialog } from "@/features/ui/dialog";
import { SubmitButton } from "@/features/ui/submit-button";

type ServerAction = (formData: FormData) => void | Promise<void>;

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
};

export function BookingActionsPanel({
  canConfirm,
  branchId,
  serviceId,
  staffId,
  timeZone,
  bookingLabel,
  confirmAction,
  rescheduleAction,
  cancelAction,
}: {
  canConfirm: boolean;
  branchId: string;
  serviceId: string;
  staffId: string;
  timeZone: string;
  bookingLabel: string;
  confirmAction: ServerAction;
  rescheduleAction: ServerAction;
  cancelAction: ServerAction;
}) {
  const [rescheduleReady, setRescheduleReady] = useState(false);

  return <section className="booking-actions-panel">
    <div><h2>Действия</h2><p>Изменения сохраняются в истории записи.</p></div>
    {canConfirm ? <ConfirmedBookingForm action={confirmAction} confirmation={{ title: "Подтвердить запись вручную?", description: "Подтверждение вручную не означает, что банк проверил оплату.", confirmLabel: "Подтвердить запись" }}><p>Используйте только если действительно приняли оплату вне автоматической проверки.</p><SubmitButton idle="Подтвердить вручную" pending="Подтверждаем" /></ConfirmedBookingForm> : null}
    <ConfirmedBookingForm action={rescheduleAction} confirmation={{ title: "Перенести запись?", description: "Клиент получит новое время, а прежний слот освободится.", confirmLabel: "Перенести запись" }}>
      <RescheduleSlotFields branchId={branchId} serviceId={serviceId} staffId={staffId} timeZone={timeZone} onSelectionChange={setRescheduleReady} />
      <SubmitButton variant="secondary" idle="Перенести запись" pending="Переносим" disabled={!rescheduleReady} />
    </ConfirmedBookingForm>
    <ConfirmedBookingForm action={cancelAction} confirmation={{ title: "Отменить запись?", description: `Действие нельзя отменить. Будет отменена запись: ${bookingLabel}.`, confirmLabel: "Отменить запись" }}>
      <label className="ui-field"><span className="ui-field-label">Причина отмены</span><input className="ui-input" name="reason" minLength={3} maxLength={300} required placeholder="Например, клиент попросил отменить" /></label>
      <SubmitButton variant="danger" idle="Отменить запись" pending="Отменяем" />
    </ConfirmedBookingForm>
  </section>;
}

function ConfirmedBookingForm({ action, confirmation, children }: { action: ServerAction; confirmation: Confirmation; children: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const bypassConfirmation = useRef(false);
  const [open, setOpen] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (bypassConfirmation.current) {
      bypassConfirmation.current = false;
      return;
    }
    event.preventDefault();
    setOpen(true);
  }

  function confirm() {
    bypassConfirmation.current = true;
    formRef.current?.requestSubmit();
  }

  return <form ref={formRef} action={action} onSubmit={onSubmit}>
    {children}
    <Dialog open={open} title={confirmation.title} description={confirmation.description} onClose={() => setOpen(false)}>
      <button className="ui-button ui-button-quiet" type="button" onClick={() => setOpen(false)}>Не отменять</button>
      <button className="ui-button" type="button" onClick={confirm}>{confirmation.confirmLabel}</button>
    </Dialog>
  </form>;
}

function RescheduleSlotFields({ branchId, serviceId, staffId, timeZone, onSelectionChange }: { branchId: string; serviceId: string; staffId: string; timeZone: string; onSelectionChange: (ready: boolean) => void }) {
  const [date, setDate] = useState("");
  const [starts, setStarts] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function loadSlots(nextDate: string) {
    setDate(nextDate); setStarts([]); setStartsAt(""); setError(""); onSelectionChange(false);
    requestRef.current?.abort();
    if (!nextDate) return;
    const request = new AbortController();
    requestRef.current = request;
    setLoading(true);
    try {
      const response = await fetch(`/api/availability?${new URLSearchParams({ branchId, serviceId, staffId, date: nextDate })}`, { signal: request.signal });
      if (!response.ok) throw new Error("availability");
      const result = await response.json() as { starts: string[] };
      if (requestRef.current !== request) return;
      setStarts(result.starts);
      if (!result.starts.length) setError("На эту дату свободного времени нет. Выберите другой день.");
    } catch {
      if (request.signal.aborted || requestRef.current !== request) return;
      setError("Не удалось загрузить свободное время. Попробуйте ещё раз.");
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }

  return <>
    <input type="hidden" name="startsAt" value={startsAt} />
    <label className="ui-field"><span className="ui-field-label">Новая дата</span><input className="ui-input" type="date" value={date} min={todayInTimeZone(timeZone)} required onChange={(event) => void loadSlots(event.target.value)} /></label>
    <fieldset className="manual-slots"><legend>Свободное время</legend>{loading ? <p role="status">Ищем свободное время…</p> : starts.length ? <div>{starts.map((value) => <button key={value} type="button" aria-pressed={startsAt === value} onClick={() => { setStartsAt(value); onSelectionChange(true); }}>{formatTime(value, timeZone)}</button>)}</div> : <p>{date ? "Свободного времени пока нет." : "Выберите дату, чтобы увидеть доступные слоты."}</p>}</fieldset>
    {error ? <p className="entity-error" role="alert">{error}</p> : null}
  </>;
}

function todayInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
