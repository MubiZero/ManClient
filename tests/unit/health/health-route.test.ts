import { beforeEach, describe, expect, test, vi } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/core/database/prisma", () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  test("returns ok when the database is reachable", async () => {
    queryRaw.mockResolvedValue([{ ready: 1 }]);
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  test("returns a generic unavailable response when the database check fails", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });
});
