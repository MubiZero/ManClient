"use client";

import { useEffect, useRef, useState } from "react";

import { Card, CardContent } from "@/features/ui-kit/card";
import { Field, Input } from "@/features/ui-kit/field";

export function RescheduleForm({ token, branchId, serviceId, staffId }: { token: string; branchId: string; serviceId: string; staffId: string }) {
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
    setMessage(response.status === 409 ? "Это время только что заняли. Выберите другой слот." : "Ссылка истекла или запись уже недоступна для переноса.");
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
                {new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dushanbe", hour: "2-digit", minute: "2-digit" }).format(new Date(value))}
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
