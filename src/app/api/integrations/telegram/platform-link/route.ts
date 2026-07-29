import { requireBusinessAdmin } from "@/core/auth/business-session";
import { createPlatformChatLink } from "@/core/integrations/platform-chat-link";

export async function POST() {
  const membership = await requireBusinessAdmin();
  const token = await createPlatformChatLink({
    membershipId: membership.id,
    actorUserId: membership.userId,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username) return Response.json({ error: "TELEGRAM_NOT_CONFIGURED" }, { status: 503 });

  const url = new URL(`https://t.me/${username}`);
  url.searchParams.set("start", `b_${token}`);
  return Response.json({ url: url.toString(), expiresInSeconds: 900 });
}
