import { describe, expect, it } from "vitest";
import { ENV } from "./env";
import { createRequestId } from "./logger";
import { customerFilterInput } from "./validation";

describe("repository foundation", () => {
  it("provides safe runtime defaults for demo mode and service identity", () => {
    expect(ENV.serviceName).toBeTruthy();
    expect(ENV.nodeEnv).toBeTruthy();
    expect(typeof ENV.demoMode).toBe("boolean");
    expect(ENV.cookieSecret).not.toContain("secret");
  });

  it("creates unique request identifiers", () => {
    const first = createRequestId();
    const second = createRequestId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });

  it("bounds externally supplied filter inputs", () => {
    expect(customerFilterInput.safeParse({ page: 0 }).success).toBe(false);
    expect(
      customerFilterInput.safeParse({
        page: 1,
        pageSize: 25,
        search: "enterprise",
      }).success
    ).toBe(true);
  });
});
