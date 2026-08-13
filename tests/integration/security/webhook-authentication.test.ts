import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as businessTelegram } from "@/app/api/webhooks/telegram/business/[publicId]/route";
import { POST as platformTelegram } from "@/app/api/webhooks/telegram/platform/route";
import { GET as whatsappVerify, POST as whatsappStatus } from "@/app/api/webhooks/whatsapp/route";

/**
 * Every door into the app that is opened by somebody else's server. The routes each check their own
 * secret, and the checks are easy to weaken by accident — an env var that stops being set, a comparison
 * that treats "" as a match — so the whole gate is pinned in one place: nothing gets in without proof,
 * and a webhook whose secret is not configured is closed rather than open.
 */
describe("inbound webhook authentication", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "10000:platform-token";
    process.env.TELEGRAM_WEBHOOK_SECRET = "platform-webhook-secret";
    process.env.WHATSAPP_APP_SECRET = "whatsapp-app-secret";
    process.env.WHATSAPP_VERIFY_TOKEN = "whatsapp-verify-token";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("turns away a platform Telegram update with no secret, a wrong secret or an empty one", async () => {
    const withHeader = (secret?: string) => platformTelegram(new Request("http://localhost/api/webhooks/telegram/platform", {
      method: "POST",
      headers: secret === undefined ? {} : { "x-telegram-bot-api-secret-token": secret },
      body: JSON.stringify({ update_id: 1 }),
    }));

    await expect(withHeader().then(response => response.status)).resolves.toBe(401);
    await expect(withHeader("wrong-secret").then(response => response.status)).resolves.toBe(401);
    await expect(withHeader("").then(response => response.status)).resolves.toBe(401);
    await expect(withHeader("platform-webhook-secret").then(response => response.status)).resolves.toBe(200);
  });

  it("keeps the platform Telegram webhook shut when its secret is not configured at all", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    const response = await platformTelegram(new Request("http://localhost/api/webhooks/telegram/platform", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "" },
      body: JSON.stringify({ update_id: 2 }),
    }));

    expect(response.status).toBe(401);
  });

  it("turns away a tenant Telegram update before it looks at the body", async () => {
    const response = await businessTelegram(new Request("http://localhost/api/webhooks/telegram/business/public-1", {
      method: "POST",
      body: "not json at all",
    }), { params: Promise.resolve({ publicId: "no-such-public-id" }) });

    expect(response.status).toBe(404);
  });

  it("answers Meta's subscription handshake only for the configured verify token", async () => {
    const verify = (params: Record<string, string>) => whatsappVerify(
      new Request(`http://localhost/api/webhooks/whatsapp?${new URLSearchParams(params).toString()}`),
    );

    const accepted = await verify({ "hub.mode": "subscribe", "hub.verify_token": "whatsapp-verify-token", "hub.challenge": "12345" });
    const wrongToken = await verify({ "hub.mode": "subscribe", "hub.verify_token": "guessed", "hub.challenge": "12345" });
    const wrongMode = await verify({ "hub.mode": "unsubscribe", "hub.verify_token": "whatsapp-verify-token", "hub.challenge": "12345" });

    expect(accepted.status).toBe(200);
    await expect(accepted.text()).resolves.toBe("12345");
    expect(wrongToken.status).toBe(403);
    expect(wrongMode.status).toBe(403);
  });

  it("does not hand out the challenge when the verify token is unset and the caller sends none", async () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;

    const response = await whatsappVerify(new Request("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=12345"));

    expect(response.status).toBe(403);
  });

  it("accepts a WhatsApp status only when it is signed with the app secret", async () => {
    const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [] } }] }] });
    const sign = (secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const post = (headers: Record<string, string>, payload = body) => whatsappStatus(
      new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", headers, body: payload }),
    );

    await expect(post({}).then(response => response.status)).resolves.toBe(401);
    await expect(post({ "x-hub-signature-256": sign("stolen-secret") }).then(response => response.status)).resolves.toBe(401);
    await expect(post({ "x-hub-signature-256": sign("whatsapp-app-secret") }).then(response => response.status)).resolves.toBe(200);
  });

  it("keeps the WhatsApp webhook shut when the app secret is not configured at all", async () => {
    const body = JSON.stringify({ entry: [] });
    delete process.env.WHATSAPP_APP_SECRET;

    const response = await whatsappStatus(new Request("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", "whatsapp-app-secret").update(body).digest("hex")}` },
      body,
    }));

    expect(response.status).toBe(401);
  });

  it("answers a signed body that will not parse with 400 rather than a server error", async () => {
    const body = "{ this is not json";

    const response = await whatsappStatus(new Request("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", "whatsapp-app-secret").update(body).digest("hex")}` },
      body,
    }));

    expect(response.status).toBe(400);
  });
});
