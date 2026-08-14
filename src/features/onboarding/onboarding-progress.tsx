import Link from "next/link";

import { cn } from "@/features/ui-kit/cn";

const steps = [
  { label: "Услуга", query: "service" },
  { label: "Оплата", query: "payment" },
  { label: "Запуск", query: "launch" },
] as const;

/**
 * `openSteps` are the ones the owner may still walk back into. It is not simply "everything before the
 * current step": the wizard is the only place that shows the first service, so that one stays open for
 * a mistyped price, while the card can be entered exactly once and would be a dead end.
 */
export function OnboardingProgress({
  currentStep,
  openSteps = [],
}: {
  currentStep: 1 | 2 | 3;
  openSteps?: readonly (1 | 2 | 3)[];
}) {
  return (
    <ol
      className="grid grid-cols-3 rounded-lg border border-border bg-card py-4 shadow-sm"
      aria-label="Этапы настройки бизнеса"
    >
      {steps.map(({ label, query }, index) => {
        const number = (index + 1) as 1 | 2 | 3;
        const isCurrent = number === currentStep;
        const isComplete = number < currentStep;
        const content = (
          <>
            {/* The number and the tick repeat what the label and `aria-current` already say, so they
                stay out of the accessible name — otherwise the step link announces as "✓ Услуга". */}
            <span
              aria-hidden
              className={cn(
                "flex size-8 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : isComplete
                    ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300"
                    : "border-border bg-secondary text-muted-foreground",
              )}
            >
              {isComplete ? "✓" : number}
            </span>
            <strong
              className={cn("text-[13px] font-semibold", isCurrent || isComplete ? "text-foreground" : "text-muted-foreground")}
            >
              {label}
            </strong>
          </>
        );
        return (
          <li
            className="relative flex flex-col items-center"
            key={label}
            aria-current={isCurrent ? "step" : undefined}
          >
            {index < steps.length - 1 ? (
              <div
                aria-hidden
                className="absolute top-4 left-[calc(50%_+_22px)] right-[calc(-50%_+_22px)] h-px bg-border"
              />
            ) : null}
            {!isCurrent && openSteps.includes(number) ? (
              <Link
                className="relative flex flex-col items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
                href={`/dashboard/onboarding?step=${query}`}
              >
                {content}
              </Link>
            ) : (
              <div className="relative flex flex-col items-center gap-2">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
