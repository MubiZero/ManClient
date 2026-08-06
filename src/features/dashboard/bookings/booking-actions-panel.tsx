"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/features/ui-kit/button";
import { cn } from "@/features/ui-kit/cn";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/features/ui-kit/dialog";
import { Field, Input } from "@/features/ui-kit/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";

type ServerAction = (formData: FormData) => void | Promise<void>;

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
};

export function BookingActionsPanel({
  canConfirm,
  canMarkNoShow,
  branchId,
  serviceId,
  staffId,
  timeZone,
  bookingLabel,
  confirmAction,
  rescheduleAction,
  cancelAction,
  noShowAction,
}: {
  canConfirm: boolean;
  /** Only a confirmed visit whose time has already passed can have been missed. */
  canMarkNoShow: boolean;
  branchId: string;
  serviceId: string;
  staffId: string;
  timeZone: string;
  bookingLabel: string;
  confirmAction: ServerAction;
  rescheduleAction: ServerAction;
  cancelAction: ServerAction;
  noShowAction: ServerAction;
}) {
  const [rescheduleReady, setRescheduleReady] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Действия</CardTitle>
        <p className="text-sm text-muted-foreground">Изменения сохраняются в истории записи.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {canConfirm ? (
          <ConfirmedBookingForm
            action={confirmAction}
            confirmation={{ title: "Подтвердить запись вручную?", description: "Подтверждение вручную не означает, что банк проверил оплату.", confirmLabel: "Подтвердить запись" }}
          >
            <p className="text-sm text-muted-foreground">Используйте только если действительно приняли оплату вне автоматической проверки.</p>
            <Button type="submit">Подтвердить вручную</Button>
          </ConfirmedBookingForm>
        ) : null}
        <ConfirmedBookingForm
          action={rescheduleAction}
          confirmation={{ title: "Перенести запись?", description: "Клиент получит новое время, а прежний слот освободится.", confirmLabel: "Перенести запись" }}
        >
          <RescheduleSlotFields branchId={branchId} serviceId={serviceId} staffId={staffId} timeZone={timeZone} onSelectionChange={setRescheduleReady} />
          <Button type="submit" variant="secondary" disabled={!rescheduleReady}>
            Перенести запись
          </Button>
        </ConfirmedBookingForm>
        {canMarkNoShow ? (
          <ConfirmedBookingForm
            action={noShowAction}
            confirmation={{ title: "Отметить неявку?", description: `Время визита останется занятым в истории, а внесённая предоплата — у бизнеса. Запись: ${bookingLabel}.`, confirmLabel: "Отметить неявку" }}
          >
            <p className="text-sm text-muted-foreground">Клиент не пришёл. Напоминания и запрос отзыва по этой записи отправлены не будут.</p>
            <Button type="submit" variant="secondary">Отметить неявку</Button>
          </ConfirmedBookingForm>
        ) : null}
        <ConfirmedBookingForm
          action={cancelAction}
          confirmation={{ title: "Отменить запись?", description: `Действие нельзя отменить. Будет отменена запись: ${bookingLabel}.`, confirmLabel: "Отменить запись" }}
        >
          <Field label="Причина отмены">
            <Input name="reason" minLength={3} maxLength={300} required placeholder="Например, клиент попросил отменить" />
          </Field>
          <Button type="submit" variant="destructive">
            Отменить запись
          </Button>
        </ConfirmedBookingForm>
      </CardContent>
    </Card>
  );
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

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-border pt-4 first:border-0 first:pt-0">
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmation.title}</DialogTitle>
            <DialogDescription>{confirmation.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
              Не отменять
            </Button>
            <Button type="button" onClick={confirm}>
              {confirmation.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
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

  return (
    <>
      <input type="hidden" name="startsAt" value={startsAt} />
      <Field label="Новая дата">
        <Input type="date" value={date} min={todayInTimeZone(timeZone)} required onChange={(event) => void loadSlots(event.target.value)} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Свободное время</legend>
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Ищем свободное время…
          </p>
        ) : starts.length ? (
          <div className="flex flex-wrap gap-2">
            {starts.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={startsAt === value}
                onClick={() => { setStartsAt(value); onSelectionChange(true); }}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  startsAt === value ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-secondary",
                )}
              >
                {formatTime(value, timeZone)}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{date ? "Свободного времени пока нет." : "Выберите дату, чтобы увидеть доступные слоты."}</p>
        )}
      </fieldset>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </>
  );
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
