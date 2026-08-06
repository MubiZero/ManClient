import { collectQueueMetrics, renderPrometheus } from "@/core/observability/queue-metrics";
import { hasValidInternalSecret } from "@/core/security/internal-auth";

/**
 * Scraped with the internal secret rather than left open: the counts are aggregate, but "how many
 * bookings does this platform have" is still nobody else's business.
 */
export async function GET(request: Request): Promise<Response> {
  if (!hasValidInternalSecret(request)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = renderPrometheus(await collectQueueMetrics());
  return new Response(body, { headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" } });
}
