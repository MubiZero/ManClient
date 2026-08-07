import { Ticket } from "lucide-react";
import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { SettingsError } from "@/core/business-settings/settings-error";
import { formatSomoni } from "@/core/formatting/money";
import { businessHasFeature, PLAN_LABELS } from "@/core/platform/subscription-plans";
import { createPromoCode, deactivatePromoCode, listPromoCodes } from "@/core/promotions/promo-code-service";
import { Badge } from "@/features/ui-kit/badge";
import { Button } from "@/features/ui-kit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Field, Input, Select } from "@/features/ui-kit/field";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { searchParams: Promise<{ notice?: string; error?: string }> };

export default async function PromoCodesPage({ searchParams }: PageProps) {
  const membership = await requireBusinessAdmin();

  if (!businessHasFeature(membership.business, "PROMO_CODES")) {
    return (
      <>
        <PageHeader eyebrow="Настройки" title="Промокоды" description="Скидки для клиентов при онлайн-записи." />
        <EmptyState
          icon={Ticket}
          title="Промокоды доступны на тарифе Стандарт"
          description={`Сейчас у вас тариф «${PLAN_LABELS[membership.business.subscriptionPlan]}». Перейдите на «${PLAN_LABELS.STANDARD}» или выше, чтобы выдавать клиентам скидки.`}
        />
      </>
    );
  }

  const query = await searchParams;
  const promoCodes = await listPromoCodes(membership.businessId);

  async function create(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();
    const maxRedemptionsRaw = String(formData.get("maxRedemptions") ?? "").trim();
    try {
      await createPromoCode({
        businessId: current.businessId,
        actorUserId: current.userId,
        code: String(formData.get("code") ?? ""),
        discountType: String(formData.get("discountType") ?? "PERCENT") as "PERCENT" | "FIXED",
        discountValue: Number(formData.get("discountValue") ?? 0),
        ...(maxRedemptionsRaw ? { maxRedemptions: Number(maxRedemptionsRaw) } : {}),
        ...(expiresAtRaw ? { expiresAt: new Date(expiresAtRaw) } : {}),
      });
    } catch (error) {
      const code = error instanceof SettingsError ? (error.details?.reason ?? error.code) : "INVALID_INPUT";
      redirect(`/dashboard/settings/promo-codes?error=${String(code)}`);
    }
    redirect("/dashboard/settings/promo-codes?notice=created");
  }

  async function deactivate(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    await deactivatePromoCode(current.businessId, String(formData.get("promoCodeId") ?? ""), current.userId);
    redirect("/dashboard/settings/promo-codes?notice=deactivated");
  }

  return (
    <>
      <ToastEmitter notice={noticeMessage(query.notice)} error={errorMessage(query.error)} />
      <PageHeader eyebrow="Настройки" title="Промокоды" description="Скидки для клиентов при онлайн-записи." />

      <Card>
        <CardHeader>
          <CardTitle>Новый промокод</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={create} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Код" htmlFor="code">
              <Input id="code" name="code" placeholder="LETO2026" required minLength={3} maxLength={32} />
            </Field>
            <Field label="Тип скидки" htmlFor="discountType">
              <Select id="discountType" name="discountType" defaultValue="PERCENT">
                <option value="PERCENT">Процент</option>
                <option value="FIXED">Фиксированная (дирам)</option>
              </Select>
            </Field>
            <Field label="Размер" htmlFor="discountValue">
              <Input id="discountValue" name="discountValue" type="number" min={1} required />
            </Field>
            <Field label="Лимит применений" htmlFor="maxRedemptions" hint="Пусто — без лимита">
              <Input id="maxRedemptions" name="maxRedemptions" type="number" min={1} placeholder="Без лимита" />
            </Field>
            <Field label="Действует до" htmlFor="expiresAt">
              <Input id="expiresAt" name="expiresAt" type="date" />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Создать</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {promoCodes.length === 0 ? (
        <EmptyState title="Промокодов пока нет" description="Создайте первый промокод — клиенты смогут ввести его при записи." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Код</TableHead>
              <TableHead>Скидка</TableHead>
              <TableHead>Применений</TableHead>
              <TableHead>Действует до</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {promoCodes.map((promoCode) => (
              <TableRow key={promoCode.id}>
                <TableCell className="font-mono font-medium text-foreground">{promoCode.code}</TableCell>
                <TableCell>
                  {promoCode.discountType === "PERCENT" ? `${promoCode.discountValue}%` : formatSomoni(promoCode.discountValue)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {promoCode.redemptionCount}
                  {promoCode.maxRedemptions ? ` / ${promoCode.maxRedemptions}` : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {promoCode.expiresAt ? promoCode.expiresAt.toLocaleDateString("ru-RU") : "Бессрочно"}
                </TableCell>
                <TableCell>
                  <Badge variant={promoCode.isActive ? "success" : "neutral"} dot>
                    {promoCode.isActive ? "Активен" : "Отключён"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {promoCode.isActive ? (
                    <form action={deactivate}>
                      <input type="hidden" name="promoCodeId" value={promoCode.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Отключить
                      </Button>
                    </form>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

function noticeMessage(code?: string) {
  return ({ created: "Промокод создан.", deactivated: "Промокод отключён." } as Record<string, string>)[code ?? ""];
}

function errorMessage(code?: string) {
  return ({
    DUPLICATE_CODE: "Промокод с таким кодом уже существует.",
    INVALID_INPUT: "Проверьте поля: код от 3 до 32 символов (латиница, цифры), размер скидки — положительное число, процент — не больше 100.",
    PLAN_REQUIRED: "Промокоды доступны на тарифе Стандарт и выше.",
    FORBIDDEN: "Недостаточно прав.",
  } as Record<string, string>)[code ?? ""];
}
