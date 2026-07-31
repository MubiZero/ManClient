import { cn } from "@/features/ui-kit/cn";

type Step = { id: string; label: string };

export function StepProgress({
  steps,
  currentId,
  className,
}: {
  steps: Step[];
  currentId: string;
  className?: string;
}) {
  const currentIndex = steps.findIndex((step) => step.id === currentId);
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-1 gap-y-3", className)} aria-label="Шаги записи">
      {steps.map((step, index) => {
        const isCurrent = step.id === currentId;
        const isComplete = currentIndex > index;
        return (
          <li key={step.id} className="flex items-center" aria-current={isCurrent ? "step" : undefined}>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isComplete
                      ? "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300"
                      : "bg-secondary text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className={cn("text-sm", isCurrent ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {step.label}
              </span>
            </span>
            {index < steps.length - 1 ? <span className="mx-2 h-px w-4 bg-border sm:w-8" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
