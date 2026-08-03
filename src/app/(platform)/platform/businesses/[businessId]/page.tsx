import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { formatSomoni } from "@/core/formatting/money";
import { loadBusinessDetail, setBusinessStatus, setBusinessSubscriptionPlan } from "@/core/platform/business-directory";
import { PLAN_DESCRIPTIONS, PLAN_LABELS } from "@/core/platform/subscription-plans";
import { Badge } from "@/features/ui-kit/badge";
import { Button } from "@/features/ui-kit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { Select } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { StatCard } from "@/features/ui-kit/stat-card";

const PLAN_OPTIONS = ["START", "STANDARD", "PREMIUM"] as const;

export default async function PlatformBusinessDetailPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const detail = await loadBusinessDetail(businessId);
  if (!detail) notFound();
  const { business, revenueDiram, auditEvents } = detail;

  async function toggleStatus() {
    "use server";
    const admin = await requirePlatformAdmin();
    const detail = await loadBusinessDetail(businessId);
    if (!detail) notFound();
    const nextStatus = detail.business.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    await setBusinessStatus({ businessId, status: nextStatus, actorUserId: admin.userId });
    redirect(`/platform/businesses/${businessId}`);
  }

  async function changePlan(formData: FormData) {
    "use server";
    const admin = await requirePlatformAdmin();
    const plan = String(formData.get("plan") ?? "START") as (typeof PLAN_OPTIONS)[number];
    await setBusinessSubscriptionPlan({ businessId, plan, actorUserId: admin.userId });
    redirect(`/platform/businesses/${businessId}`);
  }

  return (
    <>
      <PageHeader
        eyebrow={`/${business.slug}`}
        title={business.name}
        description={`Создан ${business.createdAt.toLocaleDateString("ru-RU")}`}
        action={
          <div className="flex items-center gap-3">
            <Badge variant={business.status === "ACTIVE" ? "success" : "danger"} dot>
              {business.status === "ACTIVE" ? "Активен" : "Приостановлен"}
            </Badge>
            <form action={toggleStatus}>
              <Button variant={business.status === "ACTIVE" ? "destructive" : "primary"} type="submit">
                {business.status === "ACTIVE" ? "Приостановить" : "Возобновить"}
              </Button>
            </form>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Записей всего" value={String(business._count.bookings)} />
        <StatCard label="Сотрудников" value={String(business._count.staffMembers)} />
        <StatCard label="Принято оплат" value={formatSomoni(revenueDiram)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Тариф</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <form action={changePlan} className="flex items-center gap-2">
            <Select name="plan" defaultValue={business.subscriptionPlan} className="w-auto">
              {PLAN_OPTIONS.map((plan) => (
                <option key={plan} value={plan}>
                  {PLAN_LABELS[plan]}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" variant="secondary">
              Сохранить
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">{PLAN_DESCRIPTIONS[business.subscriptionPlan]}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Филиалы</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {business.branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Активных филиалов нет.</p>
          ) : (
            business.branches.map((branch) => (
              <Badge key={branch.id} variant="neutral">
                {branch.name}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Telegram-интеграция</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {business.telegramIntegrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Клиентский бот не подключён.</p>
          ) : (
            business.telegramIntegrations.map((integration) => (
              <div key={integration.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>@{integration.botUsername}</span>
                <div className="flex items-center gap-2 text-muted-foreground">
                  {integration.lastWebhookError ? <span className="text-destructive">{integration.lastWebhookError}</span> : null}
                  <Badge variant={integration.status === "ACTIVE" ? "success" : "warning"}>{integration.status}</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Журнал событий</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {auditEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Событий пока нет.</p>
          ) : (
            auditEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                <span className="text-foreground">{event.type}</span>
                <span className="text-muted-foreground">{event.createdAt.toLocaleString("ru-RU")}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Link href="/platform/businesses" className="text-sm text-muted-foreground hover:text-foreground">
        ← Ко всем бизнесам
      </Link>
    </>
  );
}
