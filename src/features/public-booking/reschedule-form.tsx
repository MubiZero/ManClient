"use client";

import { useEffect, useRef, useState } from "react";

import { Card, CardContent } from "@/features/ui-kit/card";
import { Field, Input } from "@/features/ui-kit/field";

export function RescheduleForm({ token, branchId, serviceId, staffId, timeZone }: { token: string; branchId: string; serviceId: string; staffId: string; timeZone: string }) {
  const [starts, setStarts] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function load(date: string) {
    setMessage("");
    setStarts([]);
    requestRef.current?.abort();
    if (!date) return;

    const request = new AbortController();
    requestRef.current = request;
    const query = new URLSearchParams({ branchId, serviceId, staffId, date });
    try {
      const response = await fetch(`/api/availability?${query}`, { signal: request.signal });
      const data = (await response.json()) as { starts?: string[] };
      if (requestRef.current !== request) return;
      setStarts(data.starts ?? []);
      if (!data.starts?.length) setMessage("На эту дату свободного времени нет. Выберите другой день.");
    } catch {
      if (request.signal.aborted || requestRef.current !== request) return;
      setMessage("Не удалось загрузить свободное время. Проверьте соединение и попробуйте ещё раз.");
    }
  }

  async function select(startsAt: string) {
    const response = await fetch("/api/bookings/reschedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, startsAt }) });
    if (response.ok) { setStarts([]); setMessage("Запись перенесена. Новое время сохранено."); return; }
    if (response.status === 409) { setMessage("Это время только что заняли. Выберите другой слот."); return; }
    if (response.status === 422) {
      const data = (await response.json()) as { error?: string; limit?: number };
      setStarts([]);
      setMessage(policyMessage(data.error, data.limit));
      return;
    }
    setMessage("Ссылка истекла или запись уже недоступна для переноса.");
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <Field label="Новая дата" htmlFor="reschedule-date">
          <Input
            id="reschedule-date"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            onChange={(event) => void load(event.target.value)}
            className="max-w-xs"
          />
        </Field>
        {starts.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Свободное время">
            {starts.map((value) => (
              <button
                data-slot
                key={value}
                type="button"
                onClick={() => void select(value)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-secondary"
              >
                {new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value))}
              </button>
            ))}
          </div>
        ) : null}
        {message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The refusal has to name the rule. "Перенос недоступен" sends the customer to the phone; "не позднее
 * чем за 4 часа" tells them what happened and that the business can still help.
 */
function policyMessage(code: string | undefined, limit: number | undefined): string {
  if (code === "RESCHEDULE_LIMIT_REACHED") {
    return `Эту запись уже переносили ${limit ?? 0} раз(а) — больше переносов бизнес не разрешает. Свяжитесь с бизнесом, если время не подходит.`;
  }
  if (code === "RESCHEDULE_WINDOW_CLOSED") {
    return `Перенести запись можно не позднее чем за ${limit ?? 0} ч до визита. Свяжитесь с бизнесом напрямую.`;
  }
  return "Перенос этой записи сейчас недоступен. Свяжитесь с бизнесом напрямую.";
}
