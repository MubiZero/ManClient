import { prisma } from "@/core/database/prisma";
import { matchesHmacSignature, matchesWebhookSecret } from "@/core/security/webhook-auth";

/** Meta's subscription handshake: it calls once with a challenge and expects the challenge back verbatim. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const verified = url.searchParams.get("hub.mode") === "subscribe"
    && matchesWebhookSecret(process.env.WHATSAPP_VERIFY_TOKEN, url.searchParams.get("hub.verify_token"));
  if (!verified) return new Response("Forbidden", { status: 403 });
  return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!matchesHmacSignature({ body, secret: process.env.WHATSAPP_APP_SECRET, header: request.headers.get("x-hub-signature-256") })) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const payload = parseStatusPayload(body);
  if (!payload) return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  for (const status of payload.entry?.flatMap(entry => entry.changes ?? []).flatMap(change => change.value?.statuses ?? []) ?? []) {
    await prisma.message.updateMany({
      where: { externalId: status.id },
      data: {
        status: status.status === "delivered" || status.status === "read" || status.status === "sent" ? "SENT" : "FAILED",
        lastError: status.errors?.[0]?.title?.slice(0, 500),
      },
    });
  }
  return Response.json({ ok: true });
}

type StatusPayload = { entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{ id: string; status: string; errors?: Array<{ title?: string }> }> } }> }> };

/**
 * The signature is checked before this runs, so a body that will not parse came from Meta and is a bug
 * on one side or the other. It is answered with 400 rather than an unhandled throw, so the failure is
 * legible in the logs instead of arriving as a 500 that looks like the database went down.
 */
function parseStatusPayload(body: string): StatusPayload | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed !== null && typeof parsed === "object" ? parsed as StatusPayload : null;
  } catch {
    return null;
  }
}
