import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { tenantStorage, getCacheFilePath } from "./tenantStorage";

describe("Test Cache Isolation Guard", () => {
  it("never modifies data/tenants_cache.json during test execution", () => {
    const devCachePath = path.resolve("data/tenants_cache.json");
    expect(fs.existsSync(devCachePath)).toBe(true);

    const hashBefore = crypto
      .createHash("sha256")
      .update(fs.readFileSync(devCachePath))
      .digest("hex");

    // Verify current test environment uses an isolated temporary cache file
    const activeTestCache = getCacheFilePath();
    expect(activeTestCache).not.toBe(devCachePath);

    // Perform state-modifying tenant operations
    const ws = tenantStorage.createWorkspace({
      name: "Isolation Guard Workspace",
      userId: 777,
      userName: "Test Isolator",
      userEmail: "isolator@test.org",
    });

    tenantStorage.logAudit({
      workspaceId: ws.id,
      userId: 777,
      userName: "Test Isolator",
      action: "workspace.isolated_test",
      resourceType: "workspace",
      resourceId: ws.id,
    });

    tenantStorage.recordIntervention({
      workspaceId: ws.id,
      customerId: 9999,
      sourceCustomerId: "CUST9999",
      playbookType: "winback-discount-15",
      status: "sent",
      performedBy: 777,
    });

    // Check that dev cache on disk remains 100% byte-for-byte identical
    const hashAfter = crypto
      .createHash("sha256")
      .update(fs.readFileSync(devCachePath))
      .digest("hex");

    expect(hashAfter).toBe(hashBefore);
  });
});
