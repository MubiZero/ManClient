"use client";

import { useState } from "react";

import { Button } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { Field, Input, Select, Textarea } from "@/features/ui-kit/field";

export type BookingPolicyValue = {
  minLeadTimeMinutes: number;
  maxAdvanceDays: number | null;
  freeCancellationHours: number;
  maxCustomerReschedules: number | null;
  cancellationPolicy: string | null;
  prepaymentMode: "FULL" | "DEPOSIT" | "NONE";
  depositPercent: number | null;
  depositAmountDiram: number | null;
};

/**
 * Minutes and hours are offered as a fixed list rather than a free number field: "за сколько принимать
 * записи" is a decision with maybe six sensible answers, and a text field invites 120 to be typed where
 * 2 was meant. "Без ограничения" is a real option and stays the default, because it is how every
 * business behaved before this page existed.
 */
const LEAD_TIME_OPTIONS = [
  { value: 0, label: "Сразу, без запаса" },
  { value: 30, label: "За 30 минут" },
  { value: 60, label: "За 1 час" },
  { value: 120, label: "За 2 часа" },
  { value: 180, label: "За 3 часа" },
  { value: 360, label: "За 6 часов" },
  { value: 720, label: "За 12 часов" },
  { value: 1440, label: "За сутки" },
];

const CANCELLATION_OPTIONS = [
  { value: 0, label: "В любое время до визита" },
  { value: 2, label: "Не позднее чем за 2 часа" },
  { value: 4, label: "Не позднее чем за 4 часа" },
  { value: 12, label: "Не позднее чем за 12 часов" },
  { value: 24, label: "Не позднее чем за сутки" },
  { value: 48, label: "Не позднее чем за 2 суток" },
];

export function BookingPolicyForm({ initial }: { initial: BookingPolicyValue }) {
  const [minLeadTimeMinutes, setMinLeadTimeMinutes] = useState(initial.minLeadTimeMinutes);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(initial.maxAdvanceDays === null ? "" : String(initial.maxAdvanceDays));
  const [freeCancellationHours, setFreeCancellationHours] = useState(initial.freeCancellationHours);
  const [maxCustomerReschedules, setMaxCustomerReschedules] = useState(
    initial.maxCustomerReschedules === null ? "" : String(initial.maxCustomerReschedules),
  );
  const [cancellationPolicy, setCancellationPolicy] = useState(initial.cancellationPolicy ?? "");
  const [prepaymentMode, setPrepaymentMode] = useState(initial.prepaymentMode);
  const [depositPercent, setDepositPercent] = useState(initial.depositPercent === null ? "" : String(initial.depositPercent));
  const [depositSomoni, setDepositSomoni] = useState(initial.depositAmountDiram === null ? "" : (initial.depositAmountDiram / 100).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // The control the server named, so the answer sits on the box that caused it rather than under the
  // whole page. Cleared with the error, never left pointing at a field the next attempt did not touch.
  const [errorField, setErrorField] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    setErrorField(null);
    setNotice("");
    try {
      const response = await fetch("/api/dashboard/settings/policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          minLeadTimeMinutes,
          maxAdvanceDays: maxAdvanceDays.trim() === "" ? null : Number(maxAdvanceDays),
          freeCancellationHours,
          maxCustomerReschedules: maxCustomerReschedules.trim() === "" ? null : Number(maxCustomerReschedules),
          cancellationPolicy,
          prepaymentMode,
          depositPercent: depositPercent.trim() === "" ? null : Number(depositPercent),
          depositSomoni: depositSomoni.trim() === "" ? null : depositSomoni,
        }),
      });
      const result = (await response.json()) as { error?: string; field?: string };
      if (!response.ok) {
        setErrorField(result.field ?? null);
        throw new Error(result.error);
      }
      setNotice("Правила записи сохранены");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 pt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Принимать записи не позднее чем" error={errorField === "minLeadTimeMinutes" ? error : undefined} hint="Насколько заранее клиент должен записаться. Сотрудники в кабинете не ограничены.">
            <Select value={String(minLeadTimeMinutes)} onChange={(event) => setMinLeadTimeMinutes(Number(event.target.value))}>
              {LEAD_TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Горизонт записи, дней" error={errorField === "maxAdvanceDays" ? error : undefined} hint="На сколько дней вперёд открыт календарь. Пусто — без ограничения.">
            <Input
              type="number"
              min={1}
              max={365}
              value={maxAdvanceDays}
              placeholder="Без ограничения"
              onChange={(event) => setMaxAdvanceDays(event.target.value)}
            />
          </Field>
          <Field label="Клиент может отменить или перенести" error={errorField === "freeCancellationHours" ? error : undefined} hint="После этого срока отмена и перенос доступны только через бизнес.">
            <Select value={String(freeCancellationHours)} onChange={(event) => setFreeCancellationHours(Number(event.target.value))}>
              {CANCELLATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Лимит переносов одной записи" error={errorField === "maxCustomerReschedules" ? error : undefined} hint="Сколько раз клиент может перенести визит сам. Пусто — без лимита.">
            <Input
              type="number"
              min={0}
              max={20}
              value={maxCustomerReschedules}
              placeholder="Без лимита"
              onChange={(event) => setMaxCustomerReschedules(event.target.value)}
            />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-4 rounded-md border border-border bg-secondary/40 p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">Предоплата</legend>
          <Field label="Что клиент оплачивает при записи" error={errorField === "prepaymentMode" ? error : undefined} hint="«Ничего» подтверждает запись сразу, оплата — на месте.">
            <Select value={prepaymentMode} onChange={(event) => setPrepaymentMode(event.target.value as BookingPolicyValue["prepaymentMode"])}>
              <option value="FULL">Полную стоимость услуги</option>
              <option value="DEPOSIT">Депозит, остаток на месте</option>
              <option value="NONE">Ничего — оплата на месте</option>
            </Select>
          </Field>
          {prepaymentMode === "DEPOSIT" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Депозит, % от стоимости" error={errorField === "depositPercent" ? error : undefined} hint="Округляется вверх до целых сомони.">
                <Input type="number" min={1} max={100} value={depositPercent} placeholder="30" onChange={(event) => setDepositPercent(event.target.value)} />
              </Field>
              <Field label="Или фиксированный депозит, сомони" error={errorField === "depositSomoni" ? error : undefined} hint="Если заполнено, используется вместо процента.">
                <Input value={depositSomoni} placeholder="50.00" onChange={(event) => setDepositSomoni(event.target.value)} />
              </Field>
            </div>
          ) : null}
        </fieldset>

        <Field
          label="Текст правил для клиентов"
          hint="Показывается на странице онлайн-записи рядом с автоматически рассчитанными правилами."
          htmlFor="cancellation-policy"
        >
          <Textarea
            id="cancellation-policy"
            value={cancellationPolicy}
            onChange={(event) => setCancellationPolicy(event.target.value)}
            maxLength={500}
            placeholder="Например: при опоздании больше чем на 15 минут визит переносится."
          />
        </Field>

        {error && !errorField ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {notice ? <p className="text-sm text-primary" role="status">{notice}</p> : null}

        <div className="flex justify-end">
          <Button type="button" onClick={save} loading={saving}>
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_INPUT";
  return ({
    INVALID_INPUT: "Проверьте введённые значения.",
    FORBIDDEN: "У вас нет доступа к правилам записи. Обратитесь к владельцу бизнеса.",
    NOT_FOUND: "Бизнес не найден.",
  } as Record<string, string>)[code] ?? "Не удалось сохранить. Попробуйте ещё раз.";
}
