export type SettingsErrorCode =
  | "INVALID_INPUT"
  | "INVALID_AMOUNT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "FUTURE_BOOKINGS"
  | "LAST_ACTIVE_BRANCH"
  | "CANNOT_PUBLISH"
  | "ALREADY_ARCHIVED";

export class SettingsError extends Error {
  constructor(
    public readonly code: SettingsErrorCode,
    public readonly details?: Record<string, string | number>,
  ) {
    super(code);
    this.name = "SettingsError";
  }
}
