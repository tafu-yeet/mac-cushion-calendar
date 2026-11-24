import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit tests for the pure logic in src/lib (npm test). The row level security tests are SQL:
// supabase/tests/member_rls.sql.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
