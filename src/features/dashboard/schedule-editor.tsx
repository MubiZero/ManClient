"use client";

import { useState } from "react";

import { SubmitButton } from "@/features/ui/submit-button";

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

  return <div className="schedule-editor">
    {mode === "staff" && inherited ? <div className="schedule-inherited" role="status">
      <div><strong>Используется график филиала</strong><p>Создайте личный график только если специалист работает в другое время.</p></div>
      {restoreAction ? <form action={restoreAction}><input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="staffId" value={staffId} /><SubmitButton variant="secondary" idle="Вернуть график филиала" pending="Возвращаем" /></form> : null}
    </div> : null}
    <form action={action} className="entity-form schedule-form">
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="staffId" value={staffId} />
      <div className="schedule-toolbar">
        <div><h2>{mode === "branch" ? "Рабочая неделя филиала" : "График специалиста"}</h2><p>Выключенный день считается выходным. Перерыв исключается из свободного времени.</p></div>
        <button className="ui-button ui-button-secondary" type="button" onClick={copyMondayToWeekdays}>Скопировать на будни</button>
      </div>
      <div className="schedule-days">
        {days.map(({ value: day, label }) => {
          const item = values[day];
          return <fieldset className="schedule-day" key={day}>
            <legend>{label}</legend>
            <label className="schedule-enabled"><input type="checkbox" name={`enabled-${day}`} value="true" checked={item.enabled} onChange={(event) => update(day, { enabled: event.target.checked })} /><span>{item.enabled ? "Рабочий день" : "Выходной"}</span></label>
            <div className="schedule-time-range">
              <label><span>Начало</span><input className="ui-input" type="time" name={`startsAt-${day}`} value={item.startsAt} disabled={!item.enabled} onChange={(event) => update(day, { startsAt: event.target.value })} /></label>
              <label><span>Конец</span><input className="ui-input" type="time" name={`endsAt-${day}`} value={item.endsAt} disabled={!item.enabled} onChange={(event) => update(day, { endsAt: event.target.value })} /></label>
            </div>
            <label className="schedule-enabled"><input type="checkbox" name={`breakEnabled-${day}`} value="true" checked={item.breakEnabled} disabled={!item.enabled} onChange={(event) => update(day, { breakEnabled: event.target.checked })} /><span>Перерыв</span></label>
            {item.breakEnabled && item.enabled ? <div className="schedule-time-range">
              <label><span>С</span><input className="ui-input" type="time" name={`breakStartsAt-${day}`} value={item.breakStartsAt} onChange={(event) => update(day, { breakStartsAt: event.target.value })} /></label>
              <label><span>До</span><input className="ui-input" type="time" name={`breakEndsAt-${day}`} value={item.breakEndsAt} onChange={(event) => update(day, { breakEndsAt: event.target.value })} /></label>
            </div> : null}
          </fieldset>;
        })}
      </div>
      {error ? <p className="entity-error" role="alert">{error}</p> : null}
      <div className="entity-form-actions"><SubmitButton idle="Сохранить расписание" pending="Сохраняем расписание" /></div>
    </form>
  </div>;
}
