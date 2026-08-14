"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { formatLocaleDayNumber, formatLocaleWeekdayShort, formatLocaleTime } from "@/core/formatting/locale-date";
import { localDateTimeToUtc, todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { formatSomoni } from "@/core/formatting/money";
import {
  formatTajikPhoneInput,
  normalizeTajikPhone,
} from "@/core/formatting/tajik-phone";
import { PhoneVerificationPanel } from "@/features/public-booking/phone-verification-panel";
import { Button } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/features/ui-kit/dialog";
import { Checkbox } from "@/features/ui-kit/checkbox";
import { cn } from "@/features/ui-kit/cn";
import { Field, Input, Label, Select } from "@/features/ui-kit/field";
import { SelectableCard } from "@/features/ui-kit/selectable-card";
/** Sent instead of an id when the customer has no preference; the server picks who is free. */
const ANY_STAFF = "any";
import { StepProgress } from "@/features/ui-kit/step-progress";
import type { SupportedLocale } from "@/i18n/translate";
import { intlLocale, moneyLocale, t } from "@/i18n/translate";

type RepeatFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
const MIN_OCCURRENCES = 2;
const MAX_OCCURRENCES = 12;
const DEFAULT_OCCURRENCES = 4;

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

type PromoStatus = "idle" | "checking" | "valid" | "invalid";

export function BookingForm({
  businessSlug,
  branches,
  locale,
  canRepeat = false,
  canUsePromoCodes = false,
  canUseWaitlist = false,
  signedInCustomer = null,
}: {
  businessSlug: string;
  branches: Branch[];
  locale: SupportedLocale;
  canRepeat?: boolean;
  canUsePromoCodes?: boolean;
  canUseWaitlist?: boolean;
  /** Filled in when this browser has signed in: their own number, and the name a salon knows them by. */
  signedInCustomer?: { phone: string; name: string | null } | null;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(
    branches.length === 1 ? (branches[0]?.id ?? "") : "",
  );
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [starts, setStarts] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<{ date: string; hasSlots: boolean }[]>([]);
  /**
   * The date as it is right now, for the day strip to read when its request comes back. The strip
   * loads over the network, and by the time it answers the customer may already have picked a day —
   * reading `date` from the closure would then quietly move them off it.
   */
  const chosenDateRef = useRef("");
  const [startsAt, setStartsAt] = useState("");
  const [name, setName] = useState(signedInCustomer?.name ?? "");
  const [phone, setPhone] = useState(signedInCustomer ? formatTajikPhoneInput(signedInCustomer.phone) : "");
  // A primitive, so the draft restore below cannot be re-run by a prop object that is equal but new.
  const isSignedIn = Boolean(signedInCustomer);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>("WEEKLY");
  const [repeatCount, setRepeatCount] = useState(DEFAULT_OCCURRENCES);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [promoStatus, setPromoStatus] = useState<PromoStatus>("idle");
  const [promoDiscountDiram, setPromoDiscountDiram] = useState(0);
  const [promoFinalAmountDiram, setPromoFinalAmountDiram] = useState<number | null>(null);
  const [isCheckingPromo, setIsCheckingPromo] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistName, setWaitlistName] = useState("");
  const [waitlistPhone, setWaitlistPhone] = useState("");
  const [waitlistFrom, setWaitlistFrom] = useState("");
  const [waitlistTo, setWaitlistTo] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");
  const [waitlistDone, setWaitlistDone] = useState(false);
  // Verification is discovered, not configured: the form submits as before and only asks for a code
  // when the server refuses with VERIFICATION_REQUIRED. That keeps this component correct both before
  // and after the moderated SMS template goes live.
  const [pendingVerification, setPendingVerification] = useState<"booking" | "waitlist" | null>(null);
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
          { id: "branch", label: t(locale, "booking.steps.branch") },
          { id: "service", label: t(locale, "booking.steps.service") },
          { id: "staff", label: t(locale, "booking.steps.staff") },
          { id: "time", label: t(locale, "booking.steps.time") },
          { id: "contact", label: t(locale, "booking.steps.contact") },
        ]
      : [
          { id: "service", label: t(locale, "booking.steps.service") },
          { id: "staff", label: t(locale, "booking.steps.staff") },
          { id: "time", label: t(locale, "booking.steps.time") },
          { id: "contact", label: t(locale, "booking.steps.contact") },
        ];

  useEffect(() => () => requestRef.current?.abort(), []);

  function clearSlots() {
    requestRef.current?.abort();
    chosenDateRef.current = "";
    setDate("");
    setStarts([]);
    setAvailableDays([]);
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

  /**
   * What the customer has typed, kept for the length of the tab. A dropped connection or a switch to
   * the SMS app used to send them back through four steps, and on a flaky mobile network that is
   * where a booking is abandoned.
   *
   * The chosen day and time are deliberately not kept: a slot restored from storage may well be taken
   * by now, and offering it again only produces a refusal at the last step.
   */
  useEffect(() => {
    // Read after mount rather than in a state initialiser: the server renders this form too, and
    // reading storage during hydration would make the markup disagree with itself.
    const saved = readSavedBooking(businessSlug);
    if (!saved) return;
    /* eslint-disable react-hooks/set-state-in-effect -- restoring a draft is exactly the case the
       rule warns about, and it is the intended one: it happens once on mount, from a source React
       cannot see, and the extra render is the point rather than an accident. */
    if (saved.branchId) setBranchId(saved.branchId);
    if (saved.serviceId) setServiceId(saved.serviceId);
    if (saved.staffId) setStaffId(saved.staffId);
    // A signed-in customer's own details outrank a draft: the draft may have been typed by whoever
    // used this browser before them, and their number is the one the session proved.
    if (saved.name && !isSignedIn) setName(saved.name);
    if (saved.phone && !isSignedIn) setPhone(saved.phone);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [businessSlug, isSignedIn]);

  useEffect(() => {
    saveBooking(businessSlug, { branchId, serviceId, staffId, name, phone });
  }, [businessSlug, branchId, serviceId, staffId, name, phone]);

  /**
   * The strip of days behind the date field. Loaded once when the specialist is known, so the
   * customer sees which days are worth tapping instead of guessing one and waiting to be refused.
   */
  useEffect(() => {
    if (!service || !staffId || !branchId) return;
    const request = new AbortController();
    const from = todayInTimeZone(branch?.timeZone ?? "Asia/Dushanbe");
    const query = new URLSearchParams({ branchId, serviceId: service.id, staffId, from, days: "14" });
    void (async () => {
      try {
        const response = await fetch(`/api/availability/days?${query}`, { signal: request.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { days: { date: string; hasSlots: boolean }[] };
        if (request.signal.aborted) return;
        setAvailableDays(data.days);
        // Opening the first free day saves the customer the guess entirely — but only while they have
        // not chosen one themselves. A strip with nothing free is left alone so the waitlist offer
        // below can speak for itself.
        const firstFree = data.days.find((day) => day.hasSlots);
        if (firstFree && !chosenDateRef.current) void loadSlots(firstFree.date);
      } catch {
        // A failed strip is not worth an error: the date field below still works on its own.
      }
    })();
    return () => request.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, service?.id, staffId]);

  async function loadSlots(nextDate: string) {
    chosenDateRef.current = nextDate;
    setDate(nextDate);
    setStartsAt("");
    setStarts([]);
    setError("");
    setWaitlistOpen(false);
    setWaitlistDone(false);
    setWaitlistError("");
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
      setError(t(locale, "booking.errors.slotsLoadFailed"));
    } finally {
      if (requestRef.current === request) setIsLoadingSlots(false);
    }
  }

  function onPhoneBlur() {
    setPhoneError(validateBookingPhone(phone, locale));
  }

  function openWaitlist() {
    // Prefilled from the main form: by this point the customer has already picked a day and may have
    // typed their name and phone, and asking for them twice is how a queue stays empty.
    setWaitlistName((current) => current || name);
    setWaitlistPhone((current) => current || phone);
    setWaitlistFrom((current) => current || date);
    setWaitlistTo((current) => current || addDays(date, 7));
    setWaitlistError("");
    setWaitlistDone(false);
    setPendingVerification(null);
    setWaitlistOpen(true);
  }

  async function submitWaitlist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await joinWaitlist();
  }

  async function joinWaitlist(phoneVerificationId?: string) {
    setWaitlistError("");
    if (!branch || !service || !staffId) return;
    const normalizedPhone = normalizeTajikPhone(waitlistPhone);
    if (!waitlistName.trim()) {
      setWaitlistError(t(locale, "booking.waitlist.nameRequired"));
      return;
    }
    if (!normalizedPhone) {
      setWaitlistError(t(locale, "booking.waitlist.phoneInvalid"));
      return;
    }
    if (!waitlistFrom || !waitlistTo) {
      setWaitlistError(t(locale, "booking.waitlist.periodRequired"));
      return;
    }

    let desiredFrom: Date;
    let desiredTo: Date;
    try {
      desiredFrom = localDateTimeToUtc(waitlistFrom, "00:00", branch.timeZone);
      desiredTo = localDateTimeToUtc(waitlistTo, "23:59", branch.timeZone);
    } catch {
      setWaitlistError(t(locale, "booking.waitlist.datesInvalid"));
      return;
    }
    if (desiredFrom >= desiredTo) {
      setWaitlistError(t(locale, "booking.waitlist.rangeInvalid"));
      return;
    }

    setWaitlistSubmitting(true);
    try {
      const response = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessSlug,
          branchId,
          serviceId: service.id,
          staffId,
          desiredFrom: desiredFrom.toISOString(),
          desiredTo: desiredTo.toISOString(),
          customer: { name: waitlistName.trim(), phone: normalizedPhone },
          ...(phoneVerificationId ? { phoneVerificationId } : {}),
        }),
      });
      if (response.status === 403) {
        const data = (await response.json()) as { error?: string };
        if (data.error === "VERIFICATION_REQUIRED") {
          setPendingVerification("waitlist");
          return;
        }
      }
      if (response.status === 429) {
        setWaitlistError(t(locale, "booking.errors.rateLimited"));
        return;
      }
      if (!response.ok) throw new Error("waitlist");
      setPendingVerification(null);
      setWaitlistDone(true);
    } catch {
      setWaitlistError(t(locale, "booking.waitlist.submitFailed"));
    } finally {
      setWaitlistSubmitting(false);
    }
  }

  function onPromoCodeChange(value: string) {
    setPromoCodeInput(value);
    setPromoStatus("idle");
    setPromoDiscountDiram(0);
    setPromoFinalAmountDiram(null);
  }

  async function applyPromoCode() {
    if (!service || !promoCodeInput.trim()) return;
    setIsCheckingPromo(true);
    setPromoStatus("checking");
    try {
      const response = await fetch("/api/public/promo/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessSlug, code: promoCodeInput.trim(), serviceId: service.id }),
      });
      const data = (await response.json()) as {
        valid: boolean;
        discountDiram?: number;
        finalAmountDiram?: number;
      };
      if (data.valid) {
        setPromoStatus("valid");
        setPromoDiscountDiram(data.discountDiram ?? 0);
        setPromoFinalAmountDiram(data.finalAmountDiram ?? service.amountDiram);
      } else {
        setPromoStatus("invalid");
        setPromoDiscountDiram(0);
        setPromoFinalAmountDiram(null);
      }
    } catch {
      setPromoStatus("invalid");
      setPromoDiscountDiram(0);
      setPromoFinalAmountDiram(null);
    } finally {
      setIsCheckingPromo(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createBooking();
  }

  async function createBooking(phoneVerificationId?: string) {
    setError("");
    const normalizedPhone = normalizeTajikPhone(phone);
    if (!service || !staffId || !startsAt) {
      setError(t(locale, "booking.errors.selectTimeFirst"));
      return;
    }
    if (!name.trim()) {
      setError(t(locale, "booking.errors.nameRequired"));
      return;
    }
    if (!normalizedPhone) {
      setPhoneError(validateBookingPhone(phone, locale));
      return;
    }

    setIsSubmitting(true);
    try {
      const useRepeat = canRepeat && repeatEnabled;
      const appliedPromoCode = canUsePromoCodes && promoStatus === "valid" ? promoCodeInput.trim() : undefined;
      const response = await fetch(useRepeat ? "/api/bookings/recurring" : "/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          useRepeat
            ? {
                businessSlug,
                branchId,
                serviceId: service.id,
                staffId,
                resourceIds: service.resources.map(({ resourceId }) => resourceId),
                startsAt,
                customer: { name: name.trim(), phone: normalizedPhone },
                frequency: repeatFrequency,
                occurrencesTotal: repeatCount,
                ...(phoneVerificationId ? { phoneVerificationId } : {}),
              }
            : {
                businessSlug,
                branchId,
                serviceId: service.id,
                staffId,
                resourceIds: service.resources.map(({ resourceId }) => resourceId),
                startsAt,
                customer: { name: name.trim(), phone: normalizedPhone },
                ...(appliedPromoCode ? { promoCode: appliedPromoCode } : {}),
                ...(phoneVerificationId ? { phoneVerificationId } : {}),
              },
        ),
      });
      if (response.status === 403) {
        const data = (await response.json()) as { error?: string };
        if (data.error === "VERIFICATION_REQUIRED") {
          setPendingVerification("booking");
          return;
        }
      }
      if (response.status === 429) {
        setError(t(locale, "booking.errors.rateLimited"));
        return;
      }
      if (response.status === 409) {
        setStarts((values) => values.filter((value) => value !== startsAt));
        setStartsAt("");
        setError(t(locale, "booking.errors.slotTaken"));
        return;
      }
      if (response.status === 503) {
        setError(t(locale, "booking.errors.paymentsNotConfigured"));
        return;
      }
      if (response.status === 400) {
        const data = (await response.json()) as { error?: string };
        if (data.error === "PROMO_CODE_INVALID") {
          setPromoStatus("invalid");
          setPromoDiscountDiram(0);
          setPromoFinalAmountDiram(null);
          setError(t(locale, "booking.errors.promoCodeExpired"));
          return;
        }
      }
      if (!response.ok) throw new Error("booking");
      const data = (await response.json()) as { paymentPath: string };
      // The chosen language travels with the customer. Without it a Tajik-speaking customer finished
      // the last and most delicate step — the transfer — reading Russian.
      router.replace(`${data.paymentPath}?lang=${locale}`);
    } catch {
      setError(t(locale, "booking.errors.submitFailed"));
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
              <StepHeading number={1} locale={locale} title={t(locale, "booking.headings.selectBranch")} />
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
                locale={locale}
                number={branches.length > 1 ? 2 : 1}
                title={t(locale, "booking.headings.selectService")}
                onBack={branches.length > 1 ? goBack : undefined}
                backLabel={t(locale, "booking.back.toBranch")}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {branch.services.map((item) => (
                  <SelectableCard
                    key={item.id}
                    title={item.name}
                    subtitle={t(locale, "booking.durationAndPrice", {
                      minutes: item.durationMinutes,
                      price: formatSomoni(item.amountDiram, moneyLocale(locale)),
                    })}
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
                locale={locale}
                number={branches.length > 1 ? 3 : 2}
                title={t(locale, "booking.headings.selectStaff")}
                onBack={goBack}
                backLabel={t(locale, "booking.back.toService")}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {service.staffMembers.length > 1 ? (
                  <SelectableCard
                    title={t(locale, "booking.anyStaffTitle")}
                    subtitle={t(locale, "booking.anyStaffSubtitle")}
                    selected={staffId === ANY_STAFF}
                    onClick={() => chooseStaff(ANY_STAFF)}
                    icon={
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300"
                        aria-hidden
                      >
                        ★
                      </span>
                    }
                  />
                ) : null}
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
                locale={locale}
                number={branches.length > 1 ? 4 : 3}
                title={t(locale, "booking.headings.selectTime")}
                onBack={goBack}
                backLabel={t(locale, "booking.back.toStaff")}
              />
              {availableDays.length ? (
                <div
                  className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
                  role="group"
                  aria-label={t(locale, "booking.daysAriaLabel")}
                >
                  {availableDays.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      disabled={!day.hasSlots}
                      aria-pressed={date === day.date}
                      onClick={() => void loadSlots(day.date)}
                      className={cn(
                        "flex min-w-16 shrink-0 snap-start flex-col items-center rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors",
                        "hover:border-primary/50 hover:bg-secondary",
                        "aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground",
                        // A day with nothing free stays visible: knowing the salon is closed on Monday
                        // is an answer, and hiding it would make the strip lie about the week.
                        "disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-muted-foreground disabled:hover:border-border disabled:hover:bg-transparent",
                      )}
                    >
                      <span className="text-xs uppercase">{formatDayWeekday(day.date, locale)}</span>
                      <span className="font-semibold tabular-nums">{formatDayNumber(day.date, locale)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <Field label={t(locale, "booking.dateLabel")} htmlFor="booking-date">
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
                  {t(locale, "booking.loadingSlots")}
                </p>
              ) : date && starts.length === 0 && !error ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t(locale, "booking.noSlotsForDate")}
                  </p>
                  {canUseWaitlist ? (
                    <Button type="button" variant="secondary" onClick={openWaitlist}>
                      {t(locale, "booking.waitlist.cta")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {starts.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t(locale, "booking.availableTimesAriaLabel")}>
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
                      {formatBookingTime(value, branch.timeZone, locale)}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {currentStep === "contact" && branch && service ? (
            <>
              <StepHeading
                locale={locale}
                number={branches.length > 1 ? 5 : 4}
                title={t(locale, "booking.headings.enterContacts")}
                onBack={goBack}
                backLabel={t(locale, "booking.back.toTime")}
              />
              <p className="text-sm font-medium text-foreground">
                {formatBookingTime(startsAt, branch.timeZone, locale)} · {service.name} ·{" "}
                {promoStatus === "valid" && promoFinalAmountDiram !== null ? (
                  <>
                    <span className="text-muted-foreground line-through">
                      {formatSomoni(service.amountDiram, moneyLocale(locale))}
                    </span>{" "}
                    <span>{formatSomoni(promoFinalAmountDiram, moneyLocale(locale))}</span>
                  </>
                ) : (
                  formatSomoni(service.amountDiram, moneyLocale(locale))
                )}
              </p>
              {canUsePromoCodes ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="booking-promo-code">{t(locale, "booking.promoCodeLabel")}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="booking-promo-code"
                      name="promoCode"
                      autoComplete="off"
                      placeholder={t(locale, "booking.promoCodePlaceholder")}
                      value={promoCodeInput}
                      onChange={(event) => onPromoCodeChange(event.target.value)}
                      onBlur={() => void applyPromoCode()}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isCheckingPromo || !promoCodeInput.trim()}
                      loading={isCheckingPromo}
                      onClick={() => void applyPromoCode()}
                    >
                      {t(locale, "booking.promoApplyCta")}
                    </Button>
                  </div>
                  {promoStatus === "valid" ? (
                    <p className="text-[13px] text-brand-700 dark:text-brand-300">
                      {t(locale, "booking.promoApplied", {
                        amount: formatSomoni(promoDiscountDiram, moneyLocale(locale)),
                      })}
                    </p>
                  ) : promoStatus === "invalid" ? (
                    <p className="text-[13px] text-destructive" role="alert">
                      {t(locale, "booking.promoInvalid")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t(locale, "booking.nameLabel")}>
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
                  <Label htmlFor="booking-phone">{t(locale, "booking.phoneLabel")}</Label>
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
              {canRepeat ? (
                <div className="flex flex-col gap-3 rounded-md border border-border bg-secondary/40 p-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Checkbox
                      checked={repeatEnabled}
                      onChange={(event) => setRepeatEnabled(event.target.checked)}
                    />
                    {t(locale, "booking.repeatBookingLabel")}
                  </label>
                  {repeatEnabled ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t(locale, "booking.repeatFrequencyLabel")}>
                        <Select
                          value={repeatFrequency}
                          onChange={(event) => setRepeatFrequency(event.target.value as RepeatFrequency)}
                        >
                          <option value="WEEKLY">{t(locale, "booking.repeatFrequency.weekly")}</option>
                          <option value="BIWEEKLY">{t(locale, "booking.repeatFrequency.biweekly")}</option>
                          <option value="MONTHLY">{t(locale, "booking.repeatFrequency.monthly")}</option>
                        </Select>
                      </Field>
                      <Field
                        label={t(locale, "booking.repeatCountLabel", {
                          min: MIN_OCCURRENCES,
                          max: MAX_OCCURRENCES,
                        })}
                      >
                        <Input
                          type="number"
                          min={MIN_OCCURRENCES}
                          max={MAX_OCCURRENCES}
                          value={repeatCount}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            if (Number.isNaN(next)) return;
                            setRepeatCount(Math.min(MAX_OCCURRENCES, Math.max(MIN_OCCURRENCES, next)));
                          }}
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {t(locale, "booking.holdNotice")}
              </p>
              {pendingVerification === "booking" ? (
                <PhoneVerificationPanel
                  locale={locale}
                  phone={normalizeTajikPhone(phone) ?? phone}
                  businessSlug={businessSlug}
                  onVerified={(verificationId) => {
                    setPendingVerification(null);
                    void createBooking(verificationId);
                  }}
                />
              ) : (
                <Button type="submit" size="lg" disabled={isSubmitting} loading={isSubmitting}>
                  {isSubmitting ? t(locale, "booking.submitting") : t(locale, "booking.submitCta")}
                </Button>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Dialog open={waitlistOpen} onOpenChange={setWaitlistOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t(locale, "booking.waitlist.title")}</DialogTitle>
          </DialogHeader>
          {waitlistDone ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-medium text-foreground">{t(locale, "booking.waitlist.doneTitle")}</p>
              <p className="text-sm text-muted-foreground">{t(locale, "booking.waitlist.doneText")}</p>
              <div className="flex justify-end">
                <Button type="button" onClick={() => setWaitlistOpen(false)}>
                  {t(locale, "booking.waitlist.close")}
                </Button>
              </div>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={submitWaitlist} noValidate>
              <p className="text-sm text-muted-foreground">{t(locale, "booking.waitlist.description")}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t(locale, "booking.waitlist.nameLabel")}>
                  <Input
                    name="waitlistName"
                    autoComplete="name"
                    maxLength={120}
                    value={waitlistName}
                    onChange={(event) => setWaitlistName(event.target.value)}
                  />
                </Field>
                <Field label={t(locale, "booking.waitlist.phoneLabel")}>
                  <Input
                    name="waitlistPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+992 90 000 00 00"
                    value={waitlistPhone}
                    onChange={(event) => setWaitlistPhone(formatTajikPhoneInput(event.target.value))}
                  />
                </Field>
                <Field label={t(locale, "booking.waitlist.fromLabel")}>
                  <Input
                    name="waitlistFrom"
                    type="date"
                    min={minDate}
                    value={waitlistFrom}
                    onChange={(event) => setWaitlistFrom(event.target.value)}
                  />
                </Field>
                <Field label={t(locale, "booking.waitlist.toLabel")}>
                  <Input
                    name="waitlistTo"
                    type="date"
                    min={waitlistFrom || minDate}
                    value={waitlistTo}
                    onChange={(event) => setWaitlistTo(event.target.value)}
                  />
                </Field>
              </div>
              {waitlistError ? (
                <p className="text-[13px] text-destructive" role="alert">
                  {waitlistError}
                </p>
              ) : null}
              {pendingVerification === "waitlist" ? (
                <PhoneVerificationPanel
                  locale={locale}
                  phone={normalizeTajikPhone(waitlistPhone) ?? waitlistPhone}
                  businessSlug={businessSlug}
                  onVerified={(verificationId) => {
                    setPendingVerification(null);
                    void joinWaitlist(verificationId);
                  }}
                />
              ) : (
                <div className="flex justify-end">
                  <Button type="submit" disabled={waitlistSubmitting} loading={waitlistSubmitting}>
                    {waitlistSubmitting ? t(locale, "booking.waitlist.submitting") : t(locale, "booking.waitlist.submitCta")}
                  </Button>
                </div>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </form>
  );
}

function StepHeading({
  number,
  title,
  locale,
  onBack,
  backLabel = t(locale, "booking.back.default"),
}: {
  number: number;
  title: string;
  locale: SupportedLocale;
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

export function validateBookingPhone(value: string, locale: SupportedLocale = "ru"): string | null {
  return normalizeTajikPhone(value) ? null : t(locale, "booking.errors.invalidPhone");
}

export function formatBookingTime(value: string, timeZone: string, locale: SupportedLocale = "ru"): string {
  return formatLocaleTime(new Date(value), timeZone, locale);
}

/** Adds days to a `yyyy-mm-dd` string, for the default waitlist window. */
function addDays(date: string, days: number): string {
  if (!date) return "";
  const value = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) return "";
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** «пн», «вт» — the weekday over the number in a day chip. */
function formatDayWeekday(date: string, locale: SupportedLocale): string {
  return formatLocaleWeekdayShort(new Date(`${date}T12:00:00.000Z`), "UTC", locale);
}

/** The day of the month alone: the strip never spans more than a month, so the month is implied. */
function formatDayNumber(date: string, locale: SupportedLocale): string {
  return formatLocaleDayNumber(new Date(`${date}T12:00:00.000Z`), "UTC", locale);
}

type SavedBooking = { branchId: string; serviceId: string; staffId: string; name: string; phone: string };

/** Per business and per tab: a phone left on one salon's page has no business on another's. */
function storageKey(businessSlug: string): string {
  return `manclient-booking:${businessSlug}`;
}

function readSavedBooking(businessSlug: string): SavedBooking | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(businessSlug));
    return raw ? (JSON.parse(raw) as SavedBooking) : null;
  } catch {
    // Private mode and storage quotas both throw here. Losing the draft is a nuisance; failing to
    // render the form over it would be a lost booking.
    return null;
  }
}

function saveBooking(businessSlug: string, value: SavedBooking): void {
  try {
    window.sessionStorage.setItem(storageKey(businessSlug), JSON.stringify(value));
  } catch {
    // As above: storage is a convenience here, never a requirement.
  }
}
