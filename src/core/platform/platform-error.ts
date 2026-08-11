export type PlatformErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_PRICED"
  | "NOT_CONFIGURED";

/**
 * Refusals from the platform back office, kept apart from `SettingsError` because these are answers
 * to the operator rather than to a business: nobody's salon is at fault when the platform has not
 * priced a plan yet.
 */
export class PlatformError extends Error {
  constructor(
    public readonly code: PlatformErrorCode,
    public readonly details?: Record<string, string | number>,
  ) {
    super(code);
    this.name = "PlatformError";
  }
}
