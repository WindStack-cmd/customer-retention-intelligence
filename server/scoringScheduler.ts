import { tenantStorage } from "./tenantStorage";
import { executeScoringRun } from "./scoringRunner";

let schedulerInterval: NodeJS.Timeout | null = null;

export interface SchedulerStatus {
  enabled: boolean;
  scheduleDescription: string;
  nextScheduledRun: string;
  lastRunAt: string | null;
  activeWorkspacesCount: number;
}

export function getSchedulerStatus(workspaceId?: string): SchedulerStatus {
  const now = new Date();
  // Next run is daily at 02:00 UTC
  const nextRun = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      2,
      0,
      0,
      0
    )
  );
  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  let lastRunAt: string | null = null;
  if (workspaceId) {
    const runs = tenantStorage.listScoringRuns(workspaceId, 1);
    if (runs.length > 0 && runs[0].completedAt) {
      lastRunAt = new Date(runs[0].completedAt).toISOString();
    }
  }

  const workspaces = tenantStorage.listAllWorkspaces();

  return {
    enabled: true,
    scheduleDescription: "Active (daily at 02:00 UTC)",
    nextScheduledRun: nextRun.toISOString(),
    lastRunAt,
    activeWorkspacesCount: workspaces.length,
  };
}

export async function runNightlyScoringBatch(): Promise<{
  scored: number;
  failed: number;
}> {
  console.log("[Scheduler] Starting nightly automated scoring check...");
  const workspaces = tenantStorage.listAllWorkspaces();
  let scored = 0;
  let failed = 0;

  for (const ws of workspaces) {
    try {
      const runs = tenantStorage.listScoringRuns(ws.id, 1);
      const lastRun = runs[0];
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Only score if last run was > 24 hours ago, or no runs yet
      if (
        !lastRun ||
        !lastRun.completedAt ||
        now - new Date(lastRun.completedAt).getTime() >= oneDayMs
      ) {
        console.log(`[Scheduler] Executing scheduled scoring for workspace: ${ws.id}`);
        await executeScoringRun(ws.id, "scheduled");
        scored++;
      } else {
        console.log(`[Scheduler] Workspace ${ws.id} was scored recently, skipping.`);
      }
    } catch (err: any) {
      console.error(
        `[Scheduler] Failed scoring for workspace ${ws.id}:`,
        err?.message
      );
      failed++;
    }
  }

  return { scored, failed };
}

export function startScoringScheduler(
  intervalMs: number = 60 * 60 * 1000
): void {
  if (schedulerInterval) return;
  console.log(
    `[Scheduler] Initializing in-process scheduled nightly scoring runner (check every ${intervalMs / 1000}s)`
  );

  schedulerInterval = setInterval(() => {
    runNightlyScoringBatch().catch(err =>
      console.error("[Scheduler] Scheduled check error:", err)
    );
  }, intervalMs);
}

export function stopScoringScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
