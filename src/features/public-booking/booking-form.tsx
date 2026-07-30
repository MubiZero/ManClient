"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { formatSomoni } from "@/core/formatting/money";
import {
  formatTajikPhoneInput,
  normalizeTajikPhone,
} from "@/core/formatting/tajik-phone";

type Staff = { id: string; displayName: string };
type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  amountDiram: number;
  staffMembers: Staff[];
  resources: { resourceId: string }[];
};
type Branch = {
  id: string;
  name: string;
  timeZone: string;
  services: Service[];
};
type BookingStep = "branch" | "service" | "staff" | "time" | "contact";

type BookingProgressInput = {
  branchCount: number;
  branchId?: string;
  serviceId: string;
  staffId: string;
  date: string;
  startsAt: string;
};

export function BookingForm({
  businessSlug,
  branches,
}: {
  businessSlug: string;
  branches: Branch[];
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(
    branches.length === 1 ? (branches[0]?.id ?? "") : "",
  );
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [starts, setStarts] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  const branch = branches.find(({ id }) => id === branchId);
  const service = branch?.services.find(({ id }) => id === serviceId);
  const currentStep = getBookingStep({
    branchCount: branches.length,
    branchId,
    serviceId,
    staffId,
    date,
    startsAt,
  });
  const minDate = todayInTimeZone(branch?.timeZone ?? "Asia/Dushanbe");
  const steps =
    branches.length > 1
      ? [
          { id: "branch", label: "Филиал" },
          { id: "service", label: "Услуга" },
          { id: "staff", label: "Специалист" },
          { id: "time", label: "Время" },
          { id: "contact", label: "Контакты" },
        ]
      : [
          { id: "service", label: "Услуга" },
          { id: "staff", label: "Специалист" },
          { id: "time", label: "Время" },
          { id: "contact", label: "Контакты" },
        ];

  useEffect(() => () => requestRef.current?.abort(), []);

  function clearSlots() {
    requestRef.current?.abort();
    setDate("");
    setStarts([]);
    setStartsAt("");
    setIsLoadingSlots(false);
  }

  function chooseBranch(nextBranchId: string) {
    setBranchId(nextBranchId);
    setServiceId("");
    setStaffId("");
    clearSlots();
    setError("");
  }

  function chooseService(nextServiceId: string) {
    setServiceId(nextServiceId);
    setStaffId("");
    clearSlots();
    setError("");
  }

  function chooseStaff(nextStaffId: string) {
    setStaffId(nextStaffId);
    clearSlots();
    setError("");
  }

  function goBack() {
    if (currentStep === "contact") {
      setStartsAt("");
      return;
    }
    if (currentStep === "time") {
      setStaffId("");
      clearSlots();
      return;
    }
    if (currentStep === "staff") {
      setServiceId("");
      setStaffId("");
      clearSlots();
      return;
    }
    if (currentStep === "service" && branches.length > 1) chooseBranch("");
  }

  async function loadSlots(nextDate: string) {
    setDate(nextDate);
    setStartsAt("");
    setStarts([]);
    setError("");
    requestRef.current?.abort();
    if (!nextDate || !service || !staffId || !branch) return;

    const request = new AbortController();
    requestRef.current = request;
    setIsLoadingSlots(true);
    try {
      const query = new URLSearchParams({
        branchId,
        serviceId: service.id,
        staffId,
        date: nextDate,
      });
      const response = await fetch(`/api/availability?${query}`, {
        signal: request.signal,
      });
      if (!response.ok) throw new Error("availability");
      const data = (await response.json()) as { starts: string[] };
      if (requestRef.current !== request) return;
      setStarts(data.starts);
    } catch {
      if (request.signal.aborted || requestRef.current !== request) return;
      setError(
        "Не удалось загрузить свободное время. Проверьте соединение и попробуйте ещё раз.",
      );
    } finally {
      if (requestRef.current === request) setIsLoadingSlots(false);
    }
  }

  function onPhoneBlur() {
    setPhoneError(validateBookingPhone(phone));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const normalizedPhone = normalizeTajikPhone(phone);
    if (!service || !staffId || !startsAt) {
      setError("Вернитесь к выбору времени и выберите свободный слот.");
      return;
    }
    if (!name.trim()) {
      setError("Введите имя, чтобы бизнес мог подтвердить запись.");
      return;
    }
    if (!normalizedPhone) {
      setPhoneError(validateBookingPhone(phone));
      return;
    }

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
          customer: { name: name.trim(), phone: normalizedPhone },
        }),
      });
      if (response.status === 409) {
        setStarts((values) => values.filter((value) => value !== startsAt));
        setStartsAt("");
        setError(
          "Это время только что заняли. Выберите другой свободный слот.",
        );
        return;
      }
      if (response.status === 503) {
        setError(
          "Онлайн-оплата этого филиала пока не настроена. Свяжитесь с бизнесом напрямую.",
        );
        return;
      }
      if (!response.ok) throw new Error("booking");
      const data = (await response.json()) as { paymentPath: string };
      router.replace(data.paymentPath);
    } catch {
      setError("Запись не создана. Проверьте данные и попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="booking-form" onSubmit={submit} noValidate>
      <ol className="booking-progress" aria-label="Шаги записи">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={
              step.id === currentStep
                ? "is-current"
                : steps.findIndex((item) => item.id === currentStep) > index
                  ? "is-complete"
                  : ""
            }
            aria-current={step.id === currentStep ? "step" : undefined}
          >
            <span>{index + 1}</span>
            {step.label}
          </li>
        ))}
      </ol>
      {branch && currentStep !== "branch" ? (
        <p className="booking-selection">
          {branch.name}
          {service ? ` · ${service.name}` : ""}
          {staffId
            ? ` · ${service?.staffMembers.find((item) => item.id === staffId)?.displayName ?? ""}`
            : ""}
        </p>
      ) : null}

      {currentStep === "branch" ? (
        <section className="form-section">
          <StepHeading number={1} title="Выберите филиал" />
          <div className="choice-grid">
            {branches.map((item) => (
              <button
                key={item.id}
                type="button"
                className="choice"
                aria-pressed={branchId === item.id}
                onClick={() => chooseBranch(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {currentStep === "service" && branch ? (
        <section className="form-section">
          <StepHeading
            number={branches.length > 1 ? 2 : 1}
            title="Выберите услугу"
            onBack={branches.length > 1 ? goBack : undefined}
            backLabel="Назад к выбору филиала"
          />
          <div className="choice-grid services">
            {branch.services.map((item) => (
              <button
                key={item.id}
                type="button"
                className="choice service-choice"
                aria-pressed={serviceId === item.id}
                onClick={() => chooseService(item.id)}
              >
                <strong>{item.name}</strong>
                <small>
                  {item.durationMinutes} мин · {formatSomoni(item.amountDiram)}
                </small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {currentStep === "staff" && service ? (
        <section className="form-section">
          <StepHeading
            number={branches.length > 1 ? 3 : 2}
            title="Выберите специалиста"
            onBack={goBack}
            backLabel="Назад к выбору услуги"
          />
          <div className="choice-grid">
            {service.staffMembers.map((item) => (
              <button
                key={item.id}
                type="button"
                className="choice staff-choice"
                aria-pressed={staffId === item.id}
                onClick={() => chooseStaff(item.id)}
              >
                <span className="avatar" aria-hidden>
                  {item.displayName.slice(0, 1)}
                </span>
                {item.displayName}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {currentStep === "time" && branch && service ? (
        <section className="form-section">
          <StepHeading
            number={branches.length > 1 ? 4 : 3}
            title="Выберите время"
            onBack={goBack}
            backLabel="Назад к выбору специалиста"
          />
          <label className="field-label" htmlFor="booking-date">
            Дата записи
          </label>
          <input
            id="booking-date"
            className="text-input date-input"
            type="date"
            min={minDate}
            value={date}
            onChange={(event) => void loadSlots(event.target.value)}
          />
          {isLoadingSlots ? (
            <p className="status-text" aria-live="polite">
              Ищем свободное время…
            </p>
          ) : date && starts.length === 0 && !error ? (
            <p className="status-text">
              На эту дату свободного времени нет. Выберите другой день.
            </p>
          ) : null}
          {starts.length ? (
            <div className="slot-grid" aria-label="Свободное время">
              {starts.map((value) => (
                <button
                  data-slot
                  key={value}
                  type="button"
                  aria-pressed={startsAt === value}
                  onClick={() => setStartsAt(value)}
                >
                  {formatBookingTime(value, branch.timeZone)}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {currentStep === "contact" && branch && service ? (
        <section className="form-section contact-section">
          <StepHeading
            number={branches.length > 1 ? 5 : 4}
            title="Оставьте контакты"
            onBack={goBack}
            backLabel="Назад к выбору времени"
          />
          <p className="booking-summary">
            {formatBookingTime(startsAt, branch.timeZone)} · {service.name} ·{" "}
            {formatSomoni(service.amountDiram)}
          </p>
          <div className="field-grid">
            <label className="field-label">
              Имя
              <input
                className="text-input"
                name="name"
                autoComplete="name"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="field-label">
              Телефон
              <input
                className="text-input"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+992 90 000 00 00"
                value={phone}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={
                  phoneError ? "booking-phone-error" : undefined
                }
                onChange={(event) => {
                  setPhone(formatTajikPhoneInput(event.target.value));
                  setPhoneError(null);
                }}
                onBlur={onPhoneBlur}
              />
            </label>
          </div>
          {phoneError ? (
            <p id="booking-phone-error" className="field-error" role="alert">
              {phoneError}
            </p>
          ) : null}
          <p className="payment-note">
            После записи слот будет удерживаться 15 минут для оплаты. Деньги
            поступят напрямую бизнесу.
          </p>
          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Создаём запись…" : "Перейти к оплате"}
          </button>
        </section>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function StepHeading({
  number,
  title,
  onBack,
  backLabel = "Назад",
}: {
  number: number;
  title: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="booking-step-heading">
      <h2>
        <span>{number}</span> {title}
      </h2>
      {onBack ? (
        <button className="quiet-action" type="button" onClick={onBack}>
          {backLabel}
        </button>
      ) : null}
    </div>
  );
}

export function getBookingStep(input: BookingProgressInput): BookingStep {
  if (input.branchCount > 1 && !input.branchId) return "branch";
  if (!input.serviceId) return "service";
  if (!input.staffId) return "staff";
  if (!input.startsAt) return "time";
  return "contact";
}

export function validateBookingPhone(value: string): string | null {
  return normalizeTajikPhone(value)
    ? null
    : "Введите номер полностью: +992 90 123 45 67.";
}

export function formatBookingTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
