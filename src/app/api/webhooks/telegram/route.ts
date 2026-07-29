export async function POST(): Promise<Response> {
  return Response.json({ error: "LEGACY_TELEGRAM_WEBHOOK_REMOVED" }, { status: 410 });
}
