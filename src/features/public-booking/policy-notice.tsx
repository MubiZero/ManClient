import { formatSomoni } from "@/core/formatting/money";
import { moneyLocale, t, type SupportedLocale } from "@/i18n/translate";

/**
 * The rules the customer is actually held to, in the same box as the paragraph the business wrote. The
 * numbers come from the enforced fields, so a customer can never be surprised by a refusal that was
 * only ever described in prose — or worse, described one way and enforced another.
 */
export function PolicyNotice({
  locale,
  policy,
}: {
  locale: SupportedLocale;
  policy: {
    minLeadTimeMinutes: number;
    maxAdvanceDays: number | null;
    freeCancellationHours: number;
    maxCustomerReschedules: number | null;
    cancellationPolicy: string | null;
    prepaymentMode: "FULL" | "DEPOSIT" | "NONE";
    depositPercent: number | null;
    depositAmountDiram: number | null;
  };
}) {
  const rules = [
    policy.minLeadTimeMinutes > 0 ? t(locale, "booking.policy.leadTime", { value: formatLeadTime(locale, policy.minLeadTimeMinutes) }) : null,
    policy.maxAdvanceDays !== null ? t(locale, "booking.policy.horizon", { days: policy.maxAdvanceDays }) : null,
    policy.freeCancellationHours > 0 ? t(locale, "booking.policy.cancellation", { hours: policy.freeCancellationHours }) : null,
    policy.maxCustomerReschedules !== null ? t(locale, "booking.policy.rescheduleLimit", { count: policy.maxCustomerReschedules }) : null,
    // Full prepayment is stated by the payment page the customer is taken to next, and it is what every
    // business did before the setting existed. Only the two surprising answers are worth a line here.
    prepaymentRule(locale, policy),
  ].filter((value): value is string => value !== null);

  if (rules.length === 0 && !policy.cancellationPolicy) return null;

  return (
    <div className="mt-6 flex flex-col gap-2 rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
      <strong className="font-medium text-foreground">{t(locale, "booking.policy.title")}</strong>
      {rules.length ? (
        <ul className="flex flex-col gap-1">
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      ) : null}
      {policy.cancellationPolicy ? <p>{policy.cancellationPolicy}</p> : null}
    </div>
  );
}

function prepaymentRule(
  locale: SupportedLocale,
  policy: { prepaymentMode: "FULL" | "DEPOSIT" | "NONE"; depositPercent: number | null; depositAmountDiram: number | null },
): string | null {
  if (policy.prepaymentMode === "NONE") return t(locale, "booking.policy.prepaymentNone");
  if (policy.prepaymentMode !== "DEPOSIT") return null;
  if (policy.depositAmountDiram !== null) {
    return t(locale, "booking.policy.prepaymentDeposit", { amount: formatSomoni(policy.depositAmountDiram, moneyLocale(locale)) });
  }
  return policy.depositPercent !== null ? t(locale, "booking.policy.prepaymentDepositPercent", { percent: policy.depositPercent }) : null;
}

function formatLeadTime(locale: SupportedLocale, minutes: number): string {
  if (minutes % 60 !== 0) return locale === "tg" ? `${minutes} дақиқа` : `${minutes} мин`;
  const hours = minutes / 60;
  if (hours % 24 === 0) {
    const days = hours / 24;
    return locale === "tg" ? `${days} рӯз` : `${days} сут.`;
  }
  return locale === "tg" ? `${hours} соат` : `${hours} ч`;
}
