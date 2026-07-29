"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Staff = { id: string; displayName: string };
type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  amountDiram: number;
  staffMembers: Staff[];
  resources: { resourceId: string }[];
};
type Branch = { id: string; name: string; services: Service[] };

export function BookingForm({ businessSlug, branches }: { businessSlug: string; branches: Branch[] }) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [starts, setStarts] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const branch = branches.find(({ id }) => id === branchId) ?? branches[0];
  const service = branch?.services.find(({ id }) => id === serviceId);
  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function loadSlots(nextDate: string) {
    setDate(nextDate);
    setStartsAt("");
    setStarts([]);
    setError("");
    if (!nextDate || !service || !staffId) return;

    setIsLoadingSlots(true);
    try {
      const query = new URLSearchParams({ branchId, serviceId: service.id, staffId, date: nextDate });
      const response = await fetch(`/api/availability?${query}`);
      if (!response.ok) throw new Error("availability");
      const data = (await response.json()) as { starts: string[] };
      setStarts(data.starts);
    } catch {
      setError("Не удалось загрузить свободное время. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setIsLoadingSlots(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!service || !staffId || !startsAt) {
      setError("Выберите услугу, специалиста, дату и время записи.");
      return;
    }

    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessSlug,
          branchId,
          serviceId: service.id,
          staffId,
          resourceIds: service.resources.map(({ resourceId }) => resourceId),
          startsAt,
          customer: { name: form.get("name"), phone: form.get("phone") },
        }),
      });
      if (response.status === 409) {
        setStarts((values) => values.filter((value) => value !== startsAt));
        setStartsAt("");
        setError("Это время только что заняли. Выберите другой свободный слот.");
        return;
      }
      if (response.status === 503) {
        setError("Онлайн-оплата этого филиала пока не настроена. Свяжитесь с бизнесом напрямую.");
        return;
      }
      if (!response.ok) throw new Error("booking");
      const data = (await response.json()) as { paymentPath: string };
      router.replace(data.paymentPath);
    } catch {
      setError("Запись не создана. Проверьте имя и номер +992, затем попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="booking-form" onSubmit={submit} noValidate>
      <>
      {branches.length > 1 && (
        <div className="form-section">
          <h2><span>1</span> Выберите филиал</h2>
          <div className="choice-grid">
            {branches.map((item) => (
              <button key={item.id} type="button" className="choice" aria-pressed={branchId === item.id} onClick={() => {
                setBranchId(item.id); setServiceId(""); setStaffId(""); setDate(""); setStarts([]);
              }}>{item.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="form-section">
        <h2><span>{branches.length > 1 ? "2" : "1"}</span> Выберите услугу</h2>
        <div className="choice-grid services">
          {branch.services.map((item) => (
            <button key={item.id} type="button" className="choice service-choice" aria-pressed={serviceId === item.id} onClick={() => {
              setServiceId(item.id); setStaffId(""); setDate(""); setStarts([]);
            }}>
              <strong>{item.name}</strong>
              <small>{item.durationMinutes} мин · {(item.amountDiram / 100).toFixed(2)} TJS</small>
            </button>
          ))}
        </div>
      </div>

      {service && (
        <div className="form-section">
          <h2><span>{branches.length > 1 ? "3" : "2"}</span> Выберите специалиста</h2>
          <div className="choice-grid">
            {service.staffMembers.map((item) => (
              <button key={item.id} type="button" className="choice staff-choice" aria-pressed={staffId === item.id} onClick={() => {
                setStaffId(item.id); setDate(""); setStarts([]);
              }}>
                <span className="avatar" aria-hidden>{item.displayName.slice(0, 1)}</span>{item.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      {staffId && (
        <div className="form-section">
          <h2><span>{branches.length > 1 ? "4" : "3"}</span> Выберите время</h2>
          <label className="field-label" htmlFor="booking-date">Дата записи</label>
          <input id="booking-date" className="text-input date-input" type="date" min={minDate} value={date} onChange={(event) => void loadSlots(event.target.value)} />
          {isLoadingSlots ? <p className="status-text" aria-live="polite">Ищем свободное время…</p> : date && starts.length === 0 && !error ? <p className="status-text">На эту дату свободного времени нет. Выберите другой день.</p> : null}
          {starts.length > 0 && <div className="slot-grid" aria-label="Свободное время">
            {starts.map((value) => <button data-slot key={value} type="button" aria-pressed={startsAt === value} onClick={() => setStartsAt(value)}>{formatTime(value)}</button>)}
          </div>}
        </div>
      )}

      {startsAt && (
        <div className="form-section contact-section">
          <h2><span>{branches.length > 1 ? "5" : "4"}</span> Оставьте контакты</h2>
          <div className="field-grid">
            <label className="field-label">Имя<input className="text-input" name="name" autoComplete="name" required maxLength={120} /></label>
            <label className="field-label">Телефон<input className="text-input" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+992 90 000 00 00" pattern="\+992[0-9]{9}" required /></label>
          </div>
          <p className="payment-note">После записи откроется DushanbeCity. Деньги поступят напрямую бизнесу.</p>
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Создаём запись…" : "Перейти к оплате"}</button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      </>
    </form>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dushanbe", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
