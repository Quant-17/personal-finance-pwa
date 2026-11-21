import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "tests/finance.test.ts",
      "src/private/*.test.ts",
      "supabase/functions/**/*.test.ts",
    ],
  },
});
