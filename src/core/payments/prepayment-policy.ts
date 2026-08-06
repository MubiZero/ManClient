import type { PrepaymentMode } from "@/generated/prisma/client";

/**
 * How much of a visit's price must arrive before the slot is held. Until this existed the answer was
 * always "all of it", which suits a barber taking 50 somoni and suits nobody charging 900 for colouring —
 * the customer will not transfer that to a stranger's card, and the business will not hold the chair for
 * free. A deposit splits the difference, and "nothing" lets a business that trusts its customers stop
 * pretending to collect money it collects at the till.
 *
 * The rule resolves per booking rather than being stored on it, so changing the setting never rewrites
 * what an existing customer was already asked to pay.
 */

/** Somoni, not diram: a customer transferring a deposit by hand should be typing a round number. */
const DIRAM_PER_SOMONI = 100;

export type PrepaymentRule = {
  prepaymentMode: PrepaymentMode | null;
  depositPercent: number | null;
  depositAmountDiram: number | null;
};

export type ResolvedPrepayment = {
  mode: PrepaymentMode;
  /** What the customer must transfer now. Zero means the booking confirms without waiting for money. */
  dueDiram: number;
  /** The price of the visit after discounts. */
  totalDiram: number;
  /** What is left to pay at the visit. */
  balanceDiram: number;
};

export function resolvePrepayment(
  totalDiram: number,
  business: PrepaymentRule & { prepaymentMode: PrepaymentMode },
  service?: PrepaymentRule | null,
): ResolvedPrepayment {
  const total = Math.max(0, Math.round(totalDiram));
  // A service overrides the business only when it states a mode of its own; its deposit fields are
  // meaningless on their own and are deliberately not merged with the business's.
  const rule = service?.prepaymentMode ? service : business;
  const dueDiram = amountDue(total, rule);

  // The mode is reported from the amount rather than from the setting, because the customer is told what
  // the mode means. A deposit that rounds up to the whole price is full prepayment, and calling it a
  // deposit would promise a balance at the visit that does not exist.
  if (dueDiram <= 0) return { mode: "NONE", dueDiram: 0, totalDiram: total, balanceDiram: total };
  if (dueDiram >= total) return { mode: "FULL", dueDiram: total, totalDiram: total, balanceDiram: 0 };
  return { mode: "DEPOSIT", dueDiram, totalDiram: total, balanceDiram: total - dueDiram };
}

function amountDue(total: number, rule: PrepaymentRule): number {
  if (total === 0) return 0;
  const mode = rule.prepaymentMode ?? "FULL";
  if (mode === "NONE") return 0;
  if (mode === "FULL") return total;

  const fixed = rule.depositAmountDiram;
  if (fixed !== null && fixed > 0) return Math.min(fixed, total);

  const percent = rule.depositPercent;
  if (percent !== null && percent > 0) {
    return Math.min(total, Math.ceil((total * percent) / 100 / DIRAM_PER_SOMONI) * DIRAM_PER_SOMONI);
  }

  // DEPOSIT with no amount configured is a half-finished setting, not an instruction to charge nothing:
  // falling back to the whole price fails towards the behaviour the business had before.
  return total;
}
