import { describe, expect, it } from "vitest";
import { z } from "zod";

import { invalidInputFor, serviceInputSchema } from "@/core/business-settings/setting-schemas";
import { settingsErrorField } from "@/core/business-settings/settings-error";
import { errorSearchParams, fieldErrorMap } from "@/features/dashboard/form-error";

const VALID_SERVICE = {
  branchId: "branch-1",
  name: "Стрижка",
  durationMinutes: 45,
  amountSomoni: "50.00",
  staffIds: ["staff-1"],
  resourceIds: [],
  isPublished: false,
};

describe("field-aware settings refusals", () => {
  it("names the control a schema rejected", () => {
    const parsed = serviceInputSchema.safeParse({ ...VALID_SERVICE, amountSomoni: "не число" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const error = invalidInputFor(parsed.error);
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.field).toBe("amountSomoni");
  });

  it("names no control when the failure is inside a list, where no single input holds it", () => {
    const listSchema = z.object({ rules: z.array(z.object({ startsAt: z.string() })) });
    const parsed = listSchema.safeParse({ rules: [{ startsAt: 1 }] });
    if (parsed.success) throw new Error("fixture should not parse");

    expect(invalidInputFor(parsed.error).field).toBeUndefined();
  });

  it("carries the control through the redirect the actions use", () => {
    const parsed = serviceInputSchema.safeParse({ ...VALID_SERVICE, name: "х" });
    if (parsed.success) throw new Error("fixture should not parse");
    const error = invalidInputFor(parsed.error);

    expect(errorSearchParams("INVALID_INPUT", error)).toBe("error=INVALID_INPUT&field=name");
    // A refusal about the request rather than a field leaves the message above the form.
    expect(errorSearchParams("FUTURE_BOOKINGS", new Error("unrelated"))).toBe("error=FUTURE_BOOKINGS");
  });

  it("puts the message on the control, and only when there is both a control and a message", () => {
    expect(fieldErrorMap("amountSomoni", "Проверьте поля.")).toEqual({ amountSomoni: "Проверьте поля." });
    expect(fieldErrorMap(undefined, "Проверьте поля.")).toBeUndefined();
    expect(fieldErrorMap("amountSomoni", undefined)).toBeUndefined();
  });

  it("reads the field off a settings error and ignores anything else thrown", () => {
    expect(settingsErrorField(new Error("boom"))).toBeUndefined();
    expect(settingsErrorField(null)).toBeUndefined();
  });
});
