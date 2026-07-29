async function main() {
  const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/webhooks/telegram/platform`;
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(`Platform Telegram webhook target: ${webhookUrl}\n`);
    return;
  }
  const token = requiredEnv("TELEGRAM_BOT_TOKEN");
  const secretToken = requiredEnv("TELEGRAM_WEBHOOK_SECRET");
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    }),
  });
  const result = await response.json() as { ok?: boolean };
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram rejected platform webhook registration with HTTP ${response.status}`);
  }
  process.stdout.write(`Platform Telegram webhook registered: ${webhookUrl}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Platform webhook registration failed"}\n`);
  process.exitCode = 1;
});

function requiredEnv(name: "APP_URL" | "TELEGRAM_BOT_TOKEN" | "TELEGRAM_WEBHOOK_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
