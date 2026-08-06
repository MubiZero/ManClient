/**
 * One JSON object per line on stdout, because the pilot runs as a single container behind Coolify.
 * Whatever aggregator is pointed at it later — Loki, CloudWatch, a Datadog agent — parses JSON
 * without anything here being re-instrumented, and until then `docker logs | jq` is enough.
 *
 * Every call goes through `redact`: these logs carry booking and payment context, so a careless
 * `logger.info("payload", payload)` must not be the thing that writes a card number or a session
 * token to disk. Redaction is by key name rather than by value shape — cheap, and it fails closed on
 * fields nobody thought about.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose value never belongs in a log line, matched case-insensitively as a substring. */
const REDACTED_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "card",
  "cvv",
  "codehash",
  "verificationcode",
  "otp",
];

/** Keys holding a phone number, which is logged partially so support can still correlate a report. */
const PHONE_KEYS = ["phone", "telephone", "msisdn"];

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.toLowerCase();
  return value === "debug" || value === "info" || value === "warn" || value === "error" ? value : "info";
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}

function redactValue(key: string, value: unknown, depth: number): unknown {
  const lowered = key.toLowerCase();
  if (REDACTED_KEYS.some((needle) => lowered.includes(needle))) return "[redacted]";
  if (PHONE_KEYS.some((needle) => lowered.includes(needle)) && typeof value === "string") return maskPhone(value);
  return redact(value, depth + 1);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  return Object.fromEntries(Object.entries(value as LogContext).map(([key, item]) => [key, redactValue(key, item, depth)]));
}

/**
 * Env vars whose values must never appear in a log line or an error column. A provider's own error text
 * is worth keeping — "templateMessage.variables[date-1]: должно быть в формате Y-m-d" is the difference
 * between a five-minute fix and an afternoon — but it arrives as free text from somebody else's server,
 * so it is scrubbed before it is stored anywhere.
 */
const SECRET_ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "PAYOM_API_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "INTERNAL_API_SECRET",
  "AUTH_SECRET",
  "CARD_ENCRYPTION_KEY",
  "INTEGRATION_ENCRYPTION_KEY",
  "BOOKING_ACTION_SECRET",
  "PLATFORM_LINK_SECRET",
  "S3_SECRET_ACCESS_KEY",
];

/** `123456789:AA...` — a Telegram bot token, which travels in the request URL and so in some errors. */
const BOT_TOKEN_PATTERN = /\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g;

export function redactSecrets(text: string): string {
  let result = text.replace(BOT_TOKEN_PATTERN, "[redacted]");
  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    // Short values would match half the alphabet; below 8 characters this is not a secret worth hiding.
    if (value && value.length >= 8) result = result.replaceAll(value, "[redacted]");
  }
  return result;
}

/** Short human-readable form, for columns like `Message.lastError` that support reads directly. */
export function errorText(error: unknown): string {
  return redactSecrets(error instanceof Error ? error.message : String(error));
}

export function serializeError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecrets(error.message),
      stack: error.stack ? redactSecrets(error.stack) : undefined,
      ...(error.cause ? { cause: serializeError(error.cause) } : {}),
    };
  }
  return { name: "NonError", message: redactSecrets(String(error)) };
}

function write(level: LogLevel, event: string, context?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) return;

  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...(context ? (redact(context) as LogContext) : {}),
  });
  emit(level, line);
}

/**
 * Next bundles `instrumentation.ts` for the Edge runtime as well as for Node, and Edge has no
 * `process.stdout` — importing this module there used to fail the whole bundle. `console` exists in
 * both, so it is the fallback; the streams are preferred where they exist because they do not add the
 * formatting `console` applies to objects.
 */
function emit(level: LogLevel, line: string): void {
  const toErrorStream = level === "error" || level === "warn";
  // Reached through `globalThis` rather than as `process.stdout`: the bundler flags the latter as an
  // unsupported Node API while building the Edge bundle, even guarded behind a runtime check.
  const runtime = (globalThis as { process?: { stdout?: { write?: (chunk: string) => void }; stderr?: { write?: (chunk: string) => void } } }).process;
  const stream = toErrorStream ? runtime?.stderr : runtime?.stdout;
  if (typeof stream?.write === "function") {
    stream.write(`${line}\n`);
    return;
  }
  if (toErrorStream) console.error(line);
  else console.log(line);
}

export type Logger = {
  debug: (event: string, context?: LogContext) => void;
  info: (event: string, context?: LogContext) => void;
  warn: (event: string, context?: LogContext) => void;
  error: (event: string, context?: LogContext) => void;
  /** Returns a logger that merges `context` into every line, e.g. one per job run or webhook. */
  child: (context: LogContext) => Logger;
};

function createLogger(base: LogContext): Logger {
  const merge = (context?: LogContext): LogContext => ({ ...base, ...context });
  return {
    debug: (event, context) => write("debug", event, merge(context)),
    info: (event, context) => write("info", event, merge(context)),
    warn: (event, context) => write("warn", event, merge(context)),
    error: (event, context) => write("error", event, merge(context)),
    child: (context) => createLogger(merge(context)),
  };
}

export const logger = createLogger({});
