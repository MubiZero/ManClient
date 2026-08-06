import { ZodError } from "zod";

import {
  DuplicateOperationError,
  confirmFromReceipt,
} from "@/core/payments/payment-service";
import { hasValidInternalSecret } from "@/core/security/internal-auth";

type RouteContext = { params: Promise<{ paymentId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!hasValidInternalSecret(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { paymentId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const payment = await confirmFromReceipt({
      ...payload,
      paymentId,
      operationAt: new Date(String(payload.operationAt)),
    } as Parameters<typeof confirmFromReceipt>[0]);

    return Response.json(
      { paymentId: payment.id, status: payment.status },
      { status: payment.status === "NEEDS_ATTENTION" ? 422 : 200 },
    );
  } catch (error) {
    if (error instanceof DuplicateOperationError) {
      return Response.json({ error: error.code }, { status: 409 });
    }

    if (error instanceof ZodError) {
      return Response.json({ error: "RECEIPT_NEEDS_ATTENTION" }, { status: 422 });
    }

    throw error;
  }
}
