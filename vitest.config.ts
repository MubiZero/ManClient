import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // Every test shares one database, so files must not run at the same time. `pnpm test` passes
    // --no-file-parallelism, but this key used to sit at the config root where Vitest never reads
    // it, so invoking `vitest run` directly silently went parallel and produced failures in
    // whichever file lost the race. Declared here it holds for both entry points.
    fileParallelism: false,
    // Integration tests talk to a real Postgres; 5s is tight enough that an ordinary slow fixture
    // reads as a failure.
    testTimeout: 20_000,
  },
});
