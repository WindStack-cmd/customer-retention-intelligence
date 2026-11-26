import { describe, expect, it } from "vitest";
import {
  isDbConnectionSkipped,
  recordDbFailure,
  resetDbFailureCooldown,
  getDb,
} from "./db";

describe("Fail-fast DB Fallback & 60s Cooldown Guard", () => {
  it("skips DB connection in tests without attempting network sockets", async () => {
    expect(isDbConnectionSkipped()).toBe(true);
    const db = await getDb();
    expect(db).toBeNull();
  });

  it("remembers connection failure for 60 seconds and skips later DB calls", () => {
    resetDbFailureCooldown();
    const oldEnv = process.env.SKIP_DB_CONNECTION;
    const oldVitest = process.env.VITEST;
    const oldNodeEnv = process.env.NODE_ENV;

    try {
      // Simulate non-test environment
      delete process.env.SKIP_DB_CONNECTION;
      delete process.env.VITEST;
      (process.env as any).NODE_ENV = "development";

      expect(isDbConnectionSkipped()).toBe(false);

      // Record a simulated connection failure
      recordDbFailure(new Error("connect ECONNREFUSED 127.0.0.1:3306"));

      // Failure must be remembered
      expect(isDbConnectionSkipped()).toBe(true);

      // Reset works
      resetDbFailureCooldown();
      expect(isDbConnectionSkipped()).toBe(false);
    } finally {
      process.env.SKIP_DB_CONNECTION = oldEnv;
      process.env.VITEST = oldVitest;
      process.env.NODE_ENV = oldNodeEnv;
    }
  });
});
