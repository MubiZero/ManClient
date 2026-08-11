import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { formatSomoni } from "@/core/formatting/money";
import { prisma } from "@/core/database/prisma";
import { listPlanPrices, PERIOD_LABELS } from "@/core/platform/plan-pricing";
import { PlatformError } from "@/core/platform/platform-error";
import { createSubscriptionInvoice, getOpenInvoice, listInvoices, subscriptionPaymentUrl } from "@/core/platform/subscription-invoice-service";
import { getBusinessPlanSummary, PLAN_DESCRIPTIONS, PLAN_LABELS, type PlanFeature } from "@/core/platform/subscription-plans";
import { InvoicePaymentPanel } from "@/features/dashboard/subscription/invoice-payment-panel";
import { PlanPicker } from "@/features/dashboard/subscription/plan-picker";
import { formatDate, subscriptionSummary } from "@/features/dashboard/subscription/subscription-summary";
import type { BillingPeriod, SubscriptionPlan } from "@/generated/prisma/client";
import { Badge } from "@/features/ui-kit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

const FEATURE_LABELS: Record<PlanFeature, string> = {
  SMS: "SMS-уведомления",
  WAITLIST: "Лист ожидания",
  PROMO_CODES: "Промокоды",
  RECURRING_BOOKINGS: "Повторяющиеся записи",
  STAFF_COMMISSIONS: "Комиссии персонала",
  REVIEWS: "Отзывы и рейтинги",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Не оплачен",
  NEEDS_ATTENTION: "На проверке",
  PAID: "Оплачен",
  CANCELLED: "Отменён",
};

type PageProps = { searchParams: Promise<{ notice?: string; error?: string }> };

export default async function PlanSettingsPage({ searchParams }: PageProps) {
  const membership = await requireBusinessAdmin();
  const query = await searchParams;
  const [summaryData, prices, openInvoice, invoices, subscription] = await Promise.all([
    getBusinessPlanSummary(membership.businessId),
    listPlanPrices(),
    getOpenInvoice(membership.businessId),
    listInvoices(membership.businessId),
    prisma.business.findUniqueOrThrow({
      where: { id: membership.businessId },
      select: { subscriptionPlan: true, subscriptionStatus: true, subscriptionEndsAt: true },
    }),
  ]);

  const summary = subscriptionSummary({
    plan: subscription.subscriptionPlan,
    status: subscription.subscriptionStatus,
    endsAt: subscription.subscriptionEndsAt,
  });

  async function createInvoice(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    try {
      await createSubscriptionInvoice({
        businessId: current.businessId,
        plan: String(formData.get("plan") ?? "") as SubscriptionPlan,
        period: String(formData.get("period") ?? "") as BillingPeriod,
      });
    } catch (error) {
      redirect(`/dashboard/settings/plan?error=${error instanceof PlatformError ? error.code : "PROCESSING_FAILED"}`);
    }
    redirect("/dashboard/settings/plan?notice=invoiced");
  }

  return (
    <>
      <ToastEmitter notice={noticeMessage(query.notice)} error={errorMessage(query.error)} />
      <PageHeader eyebrow="Настройки" title="Тариф и оплата" description="Что подключено сейчас, сколько это стоит и чем оплатить." />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {PLAN_LABELS[summaryData.effectivePlan]}
            <Badge variant={summary.tone === "danger" ? "danger" : summary.tone === "warning" ? "warning" : "neutral"}>
              {summary.statusLabel}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{summary.detail}</p>
          <p className="text-sm text-muted-foreground">{PLAN_DESCRIPTIONS[summaryData.effectivePlan]}</p>
          {summaryData.features.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {summaryData.features.map((feature) => (
                <Badge key={feature} variant="success">{FEATURE_LABELS[feature]}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Платных функций сейчас нет: работают записи, клиенты, календарь и история.</p>
          )}
        </CardContent>
      </Card>

      {openInvoice ? (
        <Card>
          <CardHeader>
            <CardTitle>Счёт к оплате</CardTitle>
          </CardHeader>
          <CardContent>
            <InvoicePaymentPanel
              invoice={{
                reference: openInvoice.reference,
                amountDiram: openInvoice.amountDiram,
                plan: openInvoice.plan,
                period: openInvoice.period,
                status: openInvoice.status,
              }}
              paymentUrl={subscriptionPaymentUrl(openInvoice)?.toString() ?? null}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Оплатить подписку</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanPicker currentPlan={subscription.subscriptionPlan} prices={prices} action={createInvoice} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>История счетов</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <EmptyState title="Счетов ещё не было" description="Здесь появятся выставленные счета и их статусы." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Счёт</TableHead>
                  <TableHead>Тариф</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Выставлен</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-xs">{invoice.reference}</TableCell>
                    <TableCell>{PLAN_LABELS[invoice.plan]} · {PERIOD_LABELS[invoice.period].toLowerCase()}</TableCell>
                    <TableCell>{formatSomoni(invoice.amountDiram)}</TableCell>
                    <TableCell>{INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(invoice.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function noticeMessage(code?: string) {
  return ({ invoiced: "Счёт выставлен. Оплатите его переводом и пришлите чек." } as Record<string, string>)[code ?? ""];
}
function errorMessage(code?: string) {
  return ({
    NOT_PRICED: "Этот тариф сейчас не продаётся. Выберите другой или напишите в поддержку.",
    INVALID_INPUT: "Такой тариф оплатить нельзя.",
    PROCESSING_FAILED: "Не удалось выставить счёт. Попробуйте ещё раз.",
  } as Record<string, string>)[code ?? ""];
}
