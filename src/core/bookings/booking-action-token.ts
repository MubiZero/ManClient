import { createHmac, timingSafeEqual } from "node:crypto";

type BookingAction = "link_payment" | "view_payment";
type TokenInput = { paymentId: string; action: BookingAction; expiresAt: Date };
type CustomerBookingAction = "cancel_booking" | "reschedule_booking";
type CustomerBookingTokenInput = { bookingId: string; action: CustomerBookingAction; expiresAt: Date };

const actionCodes: Record<BookingAction, string> = { link_payment: "p", view_payment: "w" };
const customerActionCodes: Record<CustomerBookingAction, string> = { cancel_booking: "c", reschedule_booking: "r" };

export function createBookingActionToken(input: TokenInput): string {
  const expiresAt = Math.floor(input.expiresAt.getTime() / 1000).toString(36);
  const payload = `${actionCodes[input.action]}.${input.paymentId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyBookingActionToken(token: string, now = new Date(), expectedAction?: BookingAction): TokenInput {
  const { actionCode, subjectId: paymentId, expiresAt } = decodeToken(token, now);
  const action = Object.entries(actionCodes).find(([, code]) => code === actionCode)?.[0] as BookingAction | undefined;
  if (!action) throw new Error("Booking action token has the wrong action");
  if (expectedAction && action !== expectedAction) throw new Error("Booking action token has the wrong action");

  return { paymentId, action, expiresAt };
}

export function createCustomerBookingToken(input: CustomerBookingTokenInput): string {
  return createToken(customerActionCodes[input.action], input.bookingId, input.expiresAt);
}

export function verifyCustomerBookingToken(token: string, expectedAction: CustomerBookingAction, now = new Date()): CustomerBookingTokenInput {
  const { actionCode, subjectId: bookingId, expiresAt } = decodeToken(token, now);
  const action = Object.entries(customerActionCodes).find(([, code]) => code === actionCode)?.[0] as CustomerBookingAction | undefined;
  if (action !== expectedAction) throw new Error("Customer booking token has the wrong action");
  return { bookingId, action, expiresAt };
}

function createToken(actionCode: string, subjectId: string, expiresAtDate: Date): string {
  const expiresAt = Math.floor(expiresAtDate.getTime() / 1000).toString(36);
  const payload = `${actionCode}.${subjectId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function decodeToken(token: string, now: Date) {
  const [actionCode, subjectId, expiresAtValue, signature] = token.split(".");
  const payload = `${actionCode}.${subjectId}.${expiresAtValue}`;
  if (!actionCode || !subjectId || !expiresAtValue || !signature || !matchesSignature(payload, signature)) {
    throw new Error("Booking action token is invalid");
  }
  const expiresAt = new Date(Number.parseInt(expiresAtValue, 36) * 1000);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) throw new Error("Booking action token is expired");
  return { actionCode, subjectId, expiresAt };
}

function sign(payload: string): string {
  const secret = process.env.BOOKING_ACTION_SECRET;
  if (!secret || secret.length < 32) throw new Error("BOOKING_ACTION_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(payload).digest().subarray(0, 16).toString("base64url");
}

function matchesSignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
