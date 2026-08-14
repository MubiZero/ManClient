import { AlertTriangle } from "lucide-react";

import { cn } from "@/features/ui-kit/cn";

export type ComparisonRow = {
  label: string;
  expected: string;
  actual: string;
  mismatch: boolean;
};

/**
 * The "expected / on the receipt" table both review queues work from — a customer's prepayment and a
 * business's subscription transfer are the same question asked about different money.
 */
export function ReceiptComparison({ rows, className }: { rows: ComparisonRow[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-1 rounded-md border border-border p-3 text-sm", className)}>
      <span className="px-1.5 text-xs font-medium uppercase text-muted-foreground">Поле</span>
      <span className="px-1.5 text-xs font-medium uppercase text-muted-foreground">Ожидалось</span>
      <span className="px-1.5 text-xs font-medium uppercase text-muted-foreground">В чеке</span>
      {rows.map((row) => (
        <Row key={row.label} {...row} />
      ))}
    </div>
  );
}

function Row({ label, expected, actual, mismatch }: ComparisonRow) {
  // A mismatch is what the whole screen exists for, so it is never colour alone: the row is tinted and
  // carries a warning sign, which survives colour blindness and a bad monitor in a salon back office.
  const mismatchCell = "bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-500";
  return (
    <>
      <strong className={cn("rounded-l-md px-1.5 py-1 font-medium text-foreground", mismatch && mismatchCell)}>{label}</strong>
      <span className={cn("px-1.5 py-1", mismatch && mismatchCell)}>{expected}</span>
      <span className={cn("flex items-center gap-1.5 rounded-r-md px-1.5 py-1", mismatch && `${mismatchCell} font-medium`)}>
        {mismatch ? (
          <>
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">Не совпадает:</span>
          </>
        ) : null}
        {actual}
      </span>
    </>
  );
}
