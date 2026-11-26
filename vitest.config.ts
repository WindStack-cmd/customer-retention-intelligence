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
    setupFiles: ["server/testSetup.ts"],
    testTimeout: 15000,
    hookTimeout: 20000,
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 4,
      },
    },
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "scripts/**/*.test.ts",
      "client/src/**/*.test.ts",
    ],
  },
});
