import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    env: {
      TENANT_CACHE_FILE: path.resolve(templateRoot, "data", "tenants_test_cache.json"),
    },
    setupFiles: ["server/testSetup.ts"],
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "scripts/**/*.test.ts",
      "client/src/**/*.test.ts",
    ],
  },
});
