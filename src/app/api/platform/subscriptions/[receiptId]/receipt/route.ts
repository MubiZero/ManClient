import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { prisma } from "@/core/database/prisma";
import { getReceipt } from "@/core/payments/receipt-storage";

type RouteContext = { params: Promise<{ receiptId: string }> };

/**
 * The image behind a queue row. Streamed through here rather than linked from storage so that the
 * bucket stays private and every look at somebody's transfer goes through an admin session.
 */
export async function GET(_: Request, context: RouteContext) {
  await requirePlatformAdmin();
  const { receiptId } = await context.params;
  const receipt = await prisma.subscriptionReceipt.findUnique({ where: { id: receiptId }, select: { storageKey: true } });
  if (!receipt) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const image = await getReceipt(receipt.storageKey);
  return new Response(Buffer.from(image.body), {
    headers: { "content-type": image.contentType, "cache-control": "private, no-store", "content-disposition": "inline" },
  });
}
