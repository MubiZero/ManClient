import { requireBusinessAdmin } from "@/core/auth/business-session";
import { prisma } from "@/core/database/prisma";
import { getReceipt } from "@/core/payments/receipt-storage";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function GET(_: Request, context: RouteContext) {
  const membership = await requireBusinessAdmin();
  const { submissionId } = await context.params;
  const submission = await prisma.receiptSubmission.findFirst({ where: { id: submissionId, businessId: membership.businessId }, select: { storageKey: true } });
  if (!submission) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const receipt = await getReceipt(submission.storageKey);
  return new Response(Buffer.from(receipt.body), { headers: { "content-type": receipt.contentType, "cache-control": "private, no-store", "content-disposition": "inline" } });
}
