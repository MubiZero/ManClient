"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { formatSomoni } from "@/core/formatting/money";
import {
  formatTajikPhoneInput,
  normalizeTajikPhone,
} from "@/core/formatting/tajik-phone";
import { Button } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { cn } from "@/features/ui-kit/cn";
import { Field, Input, Label } from "@/features/ui-kit/field";
import { SelectableCard } from "@/features/ui-kit/selectable-card";
import { StepProgress } from "@/features/ui-kit/step-progress";

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
    <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
      <StepProgress steps={steps} currentId={currentStep} />
      {branch && currentStep !== "branch" ? (
        <p className="text-sm text-muted-foreground">
          {branch.name}
          {service ? ` · ${service.name}` : ""}
          {staffId
            ? ` · ${service?.staffMembers.find((item) => item.id === staffId)?.displayName ?? ""}`
            : ""}
        </p>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-5 p-6">
          {currentStep === "branch" ? (
            <>
              <StepHeading number={1} title="Выберите филиал" />
              <div className="grid gap-3 sm:grid-cols-2">
                {branches.map((item) => (
                  <SelectableCard
                    key={item.id}
                    title={item.name}
                    selected={branchId === item.id}
                    onClick={() => chooseBranch(item.id)}
                  />
                ))}
              </div>
            </>
          ) : null}
          {currentStep === "service" && branch ? (
            <>
              <StepHeading
                number={branches.length > 1 ? 2 : 1}
                title="Выберите услугу"
                onBack={branches.length > 1 ? goBack : undefined}
                backLabel="Назад к выбору филиала"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {branch.services.map((item) => (
                  <SelectableCard
                    key={item.id}
                    title={item.name}
                    subtitle={`${item.durationMinutes} мин · ${formatSomoni(item.amountDiram)}`}
                    selected={serviceId === item.id}
                    onClick={() => chooseService(item.id)}
                  />
                ))}
              </div>
            </>
          ) : null}
          {currentStep === "staff" && service ? (
            <>
              <StepHeading
                number={branches.length > 1 ? 3 : 2}
                title="Выберите специалиста"
                onBack={goBack}
                backLabel="Назад к выбору услуги"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {service.staffMembers.map((item) => (
                  <SelectableCard
                    key={item.id}
                    title={item.displayName}
                    selected={staffId === item.id}
                    onClick={() => chooseStaff(item.id)}
                    icon={
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300"
                        aria-hidden
                      >
                        {item.displayName.slice(0, 1)}
                      </span>
                    }
                  />
                ))}
              </div>
            </>
          ) : null}
          {currentStep === "time" && branch && service ? (
            <>
              <StepHeading
                number={branches.length > 1 ? 4 : 3}
                title="Выберите время"
                onBack={goBack}
                backLabel="Назад к выбору специалиста"
              />
              <Field label="Дата записи" htmlFor="booking-date">
                <Input
                  id="booking-date"
                  type="date"
                  min={minDate}
                  value={date}
                  onChange={(event) => void loadSlots(event.target.value)}
                  className="max-w-xs"
                />
              </Field>
              {isLoadingSlots ? (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Ищем свободное время…
                </p>
              ) : date && starts.length === 0 && !error ? (
                <p className="text-sm text-muted-foreground">
                  На эту дату свободного времени нет. Выберите другой день.
                </p>
              ) : null}
              {starts.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Свободное время">
                  {starts.map((value) => (
                    <button
                      data-slot
                      key={value}
                      type="button"
                      aria-pressed={startsAt === value}
                      onClick={() => setStartsAt(value)}
                      className={cn(
                        "rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-secondary",
                        "aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground",
                      )}
                    >
                      {formatBookingTime(value, branch.timeZone)}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {currentStep === "contact" && branch && service ? (
            <>
              <StepHeading
                number={branches.length > 1 ? 5 : 4}
                title="Оставьте контакты"
                onBack={goBack}
                backLabel="Назад к выбору времени"
              />
              <p className="text-sm font-medium text-foreground">
                {formatBookingTime(startsAt, branch.timeZone)} · {service.name} ·{" "}
                {formatSomoni(service.amountDiram)}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Имя">
                  <Input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="booking-phone">Телефон</Label>
                  <Input
                    id="booking-phone"
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
                  {phoneError ? (
                    <p id="booking-phone-error" className="text-[13px] text-destructive" role="alert">
                      {phoneError}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                После записи слот будет удерживаться 15 минут для оплаты. Деньги
                поступят напрямую бизнесу.
              </p>
              <Button type="submit" size="lg" disabled={isSubmitting} loading={isSubmitting}>
                {isSubmitting ? "Создаём запись…" : "Перейти к оплате"}
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
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
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden
        >
          {number}
        </span>
        {title}
      </h2>
      {onBack ? (
        <Button type="button" variant="quiet" size="sm" onClick={onBack}>
          {backLabel}
        </Button>
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
