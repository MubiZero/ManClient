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
 * twice, the way the Telegram bot already asks before the same approval. The summary repeats whose
 * receipt is being decided: in a queue of look-alike rows, the misclick is on the neighbour.
 */
export function ReceiptDecisionDialog({
  action,
  idField,
  idValue,
  triggerLabel,
  variant,
  title,
  description,
  summary,
  note,
  confirmLabel,
  pendingLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  idField: string;
  idValue: string;
  triggerLabel: string;
  variant: "primary" | "destructive";
  title: string;
  description: string;
  summary: DecisionSummaryItem[];
  note?: DecisionNote;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant={variant} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name={idField} value={idValue} />
            <dl className="flex flex-col gap-1 rounded-md bg-secondary px-3 py-2 text-sm">
              {summary.map((item) => (
                <div key={item.label} className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="font-medium text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
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
