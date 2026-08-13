import Link from "next/link";

import { requireBusinessSession } from "@/core/auth/business-session";
import { bookingQrSvg, bookingQrTarget, printFormats, printableSizeMm, type PrintFormat } from "@/core/branding/booking-qr";
import { prisma } from "@/core/database/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/features/ui-kit/card";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";

/**
 * What the salon puts on its mirror, its counter and its door. Everything a customer needs to find
 * the booking page without being told about it — which is the barrier that actually keeps a public
 * booking link unused.
 */
export default async function MaterialsPage() {
  const membership = await requireBusinessSession();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: membership.businessId },
    select: { name: true, slug: true },
  });

  const target = bookingQrTarget(process.env.APP_URL ?? "", business.slug);
  if (!target) {
    return (
      <>
        <PageHeader eyebrow="Настройки" title="Материалы для салона" />
        <EmptyState
          title="Публичный адрес не настроен"
          description="Пока у платформы нет публичного адреса, печатать код некуда. Напишите в поддержку ManClient."
        />
      </>
    );
  }

  const preview = await bookingQrSvg(target.url, 60);

  return (
    <>
      <PageHeader
        eyebrow="Настройки"
        title="Материалы для салона"
        description="Код ведёт на вашу страницу записи. Распечатайте и повесьте там, где клиент ждёт: у зеркала, на стойке, на двери."
      />

      <Card>
        <CardHeader>
          <CardTitle>Ваш код</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div
            className="w-40 shrink-0 rounded-md border border-border bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
            // The SVG comes from the QR encoder, not from anything a person typed.
            dangerouslySetInnerHTML={{ __html: preview }}
          />
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-muted-foreground">Адрес, который откроется при сканировании:</p>
            <p className="font-mono text-foreground">{target.readable}</p>
            <p className="text-muted-foreground">
              Этот адрес напечатан рядом с кодом на всех макетах: если код затрётся или его закроют, клиент наберёт адрес руками.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Макеты для печати</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {printFormats().map(({ format, label }) => {
            const size = printableSizeMm(format);
            return (
              <Link
                key={format}
                href={`/dashboard/settings/materials/print?format=${format}`}
                target="_blank"
                className="flex flex-col gap-1 rounded-lg border border-border p-4 transition-colors hover:border-primary/50 hover:bg-secondary"
              >
                <span className="font-medium text-foreground">{label}</span>
                <span className="text-sm text-muted-foreground">
                  Код {size.code} мм — читается с {readingDistance(format)}
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Макет открывается в новой вкладке готовым к печати: нажмите «Печать» в браузере и выберите нужный размер бумаги. Печатайте
        код чёрным на белом — цветной код дешёвые камеры читают плохо.
      </p>
    </>
  );
}

function readingDistance(format: PrintFormat): string {
  return ({ sticker: "30 см", tent: "полуметра", poster: "метра", card: "20 см" } as Record<PrintFormat, string>)[format];
}
