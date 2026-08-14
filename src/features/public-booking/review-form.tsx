"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { Button } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { Field, Textarea } from "@/features/ui-kit/field";
import type { SupportedLocale } from "@/i18n/translate";
import { t } from "@/i18n/translate";

export function ReviewForm({ submitAction, locale }: { submitAction: (formData: FormData) => Promise<void>; locale: SupportedLocale }) {
  const [rating, setRating] = useState(0);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <form action={submitAction} className="flex flex-col gap-4">
          <input type="hidden" name="rating" value={rating} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t(locale, "review.ratingLabel")}</span>
            <div className="flex gap-1" role="radiogroup" aria-label={t(locale, "review.ratingGroupLabel")}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={t(locale, "review.starAriaLabel", { value })}
                  onClick={() => setRating(value)}
                  className="rounded-md p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={rating >= value ? "size-8 fill-primary text-primary" : "size-8 text-muted-foreground"}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </div>
          <Field label={t(locale, "review.commentLabel")} htmlFor="review-comment">
            <Textarea id="review-comment" name="comment" maxLength={1000} placeholder={t(locale, "review.commentPlaceholder")} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={rating < 1}>
              {t(locale, "review.submitCta")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
