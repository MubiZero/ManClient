import { pluralRu } from "@/core/formatting/plural";

/**
 * «чек / чека / чеков» — the word every receipt queue counts with. It lived as a private one-liner in
 * three of them, which is two more places to disagree with the others the next time somebody rewords it.
 */
export function receiptCountLabel(count: number): string {
  return pluralRu(count, { one: "чек", few: "чека", many: "чеков" });
}

/** The count and its word together, for the many places that print both. */
export function receiptCount(count: number): string {
  return `${count} ${receiptCountLabel(count)}`;
}
