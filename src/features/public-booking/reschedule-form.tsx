"use client";

import { useState } from "react";

export function RescheduleForm({ token, branchId, serviceId, staffId }: { token: string; branchId: string; serviceId: string; staffId: string }) {
  const [starts, setStarts] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  async function load(date: string) {
    setMessage("");
    const query = new URLSearchParams({ branchId, serviceId, staffId, date });
    const response = await fetch(`/api/availability?${query}`);
    const data = (await response.json()) as { starts?: string[] };
    setStarts(data.starts ?? []);
    if (!data.starts?.length) setMessage("На эту дату свободного времени нет. Выберите другой день.");
  }

  async function select(startsAt: string) {
    const response = await fetch("/api/bookings/reschedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, startsAt }) });
    if (response.ok) { setStarts([]); setMessage("Запись перенесена. Новое время сохранено."); return; }
    setMessage(response.status === 409 ? "Это время только что заняли. Выберите другой слот." : "Ссылка истекла или запись уже недоступна для переноса.");
  }

  return <section className="booking-form"><div className="form-section"><label className="field-label">Новая дата<input className="text-input date-input" type="date" min={new Date().toISOString().slice(0, 10)} onChange={event => void load(event.target.value)} /></label>{starts.length > 0 && <div className="slot-grid">{starts.map(value => <button key={value} type="button" onClick={() => void select(value)}>{new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dushanbe", hour: "2-digit", minute: "2-digit" }).format(new Date(value))}</button>)}</div>}{message && <p className="status-text" role="status">{message}</p>}</div></section>;
}
