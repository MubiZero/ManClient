import { z } from "zod";

export const receiptInputSchema = z.object({
  paymentId: z.string().min(1),
  receiptStorageKey: z.string().min(1),
  operationNumber: z.string().regex(/^\d{6,32}$/),
  amountDiram: z.number().int().positive(),
  recipientCardSuffix: z.string().regex(/^\d{4}$/),
  operationAt: z.date(),
  isSuccessful: z.boolean(),
});

export type ReceiptInput = z.infer<typeof receiptInputSchema>;

export interface ReceiptRecognizer {
  recognize(receiptStorageKey: string): Promise<Omit<ReceiptInput, "paymentId" | "receiptStorageKey">>;
}
