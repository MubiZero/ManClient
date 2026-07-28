import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/whatsapp/route";
import { sendTemplateMessage } from "@/integrations/whatsapp/whatsapp-client";

describe("WhatsApp integration", () => {
  it("rejects a webhook with an invalid Meta signature", async () => {
    process.env.WHATSAPP_APP_SECRET = "whatsapp-app-test-secret";
    const response = await POST(new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", headers: { "x-hub-signature-256": "sha256=wrong" }, body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("rejects a template outside the configured allowlist before sending", async () => {
    process.env.WHATSAPP_TEMPLATE_ALLOWLIST = "booking_confirmed,booking_reminder";
    await expect(sendTemplateMessage({ phoneNumberId: "phone-1", to: "+992900001122", templateName: "unknown_template", languageCode: "ru", parameters: [] })).rejects.toThrow("not allowed");
  });
});
