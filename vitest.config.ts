import { defineConfig } from "vitest/config";

// Minimal, standalone Vitest config — deliberately not merged into
// vite.config.ts, which uses @lovable.dev/vite-tanstack-config's wrapper
// and warns against adding plugins manually.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
