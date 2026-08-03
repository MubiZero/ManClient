export type PayomSmsMessage = {
  telephone: string;
  text: string;
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
      text: input.text,
      senderName,
      type: "SMS",
    }),
  });
  const payload = (await response.json()) as { id?: string; deliveryStatus?: string; message?: string; error?: string };
  if (!response.ok || !payload.id) throw new Error(`Payom SMS send failed: ${payload.message ?? payload.error ?? response.status}`);
  return { externalId: payload.id, deliveryStatus: payload.deliveryStatus ?? "UNKNOWN" };
}
