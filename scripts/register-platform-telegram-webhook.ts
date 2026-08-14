const platformCommandsRu = [
  { command: "start", description: "Подключить бизнес или открыть меню" },
  { command: "menu", description: "Главное меню" },
  { command: "today", description: "Записи на сегодня" },
  { command: "bookings", description: "Все записи" },
  { command: "checks", description: "Чеки на проверке" },
  { command: "language", description: "Сменить язык бота" },
  { command: "help", description: "Помощь" },
];

const platformCommandsTg = [
  { command: "start", description: "Пайвасти бизнес ё кушодани меню" },
  { command: "menu", description: "Менюи асосӣ" },
  { command: "today", description: "Сабтҳои имрӯза" },
  { command: "bookings", description: "Ҳамаи сабтҳо" },
  { command: "checks", description: "Чекҳо дар навбати санҷиш" },
  { command: "language", description: "Иваз кардани забони бот" },
  { command: "help", description: "Кӯмак" },
];

async function main() {
  const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/webhooks/telegram/platform`;
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(`Platform Telegram webhook target: ${webhookUrl}\n`);
    return;
  }
  const token = requiredEnv("TELEGRAM_BOT_TOKEN");
  const secretToken = requiredEnv("TELEGRAM_WEBHOOK_SECRET");
  const identity = await telegramCall<{ can_manage_bots?: boolean }>(token, "getMe", {});
  if (!identity.can_manage_bots) {
    throw new Error("Telegram bot Management Mode is disabled; enable it in @BotFather before registering the platform webhook");
  }
  // Telegram picks the set by the client's interface language, so the Tajik team sees a Tajik command
  // list instead of a Russian one they have to guess their way through.
  await telegramCall(token, "setMyCommands", { commands: platformCommandsRu });
  await telegramCall(token, "setMyCommands", { commands: platformCommandsTg, language_code: "tg" });
  await telegramCall(token, "setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query", "managed_bot"],
    drop_pending_updates: false,
  });
  process.stdout.write(`Platform Telegram webhook and commands registered: ${webhookUrl}\n`);
}

async function telegramCall<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as { ok?: boolean; result?: T };
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram rejected ${method} with HTTP ${response.status}`);
  }
  if (result.result === undefined) throw new Error(`Telegram ${method} returned no result`);
  return result.result;
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
