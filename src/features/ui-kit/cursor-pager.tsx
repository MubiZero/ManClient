import { ButtonLink } from "@/features/ui-kit/button";

/**
 * Paging keys are how a list walks, not what it selects, so a filter schema never sees them. The notice
 * keys are dropped for a different reason: they are the answer to something the operator just did, and
 * carrying them onto page two re-announced «Подтверждено: 12» to somebody who had only turned a page.
 */
const PAGING_KEYS = new Set(["cursor", "trail", "notice", "error", "field", "approved", "skipped"]);

/** A cursor is capped at 128 characters by the query schemas, and no real list runs 50 pages deep. */
const MAX_CURSOR_LENGTH = 128;
const MAX_TRAIL_LENGTH = 50;

/**
 * Pages over a cursor query.
 *
 * A cursor only walks forward, which is why these lists used to offer one button called «Показать ещё»
 * that silently replaced the rows and left no way back. Keeping the cursors already spent turns that
 * one-way walk into pages: the last one is the page on screen, dropping it goes back. The trail rides
 * in the URL, so refresh, back and a shared link all land on the same page.
 */
export function CursorPager({
  basePath,
  query,
  trail,
  nextCursor,
  label,
}: {
  basePath: string;
  /** The filter parameters to carry between pages; paging keys are stripped for you. */
  query: Record<string, string>;
  trail: string[];
  nextCursor: string | null;
  label: string;
}) {
  if (!trail.length && !nextCursor) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>Страница {trail.length + 1}</span>
      <div className="flex gap-2">
        {trail.length ? (
          <ButtonLink href={pageHref(basePath, query, trail.slice(0, -1))} variant="secondary" size="sm">
            Назад
          </ButtonLink>
        ) : null}
        {nextCursor ? (
          <ButtonLink href={pageHref(basePath, query, [...trail, nextCursor])} variant="secondary" size="sm">
            Далее
          </ButtonLink>
        ) : null}
      </div>
    </nav>
  );
}

/** Drops the paging keys, so what is left is the selection the pager carries from page to page. */
export function filterQuery(query: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1] !== "" && !PAGING_KEYS.has(entry[0])),
  );
}

/** Bounded on both length and depth so a hand-written URL cannot grow without end. */
export function readPageTrail(value: string | string[] | undefined): string[] {
  if (typeof value !== "string") return [];
  return value.split(",").filter((cursor) => cursor.length > 0 && cursor.length <= MAX_CURSOR_LENGTH).slice(-MAX_TRAIL_LENGTH);
}

/** The cursor of the page being shown — the last one walked, or none on the first page. */
export function currentCursor(trail: string[]): string | undefined {
  return trail.length ? trail[trail.length - 1] : undefined;
}

function pageHref(basePath: string, query: Record<string, string>, trail: string[]): string {
  const params = new URLSearchParams(query);
  if (trail.length) params.set("trail", trail.join(","));
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}
