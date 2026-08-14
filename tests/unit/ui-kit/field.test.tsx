// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Field, Input } from "@/features/ui-kit/field";

// Vitest runs without `globals`, so Testing Library's automatic cleanup never registers and one test's
// markup would still be on the page while the next one queries it.
afterEach(cleanup);

describe("Field", () => {
  it("ties the label to the control it names", () => {
    render(<Field label="Название услуги"><Input name="name" /></Field>);
    expect(screen.getByLabelText("Название услуги").getAttribute("name")).toBe("name");
  });

  it("marks the control invalid and reads the reason out with it", () => {
    render(<Field label="Стоимость" error="Укажите сумму больше нуля."><Input name="amount" /></Field>);

    const control = screen.getByLabelText("Стоимость");
    const message = screen.getByRole("alert");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    // Without the link the label is announced and the reason never is.
    expect(control.getAttribute("aria-describedby")).toBe(message.getAttribute("id"));
    expect(message.textContent).toBe("Укажите сумму больше нуля.");
  });

  it("describes the control with its hint, without calling it invalid", () => {
    render(<Field label="Телефон" hint="Например, +992 90 000 00 00"><Input name="phone" /></Field>);

    const control = screen.getByLabelText("Телефон");
    expect(control.getAttribute("aria-invalid")).toBeNull();
    expect(control.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leaves a control alone when nothing is wrong and nothing is explained", () => {
    render(<Field label="Комментарий"><Input name="comment" /></Field>);

    const control = screen.getByLabelText("Комментарий");
    expect(control.getAttribute("aria-invalid")).toBeNull();
    expect(control.getAttribute("aria-describedby")).toBeNull();
  });
});
