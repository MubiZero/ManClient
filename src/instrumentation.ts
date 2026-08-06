import { reportError } from "@/core/observability/report-error";
import { logger } from "@/core/observability/logger";

/**
 * Next calls `onRequestError` for every uncaught server error — route handlers, server actions and
 * RSC renders alike. Wiring it once here is what makes it unnecessary to wrap thirty route handlers
 * in try/catch just to find out that something threw: a 500 in production now produces a log line
 * with the route and, if the admin chat is configured, an alert.
 */
export function register(): void {
  logger.info("app.started", { nodeEnv: process.env.NODE_ENV, appUrl: process.env.APP_URL });
}

export function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; routeType?: string },
): void {
  reportError({
    event: "request.unhandled_error",
    error,
    // `routePath` is the pattern (`/api/bookings`), not the concrete URL: it keeps the alert
    // fingerprint stable and keeps booking tokens out of the alert text.
    context: { method: request.method, routePath: context.routePath ?? request.path, routeType: context.routeType },
    fingerprint: `request:${context.routePath ?? request.path}:${error instanceof Error ? error.name : "unknown"}`,
  });
}
