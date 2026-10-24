import mysql, { type RowDataPacket } from "mysql2/promise";

const INGESTION_RUN_ID = Number(
  process.env.FEATURE_INGESTION_RUN_ID ?? "30001"
);
const FEATURE_VERSION =
  process.env.FEATURE_VERSION ?? "phase4-rfm-behavioral-v1";
const LABEL_VERSION =
  process.env.LABEL_VERSION ?? "behavioral-inactivity-30d-v1";
const BATCH_SIZE = 250;

type DbRow = RowDataPacket & Record<string, unknown>;

type SnapshotRow = DbRow & {
  snapshotId: number;
  runId: number;
  provenanceId: number;
  customerId: number;
  cutoffAt: Date;
  horizonEndAt: Date;
  horizonDays: number;
  futureOrderCount: number;
};

function asNumber(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error(`Invalid numeric value: ${String(value)}`);
  return number;
}

function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime()))
    throw new Error(`Invalid date value: ${String(value)}`);
  return date;
}

async function insertBatch(
  connection: mysql.Connection,
  rows: SnapshotRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const placeholders = rows.map(() => "(?,?,?,?,?,?,?,?,?,?,?)").join(",");
  const values = rows.flatMap(row => {
    const futureOrderCount = asNumber(row.futureOrderCount);
    return [
      row.snapshotId,
      row.runId,
      row.provenanceId,
      row.customerId,
      asDate(row.cutoffAt),
      asDate(row.horizonEndAt),
      LABEL_VERSION,
      futureOrderCount === 0 ? 1 : 0,
      futureOrderCount,
      1,
      asDate(row.cutoffAt),
    ];
  });
  await connection.query(
    `INSERT INTO customer_behavior_labels (snapshotId, runId, provenanceId, customerId, cutoffAt, horizonEndAt, labelVersion, inactivityLabel, futureOrderCount, labelable, createdAt) VALUES ${placeholders} ON DUPLICATE KEY UPDATE runId=VALUES(runId), provenanceId=VALUES(provenanceId), horizonEndAt=VALUES(horizonEndAt), inactivityLabel=VALUES(inactivityLabel), futureOrderCount=VALUES(futureOrderCount), labelable=VALUES(labelable)`,
    values
  );
}

export async function generateBehaviorLabels(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!Number.isInteger(INGESTION_RUN_ID))
    throw new Error("FEATURE_INGESTION_RUN_ID must be an integer");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [snapshots] = await connection.query<SnapshotRow[]>(
      `SELECT s.id AS snapshotId, s.runId, s.provenanceId, s.customerId, s.cutoffAt,
        DATE_ADD(s.cutoffAt, INTERVAL r.horizonDays DAY) AS horizonEndAt,
        r.horizonDays,
        (SELECT COUNT(*) FROM orders future
          WHERE future.customerId = s.customerId
            AND future.ingestionRunId = ?
            AND future.invoiceDate > s.cutoffAt
            AND future.invoiceDate <= DATE_ADD(s.cutoffAt, INTERVAL r.horizonDays DAY)) AS futureOrderCount
       FROM customer_feature_snapshots s
       JOIN customer_feature_runs r ON r.id = s.runId
       WHERE s.featureVersion = ?
       ORDER BY s.cutoffAt, s.customerId, s.id`,
      [INGESTION_RUN_ID, FEATURE_VERSION]
    );
    let batch: SnapshotRow[] = [];
    for (const snapshot of snapshots) {
      batch.push(snapshot);
      if (batch.length >= BATCH_SIZE) {
        await insertBatch(connection, batch);
        batch = [];
      }
    }
    await insertBatch(connection, batch);
    const [summary] = await connection.query<DbRow[]>(
      `SELECT COUNT(*) AS labeledSnapshots,
        SUM(CASE WHEN inactivityLabel = 1 THEN 1 ELSE 0 END) AS positiveInactivity,
        SUM(CASE WHEN inactivityLabel = 0 THEN 1 ELSE 0 END) AS negativeInactivity,
        MIN(cutoffAt) AS minCutoffAt,
        MAX(cutoffAt) AS maxCutoffAt
       FROM customer_behavior_labels WHERE labelVersion = ?`,
      [LABEL_VERSION]
    );
    console.log(
      JSON.stringify(
        {
          status: "generated",
          labelVersion: LABEL_VERSION,
          featureVersion: FEATURE_VERSION,
          ingestionRunId: INGESTION_RUN_ID,
          sourceSnapshots: snapshots.length,
          labeledSnapshots: Number(summary[0]?.labeledSnapshots ?? 0),
          positiveInactivity: Number(summary[0]?.positiveInactivity ?? 0),
          negativeInactivity: Number(summary[0]?.negativeInactivity ?? 0),
          minCutoffAt: summary[0]?.minCutoffAt,
          maxCutoffAt: summary[0]?.maxCutoffAt,
        },
        null,
        2
      )
    );
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith("generate_behavior_labels.ts")) {
  generateBehaviorLabels().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
