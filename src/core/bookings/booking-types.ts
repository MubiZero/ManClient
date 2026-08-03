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
  promoCode?: string;
  status?: "PENDING_PAYMENT" | "CONFIRMED";
  source?: "WEB" | "TELEGRAM" | "DASHBOARD";
  actor?: { type: "customer" | "membership"; id: string };
  confirmedAt?: Date;
  confirmedBy?: string;
};
