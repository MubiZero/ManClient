import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog } from "@/features/ui/dialog";

describe("Dialog", () => {
  it("leaves the native dialog closed in markup so the client can open it with showModal", () => {
    const html = renderToStaticMarkup(<Dialog open title="Подтвердить действие"><button type="button">Продолжить</button></Dialog>);

    expect(html).not.toContain("<dialog open");
  });
});
