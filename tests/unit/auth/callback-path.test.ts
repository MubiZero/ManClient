import { describe, expect, it } from "vitest";

import { safeCallbackPath } from "@/core/auth/callback-path";

describe("safeCallbackPath", () => {
  it("keeps a path inside the app", () => {
    expect(safeCallbackPath("/dashboard/settings/integrations")).toBe("/dashboard/settings/integrations");
    expect(safeCallbackPath("/dashboard?tab=plan#top")).toBe("/dashboard?tab=plan#top");
  });

  it("refuses another origin, however it is spelled", () => {
    // Each of these is read by a browser as a host, not as a path on this site.
    expect(safeCallbackPath("https://evil.example/login")).toBeNull();
    expect(safeCallbackPath("//evil.example/login")).toBeNull();
    expect(safeCallbackPath("/\\evil.example/login")).toBeNull();
    expect(safeCallbackPath("javascript:alert(1)")).toBeNull();
  });

  it("refuses a value that only looks safe until the browser trims it", () => {
    expect(safeCallbackPath(" //evil.example")).toBeNull();
    expect(safeCallbackPath("/\tdashboard")).toBeNull();
    expect(safeCallbackPath("/dash\nboard")).toBeNull();
  });

  it("refuses nothing, and refuses more than a URL should hold", () => {
    expect(safeCallbackPath(undefined)).toBeNull();
    expect(safeCallbackPath(null)).toBeNull();
    expect(safeCallbackPath("")).toBeNull();
    expect(safeCallbackPath(`/${"a".repeat(512)}`)).toBeNull();
  });

  it("refuses a relative path, which would resolve against wherever the login page sits", () => {
    expect(safeCallbackPath("dashboard")).toBeNull();
    expect(safeCallbackPath("../admin")).toBeNull();
  });
});
