import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { prisma } from "@/core/database/prisma";
import { BookingForm } from "@/features/public-booking/booking-form";
import { PublicBrandMark } from "@/features/public-booking/public-brand-mark";
import { EmptyState } from "@/features/ui-kit/empty-state";

type PageProps = { params: Promise<{ businessSlug: string }> };

export default async function PublicBookingPage({ params }: PageProps) {
  const { businessSlug } = await params;
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: {
      name: true,
      slug: true,
      status: true,
      logoStorageKey: true,
      brandColor: true,
      cancellationPolicy: true,
      branches: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          timeZone: true,
          services: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              durationMinutes: true,
              amountDiram: true,
              staffMembers: { orderBy: { displayName: "asc" }, select: { id: true, displayName: true } },
              resources: { select: { resourceId: true } },
            },
          },
        },
      },
    },
  });

  if (!business) {
    notFound();
  }

  const brandStyle = business.brandColor
    ? ({ "--color-primary": business.brandColor, "--color-ring": business.brandColor } as CSSProperties)
    : undefined;

  return (
    <main className="min-h-screen bg-secondary/30" style={brandStyle}>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <PublicBrandMark slug={business.slug} name={business.name} hasLogo={Boolean(business.logoStorageKey)} href="/" />
          <span className="text-sm font-medium text-muted-foreground">Онлайн-запись</span>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 pb-4 pt-8 sm:px-6">
        <p className="text-sm font-medium text-primary">{business.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">Запишитесь на удобное время</h1>
        <p className="mt-2 text-muted-foreground">
          Выберите услугу и специалиста. Слот будет закреплён за вами на 15 минут для оплаты.
        </p>
      </section>
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        {business.status === "SUSPENDED" ? (
          <EmptyState
            title="Запись временно недоступна"
            description="Онлайн-запись для этого бизнеса приостановлена. Свяжитесь с бизнесом напрямую, чтобы записаться."
          />
        ) : business.branches.length === 0 || business.branches.every(({ services }) => services.length === 0) ? (
          <EmptyState
            title="Запись скоро откроется"
            description="Бизнес ещё добавляет услуги. Попробуйте вернуться позже."
          />
        ) : (
          <>
            <BookingForm businessSlug={business.slug} branches={business.branches} />
            {business.cancellationPolicy ? (
              <p className="mt-6 rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                <strong className="font-medium text-foreground">Политика отмены. </strong>
                {business.cancellationPolicy}
              </p>
            ) : null}
          </>
        )}
      </div>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Запись работает на ManClient
      </footer>
    </main>
  );
}
