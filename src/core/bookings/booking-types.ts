import type { PrepaymentMode } from "@/generated/prisma/client";

import type { PrepaymentRule } from "@/core/payments/prepayment-policy";

export type ReserveAllocationInput = {
  branchId: string;
  staffId: string;
  serviceId: string;
  customerId: string;
  resourceIds: string[];
  startsAt: Date;
  durationMinutes: number;
  expiresAt: Date | null;
  createdAt: Date;
  amountDiram: number;
  /**
   * The prepayment rule to apply, if the caller wants one enforced. Resolved inside the transaction
   * because only there is the price known after a promo code has been redeemed — a deposit is a share of
   * what the customer actually owes, not of the list price.
   */
  prepayment?: { business: PrepaymentRule & { prepaymentMode: PrepaymentMode }; service?: PrepaymentRule | null };
  promoCode?: string;
  status?: "PENDING_PAYMENT" | "CONFIRMED";
  source?: "WEB" | "TELEGRAM" | "DASHBOARD";
  actor?: { type: "customer" | "membership"; id: string };
  confirmedAt?: Date;
  confirmedBy?: string;
};
