import { describe, expect, it } from "vitest";

import { canDeliverOn, firstChannelFor, nextChannelAfter, type ChannelBusiness } from "@/core/notifications/channel-ladder";

/**
 * The ladder decides how much a message costs, so the cases worth pinning are the ones where money
 * leaks: a paid channel chosen while a free one was available, or a paid channel chosen for a salon
 * that never agreed to pay for messages at all.
 */
describe("channel ladder", () => {
  const business: ChannelBusiness = {
    subscriptionPlan: "STANDARD",
    subscriptionStatus: "ACTIVE",
    subscriptionEndsAt: null,
    smsNotificationsEnabled: true,
    whatsappPhoneNumberId: "wa-1",
    whatsappTemplateName: "reminder_ru",
    whatsappConfirmationTemplateName: "confirm_ru",
    whatsappCancellationTemplateName: "cancel_ru",
  };
  const withChat = { telegramChatId: "42" };
  const withoutChat = { telegramChatId: null };

  it("spends nothing when a free channel can carry the message", () => {
    expect(firstChannelFor({ kind: "BOOKING_REMINDER", customer: withChat, business })).toBe("TELEGRAM");
    expect(firstChannelFor({ kind: "BOOKING_REMINDER", customer: withoutChat, business })).toBe("WHATSAPP");
  });

  it("reaches SMS only when everything free is out", () => {
    const noWhatsApp = { ...business, whatsappPhoneNumberId: null };
    expect(firstChannelFor({ kind: "BOOKING_REMINDER", customer: withoutChat, business: noWhatsApp })).toBe("SMS");
  });

  it("keeps both SMS switches in front of the only channel that costs money", () => {
    const offline = { ...business, whatsappPhoneNumberId: null };
    const candidate = { kind: "BOOKING_REMINDER", customer: withoutChat };

    expect(canDeliverOn("SMS", { ...candidate, business: { ...offline, smsNotificationsEnabled: false } })).toBe(false);
    // The plan gate stands even when the salon has switched SMS on: it is paying for a plan without it.
    expect(canDeliverOn("SMS", { ...candidate, business: { ...offline, subscriptionPlan: "START" } })).toBe(false);
    expect(firstChannelFor({ ...candidate, business: { ...offline, subscriptionPlan: "START" } })).toBeNull();
  });

  it("refuses to borrow an approved wording for a message it was not approved for", () => {
    // WhatsApp templates and payom templates are both somebody else's approved sentences; a review
    // request has neither, so it stays on the one channel whose words are ours.
    expect(canDeliverOn("WHATSAPP", { kind: "REVIEW_REQUEST", customer: withoutChat, business })).toBe(false);
    expect(canDeliverOn("SMS", { kind: "REVIEW_REQUEST", customer: withoutChat, business })).toBe(false);
    expect(firstChannelFor({ kind: "REVIEW_REQUEST", customer: withChat, business })).toBe("TELEGRAM");
  });

  it("walks down from the rung that failed, never back up", () => {
    const candidate = { kind: "BOOKING_REMINDER", customer: withChat, business };
    expect(nextChannelAfter("TELEGRAM", candidate)).toBe("WHATSAPP");
    expect(nextChannelAfter("WHATSAPP", candidate)).toBe("SMS");
    expect(nextChannelAfter("SMS", candidate)).toBeNull();
  });

  it("skips a rung that cannot carry this kind while walking down", () => {
    const noWhatsApp = { ...business, whatsappPhoneNumberId: null };
    expect(nextChannelAfter("TELEGRAM", { kind: "BOOKING_REMINDER", customer: withChat, business: noWhatsApp })).toBe("SMS");
  });
});
