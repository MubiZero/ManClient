import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { formatSomoni, parseSomoniToDiram } from "@/core/formatting/money";
import { prisma } from "@/core/database/prisma";
import { BILLING_PERIODS, PERIOD_LABELS, SELLABLE_PLANS, clearPlanPrice, listPlanPrices, setPlanPrice } from "@/core/platform/plan-pricing";
import { PlatformError } from "@/core/platform/platform-error";
import { platformPaymentCard } from "@/core/platform/platform-payment-card";
import { PLAN_DESCRIPTIONS, PLAN_LABELS } from "@/core/platform/subscription-plans";
import { Field, Input } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { SubmitButton } from "@/features/ui-kit/submit-button";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { searchParams: Promise<{ notice?: string; error?: string }> };

export default async function PlatformPlansPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();
  const query = await searchParams;
  const prices = await listPlanPrices();
  const editors = await lastEditors(prices.map((price) => price.updatedById));
  const cardConfigured = platformPaymentCard() !== null;

  async function savePrice(formData: FormData) {
    "use server";
    const admin = await requirePlatformAdmin();
    const plan = String(formData.get("plan") ?? "") as (typeof SELLABLE_PLANS)[number];
    const period = String(formData.get("period") ?? "") as (typeof BILLING_PERIODS)[number];
    const amount = String(formData.get("amountSomoni") ?? "").trim();

    try {
      // An emptied field is how a plan is taken off the shelf; it is not a validation failure.
      if (!amount) await clearPlanPrice({ plan, period, actorUserId: admin.userId });
      else await setPlanPrice({ plan, period, amountDiram: parseSomoniToDiram(amount), actorUserId: admin.userId });
    } catch (error) {
      redirect(`/platform/plans?error=${error instanceof PlatformError ? error.code : "INVALID_AMOUNT"}`);
    }
    redirect(`/platform/plans?notice=${amount ? "saved" : "cleared"}`);
  }

  return (
    <>
      <ToastEmitter notice={noticeMessage(query.notice)} error={errorMessage(query.error)} />
      <PageHeader
        eyebrow="Платформа"
        title="Тарифы и цены"
        description="Цена задаётся парой «тариф + период». Пустая цена означает, что тариф не продаётся: подписки на нём продолжают работать, но выставить по нему счёт нельзя."
      />

      {cardConfigured ? null : (
        <p className="rounded-md border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          Карта платформы не задана (<code className="font-mono text-xs">PLATFORM_PAYMENT_CARD</code>), поэтому счёт выставить можно,
          а ссылку на оплату бизнес не увидит — в кабинете написано, что оплату принимает оператор.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {SELLABLE_PLANS.map((plan) => (
          <section key={plan} className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">{PLAN_LABELS[plan]}</h2>
              <p className="text-sm text-muted-foreground">{PLAN_DESCRIPTIONS[plan]}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {BILLING_PERIODS.map((period) => {
                const price = prices.find((item) => item.plan === plan && item.period === period);
                const editor = price?.updatedById ? editors.get(price.updatedById) : undefined;
                return (
                  <form key={period} action={savePrice} className="flex flex-col gap-2">
                    <input type="hidden" name="plan" value={plan} />
                    <input type="hidden" name="period" value={period} />
                    <Field label={`${PERIOD_LABELS[period]}, сомони`} hint={priceHint(price?.amountDiram, editor, price?.updatedAt)}>
                      <Input
                        name="amountSomoni"
                        inputMode="decimal"
                        pattern="\d{1,7}([.,]\d{1,2})?"
                        placeholder="Не продаётся"
                        defaultValue={price ? (price.amountDiram / 100).toFixed(2) : ""}
                      />
                    </Field>
                    <SubmitButton idle="Сохранить" pending="Сохраняем…" variant="secondary" />
                  </form>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function priceHint(amountDiram: number | undefined, editor: string | undefined, updatedAt: Date | undefined) {
  if (amountDiram === undefined) return "Тариф не продаётся: поле пустое, счёт по нему не выставляется.";
  const changedBy = editor ? `изменил ${editor}` : "изменено";
  return `Сейчас ${formatSomoni(amountDiram)} · ${changedBy}, ${updatedAt?.toLocaleDateString("ru-RU") ?? ""}`;
}

async function lastEditors(ids: (string | null)[]): Promise<Map<string, string>> {
  const known = ids.filter((id): id is string => Boolean(id));
  if (known.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: known } }, select: { id: true, displayName: true } });
  return new Map(users.map((user) => [user.id, user.displayName]));
}

function noticeMessage(code?: string) {
  return ({ saved: "Цена сохранена.", cleared: "Тариф снят с продажи." } as Record<string, string>)[code ?? ""];
}
function errorMessage(code?: string) {
  return ({
    INVALID_AMOUNT: "Цена должна быть положительной суммой в сомони, например 150 или 150,50.",
    INVALID_INPUT: "Такой тариф или период не продаётся.",
    FORBIDDEN: "Менять цены может только администратор платформы.",
  } as Record<string, string>)[code ?? ""];
}
