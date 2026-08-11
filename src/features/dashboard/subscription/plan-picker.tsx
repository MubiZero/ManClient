"use client";

import { useMemo, useRef, useState } from "react";

import { formatSomoni } from "@/core/formatting/money";
import { PERIOD_LABELS, PLAN_DESCRIPTIONS, PLAN_LABELS } from "@/core/platform/plan-labels";
import type { BillingPeriod, SubscriptionPlan } from "@/generated/prisma/client";
import { Button } from "@/features/ui-kit/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/features/ui-kit/dialog";
import { Field, Select } from "@/features/ui-kit/field";

export type PlanPrice = { plan: SubscriptionPlan; period: BillingPeriod; amountDiram: number };

/**
 * Choosing what to buy. The price of the current choice is on screen before anything is confirmed,
 * and confirmation names the plan and the sum — billing is the last step a business wants to
 * discover by surprise.
 */
export function PlanPicker({
  currentPlan,
  prices,
  action,
}: {
  currentPlan: SubscriptionPlan;
  prices: PlanPrice[];
  action: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  // Only what the platform sells: a plan with no price is not on this list at all.
  const plans = useMemo(() => [...new Set(prices.map((price) => price.plan))], [prices]);
  const [plan, setPlan] = useState<SubscriptionPlan>(plans.includes(currentPlan) ? currentPlan : plans[0]);
  const periods = useMemo(() => prices.filter((price) => price.plan === plan).map((price) => price.period), [plan, prices]);
  const [period, setPeriod] = useState<BillingPeriod>(periods[0] ?? "MONTHLY");

  const chosenPeriod = periods.includes(period) ? period : periods[0];
  const price = prices.find((item) => item.plan === plan && item.period === chosenPeriod);

  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">Сейчас тарифы не продаются онлайн. Свяжитесь с поддержкой ManClient.</p>;
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="period" value={chosenPeriod ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Тариф" hint={PLAN_DESCRIPTIONS[plan]}>
          <Select value={plan} onChange={(event) => setPlan(event.target.value as SubscriptionPlan)}>
            {plans.map((item) => (
              <option key={item} value={item}>{PLAN_LABELS[item]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Период">
          <Select value={chosenPeriod} onChange={(event) => setPeriod(event.target.value as BillingPeriod)}>
            {periods.map((item) => (
              <option key={item} value={item}>{PERIOD_LABELS[item]}</option>
            ))}
          </Select>
        </Field>
      </div>

      <p className="text-2xl font-semibold tabular-nums text-foreground">{price ? formatSomoni(price.amountDiram) : "—"}</p>

      <Button type="button" className="self-start" onClick={() => setOpen(true)} disabled={!price}>
        Выставить счёт
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Выставить счёт за подписку</DialogTitle>
            <DialogDescription>
              {PLAN_LABELS[plan]}, {chosenPeriod ? PERIOD_LABELS[chosenPeriod].toLowerCase() : ""}
              {price ? ` — ${formatSomoni(price.amountDiram)}` : ""}. Тариф сменится, когда счёт будет оплачен, а до тех пор всё
              работает как сейчас.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>Не сейчас</Button>
            <Button type="button" onClick={() => { setOpen(false); formRef.current?.requestSubmit(); }}>
              {price ? `Выставить счёт на ${formatSomoni(price.amountDiram)}` : "Выставить счёт"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
