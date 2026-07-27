export type ReserveAllocationInput = {
  branchId: string;
  staffId: string;
  resourceIds: string[];
  startsAt: Date;
  durationMinutes: number;
};
