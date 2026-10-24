import mysql, { type RowDataPacket } from "mysql2/promise";

const FEATURE_RUN_ID = Number(process.env.FEATURE_RUN_ID ?? "1");
const PROVENANCE_ID = Number(process.env.FEATURE_PROVENANCE_ID ?? "30001");
const INGESTION_RUN_ID = Number(
  process.env.FEATURE_INGESTION_RUN_ID ?? "30001"
);

type DbRow = RowDataPacket & Record<string, unknown>;

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number))
    throw new Error(`Expected numeric database value, got ${String(value)}`);
  return number;
}

function requirePass(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Phase 4 verification failed: ${message}`);
}

export async function verifyFeatures(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [runs] = await connection.query<DbRow[]>(
      "SELECT id, provenanceId, featureVersion, cutoffAt, horizonDays FROM customer_feature_runs WHERE id = ? LIMIT 1",
      [FEATURE_RUN_ID]
    );
    requirePass(
      runs.length === 1,
      `feature run ${FEATURE_RUN_ID} does not exist`
    );
    const run = runs[0];
    const [counts] = await connection.query<DbRow[]>(
      `SELECT
        COUNT(*) AS snapshotCount,
        COUNT(DISTINCT customerId) AS distinctCustomers,
        SUM(CASE WHEN lastPurchaseDate > cutoffAt THEN 1 ELSE 0 END) AS cutoffLeakage,
        SUM(CASE WHEN firstPurchaseDate > lastPurchaseDate THEN 1 ELSE 0 END) AS invalidDateOrder,
        SUM(CASE WHEN featureVersion <> ? THEN 1 ELSE 0 END) AS versionMismatch,
        SUM(CASE WHEN totalOrders < 1 OR purchaseCount < 1 OR returnRate < 0 OR returnRate > 1 OR cancellationRate < 0 OR cancellationRate > 1 THEN 1 ELSE 0 END) AS invalidMetricRows
      FROM customer_feature_snapshots
      WHERE runId = ?`,
      [String(run.featureVersion), FEATURE_RUN_ID]
    );
    const [duplicateRows] = await connection.query<DbRow[]>(
      "SELECT COUNT(*) AS duplicateGroups FROM (SELECT runId, customerId, COUNT(*) AS snapshotCount FROM customer_feature_snapshots WHERE runId = ? GROUP BY runId, customerId HAVING snapshotCount > 1) duplicates",
      [FEATURE_RUN_ID]
    );
    const [eligibleRows] = await connection.query<DbRow[]>(
      "SELECT COUNT(DISTINCT customerId) AS eligibleCustomers FROM orders WHERE ingestionRunId = ? AND invoiceDate <= ?",
      [INGESTION_RUN_ID, run.cutoffAt]
    );
    const [labelRows] = await connection.query<DbRow[]>(
      `SELECT
        COUNT(*) AS snapshotCustomers,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM orders future
          WHERE future.customerId = snapshots.customerId
            AND future.ingestionRunId = ?
            AND future.invoiceDate > snapshots.cutoffAt
            AND future.invoiceDate <= DATE_ADD(snapshots.cutoffAt, INTERVAL ? DAY)
        ) THEN 1 ELSE 0 END) AS activeCustomers,
        SUM(CASE WHEN NOT EXISTS (
          SELECT 1 FROM orders future
          WHERE future.customerId = snapshots.customerId
            AND future.ingestionRunId = ?
            AND future.invoiceDate > snapshots.cutoffAt
            AND future.invoiceDate <= DATE_ADD(snapshots.cutoffAt, INTERVAL ? DAY)
        ) THEN 1 ELSE 0 END) AS inactiveCustomers
      FROM customer_feature_snapshots snapshots
      WHERE snapshots.runId = ?`,
      [
        INGESTION_RUN_ID,
        Number(run.horizonDays),
        INGESTION_RUN_ID,
        Number(run.horizonDays),
        FEATURE_RUN_ID,
      ]
    );

    const snapshotCount = numberValue(counts[0]?.snapshotCount);
    const distinctCustomers = numberValue(counts[0]?.distinctCustomers);
    const eligibleCustomers = numberValue(eligibleRows[0]?.eligibleCustomers);
    const result = {
      status: "verified",
      runId: FEATURE_RUN_ID,
      provenanceId: Number(run.provenanceId),
      featureVersion: String(run.featureVersion),
      cutoffAt: new Date(String(run.cutoffAt)).toISOString(),
      horizonDays: Number(run.horizonDays),
      snapshotCount,
      distinctCustomers,
      eligibleCustomers,
      duplicateGroups: numberValue(duplicateRows[0]?.duplicateGroups),
      cutoffLeakage: numberValue(counts[0]?.cutoffLeakage),
      invalidDateOrder: numberValue(counts[0]?.invalidDateOrder),
      versionMismatch: numberValue(counts[0]?.versionMismatch),
      invalidMetricRows: numberValue(counts[0]?.invalidMetricRows),
      activeCustomers: numberValue(labelRows[0]?.activeCustomers),
      inactiveCustomers: numberValue(labelRows[0]?.inactiveCustomers),
    };

    requirePass(
      Number(run.provenanceId) === PROVENANCE_ID,
      `run provenance ${String(run.provenanceId)} != expected ${PROVENANCE_ID}`
    );
    requirePass(
      snapshotCount === distinctCustomers,
      "snapshot count and distinct customer count differ"
    );
    requirePass(
      snapshotCount === eligibleCustomers,
      "snapshot count does not match eligible pre-cutoff customers"
    );
    requirePass(
      result.duplicateGroups === 0,
      `${result.duplicateGroups} duplicate snapshot groups found`
    );
    requirePass(
      result.cutoffLeakage === 0,
      `${result.cutoffLeakage} cutoff leakage rows found`
    );
    requirePass(
      result.invalidDateOrder === 0,
      `${result.invalidDateOrder} invalid date-order rows found`
    );
    requirePass(
      result.versionMismatch === 0,
      `${result.versionMismatch} feature-version mismatches found`
    );
    requirePass(
      result.invalidMetricRows === 0,
      `${result.invalidMetricRows} invalid metric rows found`
    );
    requirePass(
      result.activeCustomers + result.inactiveCustomers === snapshotCount,
      "label partition does not cover all snapshots"
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith("verify_customer_features.ts")) {
  verifyFeatures().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
