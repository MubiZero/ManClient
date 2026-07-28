import { createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@/core/database/prisma";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!validSignature(body, request.headers.get("x-hub-signature-256"))) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const payload = JSON.parse(body) as { entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{ id: string; status: string; errors?: Array<{ title?: string }> }> } }> }> };
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

function validSignature(body: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const provided = Buffer.from(header.slice(7));
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
