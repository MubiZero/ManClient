import { Star } from "lucide-react";
import Link from "next/link";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import { businessHasFeature, PLAN_LABELS } from "@/core/platform/subscription-plans";
import { getAverageRating, listReviews, setReviewHidden } from "@/core/reviews/review-service";
import { Button } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { StatCard } from "@/features/ui-kit/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function ReviewsPage({ searchParams }: PageProps) {
  const membership = await requireBusinessAdmin();

  if (!businessHasFeature(membership.business, "REVIEWS")) {
    return (
      <>
        <PageHeader eyebrow="Клиенты" title="Отзывы" description="Отзывы и рейтинг после визита клиента." />
        <EmptyState
          icon={Star}
          title="Отзывы доступны на тарифе Премиум"
          description={`Сейчас у вас тариф «${PLAN_LABELS[membership.business.subscriptionPlan]}». Перейдите на «${PLAN_LABELS.PREMIUM}», чтобы собирать отзывы и рейтинг от клиентов после визита.`}
        />
      </>
    );
  }

  const query = await searchParams;
  const page = Math.max(Number.parseInt(query.page ?? "1", 10) || 1, 1);
  const [rating, list] = await Promise.all([
    getAverageRating(membership.businessId),
    listReviews(membership.businessId, page),
  ]);
  const totalPages = Math.max(Math.ceil(list.total / list.pageSize), 1);

  async function toggleHidden(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const reviewId = String(formData.get("reviewId") ?? "");
    const nextHidden = formData.get("isHidden") === "true";
    await setReviewHidden(current.businessId, reviewId, nextHidden);
  }

  return (
    <>
      <PageHeader eyebrow="Клиенты" title="Отзывы" description="Отзывы и рейтинг после визита клиента." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Средняя оценка"
          value={rating.average !== null ? rating.average.toFixed(1) : "—"}
          icon={Star}
          trend={rating.count > 0 ? { direction: "flat", label: `${rating.count} отзывов` } : undefined}
        />
      </div>

      {list.reviews.length === 0 ? (
        <EmptyState title="Пока нет отзывов" description="Отзывы появятся здесь после того, как клиенты оценят визит." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Оценка</TableHead>
              <TableHead>Комментарий</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.reviews.map((review) => (
              <TableRow key={review.id}>
                <TableCell className="text-muted-foreground">{review.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                <TableCell className="font-medium text-foreground">{review.customerName}</TableCell>
                <TableCell className="text-muted-foreground">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</TableCell>
                <TableCell className="max-w-sm text-muted-foreground">{review.comment ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{review.isHidden ? "Скрыт" : "Виден"}</TableCell>
                <TableCell>
                  <form action={toggleHidden}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="isHidden" value={String(!review.isHidden)} />
                    <Button type="submit" variant="secondary" size="sm">
                      {review.isHidden ? "Показать" : "Скрыть"}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Страница {page} из {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={`/dashboard/reviews?page=${page - 1}`} className="font-medium text-primary">Назад</Link> : null}
            {page < totalPages ? <Link href={`/dashboard/reviews?page=${page + 1}`} className="font-medium text-primary">Далее</Link> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
