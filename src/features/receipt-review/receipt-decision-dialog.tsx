"use client";

import { useState } from "react";

import { Button } from "@/features/ui-kit/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/features/ui-kit/dialog";
import { Field, Textarea } from "@/features/ui-kit/field";
import { SubmitButton } from "@/features/ui-kit/submit-button";

export type DecisionSummaryItem = { label: string; value: string };

type DecisionNote = {
  label: string;
  placeholder: string;
  hint?: string;
  required?: boolean;
};

/**
 * A receipt decision is money and a confirmed booking, and neither can be taken back — so it is asked
 * twice, the way the Telegram bot already asks before the same approval. The summary repeats what is
 * being decided: in a queue of look-alike rows, the misclick is on the neighbour, and for a decision
 * over several receipts at once the reader needs its size — how many, for how much, and whose.
 */
export function ReceiptDecisionDialog({
  action,
  idField,
  idValues,
  triggerLabel,
  triggerSize,
  disabled,
  variant,
  title,
  description,
  summary,
  details,
  note,
  confirmLabel,
  pendingLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  idField: string;
  idValues: string[];
  triggerLabel: string;
  triggerSize?: "sm" | "md";
  disabled?: boolean;
  variant: "primary" | "destructive";
  title: string;
  description: string;
  summary: DecisionSummaryItem[];
  /** Who the decision touches, already trimmed by the caller to a readable head plus "и ещё N". */
  details?: string[];
  note?: DecisionNote;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size={triggerSize} variant={variant} disabled={disabled} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-4">
            {idValues.map((value) => (
              <input key={value} type="hidden" name={idField} value={value} />
            ))}
            <dl className="flex flex-col gap-1 rounded-md bg-secondary px-3 py-2 text-sm">
              {summary.map((item) => (
                <div key={item.label} className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="font-medium text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
            {details?.length ? (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm text-muted-foreground">
                {details.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            ) : null}
            {note ? (
              <Field label={note.label} hint={note.hint}>
                <Textarea
                  name="reason"
                  required={note.required}
                  minLength={note.required ? 3 : undefined}
                  maxLength={300}
                  placeholder={note.placeholder}
                />
              </Field>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <SubmitButton idle={confirmLabel} pending={pendingLabel} variant={variant} />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
