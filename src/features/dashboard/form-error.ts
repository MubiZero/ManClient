import { settingsErrorField } from "@/core/business-settings/settings-error";

/**
 * The two halves of showing a refusal where it happened.
 *
 * Settings actions answer by redirecting with an error code, and the sheet re-renders from the URL. That
 * carried what went wrong but never which control it was about, so a sheet with a dozen questions marked
 * all of them and the owner found the real one by trying. The field name rides along in the same query
 * string, and the message lands on that control instead of over the whole form.
 */
export function errorSearchParams(code: string, error: unknown): string {
  const field = settingsErrorField(error);
  return new URLSearchParams({ error: code, ...(field ? { field } : {}) }).toString();
}

/**
 * The message keyed by the control it belongs to, or nothing when the refusal named no control — a
 * conflict with existing bookings is about the request, not about a field, and belongs above the form.
 */
export function fieldErrorMap(field: string | undefined, message: string | undefined): Record<string, string> | undefined {
  return field && message ? { [field]: message } : undefined;
}
