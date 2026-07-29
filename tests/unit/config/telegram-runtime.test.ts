import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Telegram runtime configuration", () => {
  it("documents separate platform and tenant encryption secrets", () => {
    const example = readFileSync(".env.example", "utf8");

    expect(example).toContain("INTEGRATION_ENCRYPTION_KEY=");
    expect(example).toContain("PLATFORM_LINK_SECRET=");
    expect(example).toContain("# Platform bot credentials");
  });

  it("dry-runs the platform webhook URL without exposing credentials", () => {
    const token = "999999:must-not-be-printed";
    const secret = "must-not-print-webhook-secret";
    const output = execFileSync("pnpm", ["tsx", "scripts/register-platform-telegram-webhook.ts", "--dry-run"], {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_URL: "https://manclient.example/",
        TELEGRAM_BOT_TOKEN: token,
        TELEGRAM_WEBHOOK_SECRET: secret,
      },
    });

    expect(output).toContain("https://manclient.example/api/webhooks/telegram/platform");
    expect(output).not.toContain(token);
    expect(output).not.toContain(secret);
  });
});
