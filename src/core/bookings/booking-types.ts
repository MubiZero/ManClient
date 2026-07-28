export type ReserveAllocationInput = {
  branchId: string;
  staffId: string;
  serviceId: string;
  customerId: string;
  resourceIds: string[];
  startsAt: Date;
  durationMinutes: number;
  expiresAt: Date;
  amountDiram: number;
};
