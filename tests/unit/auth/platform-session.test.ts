import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/core/auth/platform-session";

describe("requirePlatformAdmin", () => {
  it("redirects to login when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects a signed-in user who is not a platform admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1", isPlatformAdmin: false, name: "Владелец" } } as never);

    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("returns the actor for a platform admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1", isPlatformAdmin: true, name: "Админ" } } as never);

    await expect(requirePlatformAdmin()).resolves.toEqual({ userId: "user-1", displayName: "Админ" });
  });
});
