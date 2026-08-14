export type SettingsErrorCode =
  | "INVALID_INPUT"
  | "INVALID_AMOUNT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "FUTURE_BOOKINGS"
  | "LAST_ACTIVE_BRANCH"
  | "CANNOT_PUBLISH"
  | "ALREADY_ARCHIVED"
  | "PLAN_REQUIRED";

export class SettingsError extends Error {
  constructor(
    public readonly code: SettingsErrorCode,
    public readonly details?: Record<string, string | number>,
    /**
     * The form control the refusal is about, when the schema could name one. A settings form asks a
     * dozen questions at once, and "проверьте поля" over the whole sheet leaves the owner to find which
     * one by trying. Carried as a plain name so it survives the redirect the actions already use.
     */
    public readonly field?: string,
  ) {
    super(code);
    this.name = "SettingsError";
  }
}

/** The field name a refusal points at, or nothing when it was never about one control. */
export function settingsErrorField(error: unknown): string | undefined {
  return error instanceof SettingsError ? error.field : undefined;
}
