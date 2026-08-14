import QRCode from "qrcode";

import { requireBusinessSession } from "@/core/auth/business-session";
import { createPlatformChatLink } from "@/core/integrations/platform-chat-link";

const linkLifetimeSeconds = 900;

/**
 * Any member links their own chat: the token carries the requester's membership, so staff can only ever
 * connect themselves — and the staff bot is built for them (`consumePlatformChatLink` accepts STAFF in a
 * private chat, and the bot menu has a staff branch).
 */
export async function POST() {
  const membership = await requireBusinessSession();
  const token = await createPlatformChatLink({
    membershipId: membership.id,
    actorUserId: membership.userId,
    expiresAt: new Date(Date.now() + linkLifetimeSeconds * 1000),
  });
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username) return Response.json({ error: "TELEGRAM_NOT_CONFIGURED" }, { status: 503 });

  const url = new URL(`https://t.me/${username}`);
  url.searchParams.set("start", `b_${token}`);
  // Telegram lives on the phone while the dashboard is usually open on a desktop, so the link also
  // travels as a code to scan. Rendering it here keeps the QR library out of the browser bundle.
  const qrDataUrl = await QRCode.toDataURL(url.toString(), { errorCorrectionLevel: "M", margin: 2, width: 320 });
  return Response.json({ url: url.toString(), qrDataUrl, expiresInSeconds: linkLifetimeSeconds });
}
