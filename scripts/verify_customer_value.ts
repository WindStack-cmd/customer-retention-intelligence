import mysql, { type RowDataPacket } from "mysql2/promise";

const MODEL_RUN_ID = Number(process.env.CUSTOMER_VALUE_MODEL_RUN_ID ?? "1");
const FEATURE_VERSION =
  process.env.CUSTOMER_VALUE_FEATURE_VERSION ?? "phase4-rfm-behavioral-v1";
const METHODOLOGY_VERSION = "behavioral-clv-v1";

type DbRow = RowDataPacket & Record<string, unknown>;

function number(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result))
    throw new Error(`Non-finite database value: ${String(value)}`);
  return result;
}

function assertEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected)
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

async function one(
  connection: mysql.Connection,
  sql: string,
  params: unknown[] = []
): Promise<DbRow> {
  const [rows] = await connection.query<DbRow[]>(sql, params);
  if (!rows[0]) throw new Error(`No result for query: ${sql}`);
  return rows[0];
}

export async function verifyCustomerValue(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const run = await one(
      connection,
      `SELECT id, provenanceId, modelRunId, featureVersion, cutoffAt, horizonDays,
        methodologyVersion, status
       FROM revenue_intelligence_runs
       WHERE modelRunId = ? AND featureVersion = ? AND methodologyVersion = ?
       ORDER BY id DESC LIMIT 1`,
      [MODEL_RUN_ID, FEATURE_VERSION, METHODOLOGY_VERSION]
    );
    const runId = number(run.id);
    assertEqual(number(run.modelRunId), MODEL_RUN_ID, "model run alignment");
    if (String(run.status) !== "completed")
      throw new Error(`Run is not completed: ${String(run.status)}`);
    if (String(run.methodologyVersion) !== METHODOLOGY_VERSION)
      throw new Error("methodology version mismatch");

    const counts = await one(
      connection,
      `SELECT COUNT(*) AS rowCount, COUNT(DISTINCT customerId) AS customers,
        COUNT(DISTINCT snapshotId) AS snapshots,
        SUM(CASE WHEN calibratedChurnProbability < 0 OR calibratedChurnProbability > 1 THEN 1 ELSE 0 END) AS invalidProbabilities,
        SUM(CASE WHEN historicalGrossRevenue < 0 OR expectedFutureValue < 0 OR revenueAtRisk < 0 THEN 1 ELSE 0 END) AS invalidMoney,
        SUM(CASE WHEN returnValue > 0.01 THEN 1 ELSE 0 END) AS invalidReturns,
        SUM(CASE WHEN behavioralClv < historicalNetRevenue - 0.01 THEN 1 ELSE 0 END) AS invalidClv
       FROM customer_value_snapshots WHERE runId = ?`,
      [runId]
    );
    assertEqual(
      number(counts.rowCount),
      number(counts.customers),
      "one customer row per run"
    );
    assertEqual(number(counts.invalidProbabilities), 0, "probability bounds");
    assertEqual(number(counts.invalidMoney), 0, "monetary bounds");
    assertEqual(number(counts.invalidReturns), 0, "return semantics");
    assertEqual(number(counts.invalidClv), 0, "CLV lower bound");

    const duplicate = await one(
      connection,
      `SELECT COUNT(*) - COUNT(DISTINCT CONCAT(runId, ':', snapshotId)) AS duplicateSnapshots,
        COUNT(*) - COUNT(DISTINCT CONCAT(runId, ':', customerId)) AS duplicateCustomers
       FROM customer_value_snapshots WHERE runId = ?`,
      [runId]
    );
    assertEqual(
      number(duplicate.duplicateSnapshots),
      0,
      "duplicate snapshot keys"
    );
    assertEqual(
      number(duplicate.duplicateCustomers),
      0,
      "duplicate customer keys"
    );

    const orphans = await one(
      connection,
      `SELECT SUM(CASE WHEN s.id IS NULL THEN 1 ELSE 0 END) AS missingSnapshots,
        SUM(CASE WHEN c.id IS NULL THEN 1 ELSE 0 END) AS missingCustomers,
        SUM(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END) AS missingModels
       FROM customer_value_snapshots v
       LEFT JOIN customer_feature_snapshots s ON s.id = v.snapshotId
       LEFT JOIN customers c ON c.id = v.customerId
       LEFT JOIN churn_model_runs p ON p.id = v.modelRunId
       WHERE v.runId = ?`,
      [runId]
    );
    assertEqual(number(orphans.missingSnapshots), 0, "snapshot orphans");
    assertEqual(number(orphans.missingCustomers), 0, "customer orphans");
    assertEqual(number(orphans.missingModels), 0, "model orphans");

    const temporal = await one(
      connection,
      `SELECT COUNT(*) AS cutoffMismatches
       FROM customer_value_snapshots v
       JOIN customer_feature_snapshots s ON s.id = v.snapshotId
       WHERE v.runId = ? AND (v.cutoffAt <> s.cutoffAt OR v.cutoffAt > ? OR v.featureVersion <> s.featureVersion)`,
      [runId, run.cutoffAt]
    );
    assertEqual(
      number(temporal.cutoffMismatches),
      0,
      "temporal/feature alignment"
    );

    const valueReconciliation = await one(
      connection,
      `SELECT SUM(v.historicalGrossRevenue) AS valueGross,
        SUM(v.historicalNetRevenue) AS valueNet,
        COUNT(DISTINCT v.customerId) AS valueCustomers
       FROM customer_value_snapshots v WHERE v.runId = ?`,
      [runId]
    );
    const sourceReconciliation = await one(
      connection,
      `SELECT SUM(CASE WHEN lineRevenue > 0 THEN lineRevenue ELSE 0 END) AS sourceGross,
        SUM(lineRevenue) AS sourceNet,
        COUNT(DISTINCT sourceCustomerId) AS sourceCustomers
       FROM retail_source_rows
       WHERE sourceCustomerId IS NOT NULL AND invoiceDate <= ?`,
      [run.cutoffAt]
    );
    const summary = await one(
      connection,
      `SELECT COUNT(*) AS rowCount, COUNT(DISTINCT customerId) AS customers,
        SUM(expectedFutureValue) AS expectedFutureValue,
        SUM(revenueAtRisk) AS revenueAtRisk,
        MIN(cutoffAt) AS minCutoff, MAX(cutoffAt) AS maxCutoff
       FROM customer_value_snapshots WHERE runId = ?`,
      [runId]
    );
    console.log(
      JSON.stringify(
        {
          status: "verified",
          runId,
          modelRunId: MODEL_RUN_ID,
          methodologyVersion: METHODOLOGY_VERSION,
          counts,
          orphans,
          reconciliation: {
            value: valueReconciliation,
            source: sourceReconciliation,
          },
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

if (process.argv[1]?.endsWith("verify_customer_value.ts")) {
  verifyCustomerValue().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
