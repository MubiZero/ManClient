import { timingSafeEqual } from "node:crypto";

import { ZodError } from "zod";

import {
  DuplicateOperationError,
  confirmFromReceipt,
} from "@/core/payments/payment-service";

type RouteContext = { params: Promise<{ paymentId: string }> };

function hasValidInternalSecret(request: Request): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  const provided = request.headers.get("x-manclient-internal-secret");

  if (!expected || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

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
