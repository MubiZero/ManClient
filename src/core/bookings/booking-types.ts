export type ReserveAllocationInput = {
  branchId: string;
  staffId: string;
  serviceId: string;
  customerId: string;
  resourceIds: string[];
  startsAt: Date;
  durationMinutes: number;
  expiresAt: Date | null;
  amountDiram: number;
  status?: "PENDING_PAYMENT" | "CONFIRMED";
  source?: "WEB" | "TELEGRAM" | "DASHBOARD";
  actor?: { type: "customer" | "membership"; id: string };
  confirmedAt?: Date;
  confirmedBy?: string;
};
