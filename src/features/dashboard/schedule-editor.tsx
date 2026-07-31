"use client";

import { useState } from "react";

import { Button } from "@/features/ui-kit/button";
import { Checkbox } from "@/features/ui-kit/checkbox";
import { Field, Input } from "@/features/ui-kit/field";
import { SubmitButton } from "@/features/ui-kit/submit-button";

type Interval = { dayOfWeek: number; startsAt: string; endsAt: string };
type DayValue = { enabled: boolean; startsAt: string; endsAt: string; breakEnabled: boolean; breakStartsAt: string; breakEndsAt: string };

const days = [
  { value: 1, label: "Понедельник" },
  { value: 2, label: "Вторник" },
  { value: 3, label: "Среда" },
  { value: 4, label: "Четверг" },
  { value: 5, label: "Пятница" },
  { value: 6, label: "Суббота" },
  { value: 0, label: "Воскресенье" },
];

export function ScheduleEditor({ mode, inherited = false, rules, breaks, action, restoreAction, error, branchId = "", staffId = "" }: {
  mode: "branch" | "staff";
  inherited?: boolean;
  rules: Interval[];
  breaks: Interval[];
  action: (formData: FormData) => void | Promise<void>;
  restoreAction?: (formData: FormData) => void | Promise<void>;
  error?: string;
  branchId?: string;
  staffId?: string;
}) {
  const [values, setValues] = useState<Record<number, DayValue>>(() => Object.fromEntries(days.map(({ value }) => {
    const rule = rules.find((item) => item.dayOfWeek === value);
    const pause = breaks.find((item) => item.dayOfWeek === value);
    return [value, {
      enabled: Boolean(rule),
      startsAt: rule?.startsAt ?? "09:00",
      endsAt: rule?.endsAt ?? "18:00",
      breakEnabled: Boolean(pause),
      breakStartsAt: pause?.startsAt ?? "12:00",
      breakEndsAt: pause?.endsAt ?? "13:00",
    }];
  })));

  function update(day: number, change: Partial<DayValue>) {
    setValues((current) => ({ ...current, [day]: { ...current[day], ...change } }));
  }

  function copyMondayToWeekdays() {
    setValues((current) => {
      const monday = current[1];
      return { ...current, ...Object.fromEntries([1, 2, 3, 4, 5].map((day) => [day, { ...monday }])) };
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {mode === "staff" && inherited ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-secondary px-5 py-4" role="status">
          <div>
            <strong className="font-medium text-foreground">Используется график филиала</strong>
            <p className="text-sm text-muted-foreground">Создайте личный график только если специалист работает в другое время.</p>
          </div>
          {restoreAction ? (
            <form action={restoreAction}>
              <input type="hidden" name="branchId" value={branchId} />
              <input type="hidden" name="staffId" value={staffId} />
              <SubmitButton variant="secondary" idle="Вернуть график филиала" pending="Возвращаем" />
            </form>
          ) : null}
        </div>
      ) : null}
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="branchId" value={branchId} />
        <input type="hidden" name="staffId" value={staffId} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{mode === "branch" ? "Рабочая неделя филиала" : "График специалиста"}</h2>
            <p className="text-sm text-muted-foreground">Выключенный день считается выходным. Перерыв исключается из свободного времени.</p>
          </div>
          <Button type="button" variant="secondary" onClick={copyMondayToWeekdays}>Скопировать на будни</Button>
        </div>
        <div className="flex flex-col gap-3">
          {days.map(({ value: day, label }) => {
            const item = values[day];
            return (
              <fieldset key={day} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-semibold text-foreground">{label}</legend>
                <label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
                  <Checkbox name={`enabled-${day}`} value="true" checked={item.enabled} onChange={(event) => update(day, { enabled: event.target.checked })} />
                  {item.enabled ? "Рабочий день" : "Выходной"}
                </label>
                <div className="flex flex-wrap items-end gap-4">
                  <Field label="Начало"><Input className="w-32" type="time" name={`startsAt-${day}`} value={item.startsAt} disabled={!item.enabled} onChange={(event) => update(day, { startsAt: event.target.value })} /></Field>
                  <Field label="Конец"><Input className="w-32" type="time" name={`endsAt-${day}`} value={item.endsAt} disabled={!item.enabled} onChange={(event) => update(day, { endsAt: event.target.value })} /></Field>
                  <label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
                    <Checkbox name={`breakEnabled-${day}`} value="true" checked={item.breakEnabled} disabled={!item.enabled} onChange={(event) => update(day, { breakEnabled: event.target.checked })} />
                    Перерыв
                  </label>
                  {item.breakEnabled && item.enabled ? (
                    <>
                      <Field label="С"><Input className="w-32" type="time" name={`breakStartsAt-${day}`} value={item.breakStartsAt} onChange={(event) => update(day, { breakStartsAt: event.target.value })} /></Field>
                      <Field label="До"><Input className="w-32" type="time" name={`breakEndsAt-${day}`} value={item.breakEndsAt} onChange={(event) => update(day, { breakEndsAt: event.target.value })} /></Field>
                    </>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="flex justify-end">
          <SubmitButton idle="Сохранить расписание" pending="Сохраняем расписание" />
        </div>
      </form>
    </div>
  );
}
