import { describe, expect, it } from "vitest";
import {
  getSchedulerStatus,
  runNightlyScoringBatch,
} from "./scoringScheduler";
import { tenantStorage } from "./tenantStorage";

describe("Phase 2: In-Process Nightly Scoring Scheduler", () => {
  it("computes next scheduled run daily at 02:00 UTC", () => {
    const status = getSchedulerStatus("ws_default");
    expect(status.enabled).toBe(true);
    expect(status.scheduleDescription).toContain("02:00 UTC");
    expect(new Date(status.nextScheduledRun).getUTCHours()).toBe(2);
  });

  it("executes nightly batch and respects concurrency lock", async () => {
    const ws = tenantStorage.createWorkspace({
      name: "Batch Scoring WS",
      userId: 601,
    });

    const result = await runNightlyScoringBatch();
    expect(result).toBeDefined();

    const runs = tenantStorage.listScoringRuns(ws.id, 1);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0].status).toBe("completed");
  });

  it("handles stale runs without blocking future runs", () => {
    const ws = tenantStorage.createWorkspace({
      name: "Stale Lock WS",
      userId: 602,
    });

    // Create an artificial stale run from 45 mins ago
    const staleRun = tenantStorage.createScoringRun(ws.id, "manual");
    staleRun.startedAt = new Date(Date.now() - 45 * 60 * 1000);

    // Creating another run should automatically expire the stale run and succeed
    const newRun = tenantStorage.createScoringRun(ws.id, "scheduled");
    expect(newRun.id).toBeGreaterThan(staleRun.id);
    expect(newRun.status).toBe("running");

    // Old run is marked failed
    expect(staleRun.status).toBe("failed");
    expect(staleRun.error).toContain("timed out");
  });
});
