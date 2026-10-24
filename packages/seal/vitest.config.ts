import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
    // tlock-js logs every beacon it fetches; keep the test output readable.
    onConsoleLog: (log) => !log.startsWith("beacon received"),
  },
});
