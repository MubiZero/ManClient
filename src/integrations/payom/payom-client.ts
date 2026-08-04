/**
 * Payom accepts template messages only — a request carrying free `text` is rejected with 422
 * "Свободный текст запрещён". The wording lives in the moderated template; we send its ID plus the
 * placeholder values. See payom-templates.ts for the table.
 */
export type PayomSmsMessage = {
  telephone: string;
  templateId: string;
  /** Keyed by payom placeholder name, e.g. `{ "text-1": "Барбершоп Алиф", "date-1": "2026-08-05" }`. */
  variables: Record<string, string>;
};

export async function sendSms(input: PayomSmsMessage): Promise<{ externalId: string; deliveryStatus: string }> {
  const baseUrl = process.env.PAYOM_API_BASE_URL ?? "https://gateway.payom.tj";
  const token = process.env.PAYOM_API_TOKEN;
  const senderName = process.env.PAYOM_SENDER_NAME;
  if (!token) throw new Error("Payom API credentials are not configured");

  const response = await fetch(`${baseUrl}/api/message`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      telephone: input.telephone,
      senderName,
      type: "SMS",
      templateMessage: { templateId: input.templateId, variables: input.variables },
    }),
  });
  const payload = (await response.json()) as {
    id?: string;
    deliveryStatus?: string;
    message?: string;
    error?: string;
    detail?: string;
  };
  // Validation failures come back as RFC 7807 with the useful part in `detail`
  // ("templateMessage.variables[date-1]: ... должно быть в формате Y-m-d"), which is worth keeping
  // in lastError — without it a rejected send is indistinguishable from a network fault.
  if (!response.ok || !payload.id) {
    throw new Error(`Payom SMS send failed: ${payload.detail ?? payload.message ?? payload.error ?? response.status}`);
  }
  return { externalId: payload.id, deliveryStatus: payload.deliveryStatus ?? "UNKNOWN" };
}
