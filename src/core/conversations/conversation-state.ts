import { z } from "zod";

export const conversationStates = [
  "LANGUAGE",
  "HOME",
  "BRANCH",
  "SERVICE",
  "STAFF",
  "DATE",
  "SLOT",
  "CUSTOMER_NAME",
  "CUSTOMER_PHONE",
  "CONFIRM",
  "AWAITING_PAYMENT",
  "AWAITING_RECEIPT",
  "COMPLETE",
] as const;

export type ConversationStateName = typeof conversationStates[number];
export type ConversationLocale = "ru" | "tg";
export type ConversationData = {
  locale?: ConversationLocale;
  branchId?: string;
  serviceId?: string;
  staffId?: string;
  date?: string;
  startsAt?: string;
  name?: string;
  phone?: string;
  bookingId?: string;
  paymentId?: string;
};
export type ConversationState = { state: ConversationStateName; data: ConversationData };
export type ConversationCommand = { kind: string; payload: unknown };

const idPayload = (key: "branchId" | "serviceId" | "staffId") => z.object({ [key]: z.string().min(1).max(128) });
const transitions: Record<ConversationStateName, {
  kind: string;
  next: ConversationStateName;
  schema: z.ZodType<Record<string, string>>;
}> = {
  LANGUAGE: { kind: "SELECT_LANGUAGE", next: "HOME", schema: z.object({ locale: z.enum(["ru", "tg"]) }) },
  HOME: { kind: "START_BOOKING", next: "BRANCH", schema: z.object({}) },
  BRANCH: { kind: "SELECT_BRANCH", next: "SERVICE", schema: idPayload("branchId") },
  SERVICE: { kind: "SELECT_SERVICE", next: "STAFF", schema: idPayload("serviceId") },
  STAFF: { kind: "SELECT_STAFF", next: "DATE", schema: idPayload("staffId") },
  DATE: { kind: "SELECT_DATE", next: "SLOT", schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }) },
  SLOT: { kind: "SELECT_SLOT", next: "CUSTOMER_NAME", schema: z.object({ startsAt: z.string().datetime({ offset: true }) }) },
  CUSTOMER_NAME: { kind: "ENTER_NAME", next: "CUSTOMER_PHONE", schema: z.object({ name: z.string().trim().min(1).max(120) }) },
  CUSTOMER_PHONE: { kind: "ENTER_PHONE", next: "CONFIRM", schema: z.object({ phone: z.string().regex(/^\+992\d{9}$/) }) },
  CONFIRM: { kind: "CONFIRM_BOOKING", next: "AWAITING_PAYMENT", schema: z.object({ bookingId: z.string().min(1).optional(), paymentId: z.string().min(1).optional() }) },
  AWAITING_PAYMENT: { kind: "PAYMENT_SUBMITTED", next: "AWAITING_RECEIPT", schema: z.object({}) },
  AWAITING_RECEIPT: { kind: "RECEIPT_ACCEPTED", next: "COMPLETE", schema: z.object({}) },
  COMPLETE: { kind: "RESTART", next: "LANGUAGE", schema: z.object({}) },
};

export function transitionConversationState(
  current: ConversationState,
  command: ConversationCommand,
): ConversationState {
  const transition = transitions[current.state];
  if (transition.kind !== command.kind) {
    throw new Error(`Conversation command is not allowed in ${current.state}`);
  }
  const payload = transition.schema.parse(command.payload);
  return {
    state: transition.next,
    data: command.kind === "RESTART" ? {} : { ...current.data, ...payload },
  };
}
