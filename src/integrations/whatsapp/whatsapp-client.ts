export type WhatsAppTemplateMessage = {
  phoneNumberId: string;
  to: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
};

export async function sendTemplateMessage(input: WhatsAppTemplateMessage): Promise<{ externalId: string }> {
  const allowlist = new Set((process.env.WHATSAPP_TEMPLATE_ALLOWLIST ?? "").split(",").map(value => value.trim()).filter(Boolean));
  if (!allowlist.has(input.templateName)) throw new Error(`WhatsApp template ${input.templateName} is not allowed`);
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_API_VERSION;
  if (!token || !version) throw new Error("WhatsApp API credentials are not configured");

  const response = await fetch(`https://graph.facebook.com/${version}/${input.phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: input.parameters.length ? [{ type: "body", parameters: input.parameters.map(text => ({ type: "text", text })) }] : [],
      },
    }),
  });
  const payload = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message?: string } };
  const externalId = payload.messages?.[0]?.id;
  if (!response.ok || !externalId) throw new Error(`WhatsApp send failed: ${payload.error?.message ?? response.status}`);
  return { externalId };
}
