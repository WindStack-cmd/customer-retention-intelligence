import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  brierPerformance,
  compareNumericFeature,
  missingnessRate,
  type NumericObservation,
} from "./monitoring";

const MONITORING_VERSION = "phase12-monitoring-v1";
const FEATURE_COLUMNS = [
  "daysSinceLastPurchase",
  "totalOrders",
  "purchaseFrequency",
  "totalGrossValue",
  "totalNetValue",
  "averageOrderValue",
  "totalItems",
  "uniqueProducts",
  "inactiveDays",
  "returnRate",
  "cancellationRate",
] as const;

type DbRow = RowDataPacket & Record<string, unknown>;
type StoredMetric = {
  metricType: string;
  metricName: string;
  status: string;
  metricValue: number | null;
  details: string;
};

function requiredDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for monitoring");
  return value;
}

function values(rows: DbRow[], column: string): NumericObservation[] {
  return rows.map(row => {
    const value = Number(row[column]);
    return Number.isFinite(value) ? value : null;
  });
}

async function run(): Promise<void> {
  const connection = await mysql.createConnection(requiredDatabaseUrl());
  try {
    const [cutoffs] = await connection.query<DbRow[]>(
      "SELECT DISTINCT cutoffAt FROM customer_feature_snapshots ORDER BY cutoffAt DESC LIMIT 2"
    );
    if (cutoffs.length === 0) {
      throw new Error("No feature snapshots are available for monitoring");
    }
    const currentCutoff = cutoffs[0]?.cutoffAt;
    const baselineCutoff = cutoffs[1]?.cutoffAt ?? null;
    const selectColumns = FEATURE_COLUMNS.join(", ");
    const [currentRows] = await connection.query<DbRow[]>(
      `SELECT ${selectColumns} FROM customer_feature_snapshots WHERE cutoffAt = ?`,
      [currentCutoff]
    );
    const [baselineRows] = baselineCutoff
      ? await connection.query<DbRow[]>(
          `SELECT ${selectColumns} FROM customer_feature_snapshots WHERE cutoffAt = ?`,
          [baselineCutoff]
        )
      : [[] as DbRow[]];

    const metrics: StoredMetric[] = FEATURE_COLUMNS.flatMap(column => {
      const current = values(currentRows, column);
      const baseline = values(baselineRows, column);
      const drift = baselineCutoff
        ? compareNumericFeature(column, baseline, current)
        : {
            featureName: column,
            baselineCount: 0,
            currentCount: current.length,
            baselineMean: null,
            currentMean: null,
            relativeMeanShift: null,
            status: "unavailable" as const,
          };
      return [
        {
          metricType: "missingness",
          metricName: column,
          status:
            missingnessRate(current) === null ? "unavailable" : "available",
          metricValue: missingnessRate(current),
          details: JSON.stringify({ rowCount: current.length }),
        },
        {
          metricType: "feature_drift",
          metricName: column,
          status: drift.status,
          metricValue: drift.relativeMeanShift,
          details: JSON.stringify(drift),
        },
      ];
    });

    const [predictionRows] = await connection.query<DbRow[]>(
      `SELECT p.calibratedProbability, l.inactivityLabel
       FROM churn_predictions p
       JOIN customer_behavior_labels l ON l.snapshotId = p.snapshotId
       WHERE p.cutoffAt = l.cutoffAt AND p.cutoffAt = ?`,
      [currentCutoff]
    );
    const performance = brierPerformance(
      predictionRows.map(row => Number(row.calibratedProbability)),
      predictionRows.map(row => Number(row.inactivityLabel))
    );
    metrics.push({
      metricType: "outcome_performance",
      metricName: "brier_score",
      status: performance.status,
      metricValue: performance.brierScore,
      details: JSON.stringify(performance),
    });

    const runKey = `${MONITORING_VERSION}:${String(currentCutoff)}:${String(baselineCutoff)}`;
    await connection.query(
      `INSERT INTO monitoring_runs
       (runKey, monitoringVersion, baselineCutoffAt, currentCutoffAt, status, summary)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status=VALUES(status), summary=VALUES(summary)`,
      [
        runKey,
        MONITORING_VERSION,
        baselineCutoff,
        currentCutoff,
        metrics.some(metric => metric.status === "warning")
          ? "WARNING"
          : "RECORDED",
        JSON.stringify({ metricCount: metrics.length, performance }),
      ]
    );
    const [runRows] = await connection.query<DbRow[]>(
      "SELECT id FROM monitoring_runs WHERE runKey = ? LIMIT 1",
      [runKey]
    );
    const runId = Number(runRows[0]?.id);
    if (!runId) throw new Error("Monitoring run could not be created");
    for (const metric of metrics) {
      await connection.query(
        `INSERT INTO monitoring_metrics
         (runId, metricType, metricName, status, metricValue, details)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status=VALUES(status), metricValue=VALUES(metricValue), details=VALUES(details)`,
        [
          runId,
          metric.metricType,
          metric.metricName,
          metric.status,
          metric.metricValue,
          metric.details,
        ]
      );
    }
    console.log(JSON.stringify({ runId, runKey, performance }, null, 2));
  } finally {
    await connection.end();
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : "Monitoring failed");
  process.exitCode = 1;
});
