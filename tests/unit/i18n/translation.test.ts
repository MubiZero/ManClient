import { describe, expect, it } from "vitest";

import { t } from "@/i18n/translate";

describe("t", () => {
  it("returns booking confirmation copy in Russian and Tajik", () => {
    expect(t("ru", "booking.confirmed")).not.toEqual("booking.confirmed");
    expect(t("tg", "booking.confirmed")).not.toEqual("booking.confirmed");
  });
});
