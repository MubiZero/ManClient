import { notFound } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/core/database/prisma";
import { BookingForm } from "@/features/public-booking/booking-form";

type PageProps = { params: Promise<{ businessSlug: string }> };

export default async function PublicBookingPage({ params }: PageProps) {
  const { businessSlug } = await params;
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: {
      name: true,
      slug: true,
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

  return (
    <main className="booking-page">
      <header className="public-header">
        <Link className="brand" href="/" aria-label="ManClient, главная">MC</Link>
        <span>Онлайн-запись</span>
      </header>
      <section className="booking-hero">
        <p className="context-label">{business.name}</p>
        <h1>Запишитесь на удобное время</h1>
        <p>Выберите услугу и специалиста. Слот будет закреплён за вами на 15 минут для оплаты.</p>
      </section>
      {business.branches.length === 0 || business.branches.every(({ services }) => services.length === 0) ? (
        <section className="empty-state">
          <h2>Запись скоро откроется</h2>
          <p>Бизнес ещё добавляет услуги. Попробуйте вернуться позже.</p>
        </section>
      ) : (
        <BookingForm businessSlug={business.slug} branches={business.branches} />
      )}
      <footer className="public-footer">Запись работает на ManClient</footer>
    </main>
  );
}
