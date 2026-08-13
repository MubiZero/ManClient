import { collectBusinessMetrics } from "@/core/observability/business-metrics";
import { collectQueueMetrics, renderPrometheus } from "@/core/observability/queue-metrics";
import { hasValidInternalSecret } from "@/core/security/internal-auth";

/**
 * Scraped with the internal secret rather than left open: the counts are aggregate, but "how many
 * bookings does this platform have" is still nobody else's business.
 */
export async function GET(request: Request): Promise<Response> {
  if (!hasValidInternalSecret(request)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Two collectors, one endpoint: whether the machine is running, and whether the business under it
  // works. They are read by the same person at the same moment, and splitting them would only mean
  // remembering two URLs.
  const [queues, business] = await Promise.all([collectQueueMetrics(), collectBusinessMetrics()]);
  const body = renderPrometheus([...queues, ...business]);
  return new Response(body, { headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" } });
}
