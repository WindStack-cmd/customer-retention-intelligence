import mysql, { type RowDataPacket } from "mysql2/promise";

const MODEL_RUN_ID = Number(process.env.RECOMMENDATION_MODEL_RUN_ID ?? "1");
const FEATURE_VERSION = "phase4-rfm-behavioral-v1";
const METHODOLOGY_VERSION = "retention-rules-v1";

type DbRow = RowDataPacket & Record<string, unknown>;

function number(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result))
    throw new Error(`Non-finite database value: ${String(value)}`);
  return result;
}

function assertZero(value: unknown, label: string): void {
  const result = number(value);
  if (result !== 0) throw new Error(`${label}: expected 0, got ${result}`);
}

async function one(
  connection: mysql.Connection,
  sql: string,
  params: unknown[] = []
): Promise<DbRow> {
  const [rows] = await connection.query<DbRow[]>(sql, params);
  if (!rows[0]) throw new Error(`No row returned for query: ${sql}`);
  return rows[0];
}

export async function verifyRecommendations(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const run = await one(
      connection,
      `SELECT id, provenanceId, modelRunId, explanationRunId, valueRunId,
        featureVersion, cutoffAt, methodologyVersion, rationaleVersion, status
       FROM retention_recommendation_runs
       WHERE modelRunId = ? AND featureVersion = ? AND methodologyVersion = ?
       ORDER BY id DESC LIMIT 1`,
      [MODEL_RUN_ID, FEATURE_VERSION, METHODOLOGY_VERSION]
    );
    const runId = number(run.id);
    if (String(run.status) !== "completed")
      throw new Error(`Recommendation run is ${String(run.status)}`);
    if (String(run.rationaleVersion) !== "retention-rationale-v1")
      throw new Error("Rationale version mismatch");

    const counts = await one(
      connection,
      `SELECT COUNT(*) AS rowCount, COUNT(DISTINCT customerId) AS customerCount,
        COUNT(DISTINCT snapshotId) AS snapshotCount,
        SUM(priorityScore < 0 OR priorityScore > 100) AS invalidScores,
        SUM(priorityBand NOT IN ('Urgent','High','Monitor')) AS invalidBands,
        SUM(recommendedAction = '') AS emptyActions,
        SUM(rationale = '') AS emptyRationales,
        SUM(interventionCost IS NOT NULL OR expectedBenefit IS NOT NULL) AS unsupportedEconomics,
        SUM(cutoffAt > ?) AS futureRows
       FROM customer_retention_recommendations WHERE runId = ?`,
      [run.cutoffAt, runId]
    );
    if (number(counts.rowCount) !== number(counts.customerCount))
      throw new Error("Expected one recommendation per customer");
    assertZero(counts.invalidScores, "priority score bounds");
    assertZero(counts.invalidBands, "priority bands");
    assertZero(counts.emptyActions, "empty actions");
    assertZero(counts.emptyRationales, "empty rationales");
    assertZero(
      counts.unsupportedEconomics,
      "unsupported intervention economics"
    );
    assertZero(counts.futureRows, "future-dated recommendations");

    const duplicates = await one(
      connection,
      `SELECT COUNT(*) - COUNT(DISTINCT CONCAT(runId, ':', customerId)) AS duplicateCustomers,
        COUNT(*) - COUNT(DISTINCT CONCAT(runId, ':', snapshotId)) AS duplicateSnapshots
       FROM customer_retention_recommendations WHERE runId = ?`,
      [runId]
    );
    assertZero(duplicates.duplicateCustomers, "duplicate customer keys");
    assertZero(duplicates.duplicateSnapshots, "duplicate snapshot keys");

    const alignment = await one(
      connection,
      `SELECT SUM(CASE WHEN c.id IS NULL THEN 1 ELSE 0 END) AS missingCustomers,
        SUM(CASE WHEN s.id IS NULL THEN 1 ELSE 0 END) AS missingSnapshots,
        SUM(CASE WHEN v.id IS NULL THEN 1 ELSE 0 END) AS missingValues,
        SUM(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END) AS missingModels,
        SUM(CASE WHEN e.id IS NULL THEN 1 ELSE 0 END) AS missingExplanations,
        SUM(CASE WHEN s.cutoffAt <> r.cutoffAt OR s.featureVersion <> r.featureVersion THEN 1 ELSE 0 END) AS temporalMismatches,
        SUM(CASE WHEN v.modelRunId <> r.modelRunId OR v.runId <> r.valueRunId THEN 1 ELSE 0 END) AS valueMismatches
       FROM customer_retention_recommendations r
       LEFT JOIN customers c ON c.id = r.customerId
       LEFT JOIN customer_feature_snapshots s ON s.id = r.snapshotId
       LEFT JOIN customer_value_snapshots v ON v.runId = r.valueRunId AND v.customerId = r.customerId AND v.snapshotId = r.snapshotId
       LEFT JOIN churn_model_runs p ON p.id = r.modelRunId
       LEFT JOIN customer_explanations e ON e.id = r.explanationId
        AND e.explanationRunId = r.explanationRunId AND e.snapshotId = r.snapshotId
       WHERE r.runId = ?`,
      [runId]
    );
    assertZero(alignment.missingCustomers, "customer orphans");
    assertZero(alignment.missingSnapshots, "snapshot orphans");
    assertZero(alignment.missingValues, "value orphans");
    assertZero(alignment.missingModels, "model orphans");
    assertZero(alignment.missingExplanations, "explanation orphans");
    assertZero(alignment.temporalMismatches, "temporal mismatches");
    assertZero(alignment.valueMismatches, "value alignment");

    const rationale = await one(
      connection,
      `SELECT SUM(JSON_EXTRACT(supportingSignals, '$.calibratedChurnProbability') IS NULL) AS missingRiskSignals,
        SUM(JSON_EXTRACT(supportingSignals, '$.revenueAtRisk') IS NULL) AS missingRevenueSignals,
        SUM(JSON_EXTRACT(supportingSignals, '$.behavioralClv') IS NULL) AS missingValueSignals,
        SUM(JSON_EXTRACT(supportingSignals, '$.topShapSignal') IS NULL) AS missingShapSignals
       FROM customer_retention_recommendations WHERE runId = ?`,
      [runId]
    );
    const summary = await one(
      connection,
      `SELECT COUNT(*) AS rowCount,
        SUM(priorityBand='Urgent') AS urgentCount,
        SUM(priorityBand='High') AS highCount,
        SUM(priorityBand='Monitor') AS monitorCount,
        AVG(priorityScore) AS averagePriorityScore
       FROM customer_retention_recommendations WHERE runId = ?`,
      [runId]
    );
    console.log(
      JSON.stringify(
        {
          status: "verified",
          runId,
          modelRunId: MODEL_RUN_ID,
          explanationRunId: number(run.explanationRunId),
          valueRunId: number(run.valueRunId),
          featureVersion: run.featureVersion,
          methodologyVersion: run.methodologyVersion,
          counts,
          duplicates,
          alignment,
          rationale,
          summary,
        },
        null,
        2
      )
    );
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith("verify_retention_recommendations.ts")) {
  verifyRecommendations().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
