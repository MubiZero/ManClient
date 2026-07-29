import { createTelegramApi } from "@/integrations/telegram/telegram-api";

const cacheLifetimeMs = 60_000;
const telegramTimeoutMs = 2_500;
let cached: { token: string; username: string; value: { managedBotsAvailable: boolean }; expiresAt: number } | null = null;

export async function getPlatformTelegramCapability() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const configuredUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").toLowerCase();
  if (!token || !configuredUsername) return { managedBotsAvailable: false };
  if (cached?.token === token && cached.username === configuredUsername && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const timedFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      signal: AbortSignal.timeout(telegramTimeoutMs),
    });
    const identity = await createTelegramApi(token, timedFetch).getMe();
    const value = {
      managedBotsAvailable: identity.canManageBots === true
        && identity.username.toLowerCase() === configuredUsername,
    };
    cached = { token, username: configuredUsername, value, expiresAt: Date.now() + cacheLifetimeMs };
    return value;
  } catch {
    return { managedBotsAvailable: false };
  }
}
