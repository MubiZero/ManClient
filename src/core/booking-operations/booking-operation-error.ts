export type BookingOperationErrorCode = "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_STATUS" | "SLOT_UNAVAILABLE" | "CUSTOMER_TELEGRAM_UNAVAILABLE";

export class BookingOperationError extends Error {
  constructor(public readonly code: BookingOperationErrorCode, public readonly details?: Record<string, string | number>) {
    super(code);
    this.name = "BookingOperationError";
  }
}
