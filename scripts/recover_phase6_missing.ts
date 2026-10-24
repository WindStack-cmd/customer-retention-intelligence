import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { join } from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";

const MODEL_RUN_ID = 1;
const FEATURE_VERSION = "phase4-rfm-behavioral-v1";
const ARTIFACT_DIR =
  process.env.PHASE6_RECOVERY_DIR ?? "artifacts/phase6-recovery";
const INPUT_PATH = join(ARTIFACT_DIR, "recovery_input.json");
const OUTPUT_DIR = join(ARTIFACT_DIR, "recovery");
const SUMMARY_PATH = join(OUTPUT_DIR, "recovery_summary.json");
const FEATURES_PATH = join(OUTPUT_DIR, "missing_features.ndjson");
const EXPECTED_FEATURES = [
  "daysSinceLastPurchase",
  "totalOrders",
  "purchaseFrequency",
  "totalGrossValue",
  "totalNetValue",
  "averageOrderValue",
  "totalItems",
  "averageItemsPerOrder",
  "uniqueProducts",
  "activeMonths",
  "purchaseCount",
  "averageQuantityPerOrder",
  "averageDaysBetweenOrders",
  "purchaseIntervalVariance",
  "customerLifetimeDays",
  "inactiveDays",
  "returnCount",
  "returnQuantity",
  "returnValue",
  "returnRate",
  "cancellationCount",
  "cancellationRate",
  "productDiversity",
  "purchasesLast7d",
  "purchasesLast30d",
  "purchasesLast60d",
  "purchasesLast90d",
  "spendLast30d",
  "spendLast60d",
  "spendLast90d",
  "ordersLast30d",
  "ordersLast60d",
  "ordersLast90d",
  "recentVsPreviousOrderRate",
  "recentVsPreviousSpend",
  "recentVsPreviousQuantity",
  "customerAgeAtCutoff",
];
const BATCH_SIZE = Math.min(
  1000,
  Math.max(50, Number(process.env.PHASE6_RECOVERY_BATCH_SIZE ?? "1000"))
);
type DbRow = RowDataPacket & Record<string, unknown>;
type RecoveryRow = DbRow & { existingFeatures: string | null };
type FeatureRow = {
  explanationId: number;
  featureName: string;
  featureValue: number;
  isMissing: number;
  shapValue: number;
  contributionDirection: string;
  rank: number;
};

function asNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n))
    throw new Error(`Expected finite number, got ${String(value)}`);
  return n;
}

async function runRecoveryPython(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "python" : "python3",
      ["pipelines/recover_missing_shap.py"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PHASE6_RECOVERY_INPUT: INPUT_PATH,
          PHASE6_RECOVERY_OUTPUT_DIR: OUTPUT_DIR,
        },
        stdio: "inherit",
      }
    );
    child.once("error", reject);
    child.once("exit", code =>
      code === 0
        ? resolve()
        : reject(new Error(`Targeted SHAP recovery exited with code ${code}`))
    );
  });
}

async function exportMissingRows(
  connection: mysql.Connection
): Promise<{ rows: RecoveryRow[]; missingKeys: number }> {
  const [rows] = await connection.query<RecoveryRow[]>(
    `SELECT ce.id AS explanationId, ce.modelRunId, ce.snapshotId, ce.customerId, ce.cutoffAt,
      p.rawProbability, p.calibratedProbability, p.predictedClass, s.featureVersion,
      s.daysSinceLastPurchase, s.totalOrders, s.purchaseFrequency, s.totalGrossValue,
      s.totalNetValue, s.averageOrderValue, s.totalItems, s.averageItemsPerOrder,
      s.uniqueProducts, s.activeMonths, s.purchaseCount, s.averageQuantityPerOrder,
      s.averageDaysBetweenOrders, s.purchaseIntervalVariance, s.customerLifetimeDays,
      s.inactiveDays, s.returnCount, s.returnQuantity, s.returnValue, s.returnRate,
      s.cancellationCount, s.cancellationRate, s.productDiversity, s.purchasesLast7d,
      s.purchasesLast30d, s.purchasesLast60d, s.purchasesLast90d, s.spendLast30d,
      s.spendLast60d, s.spendLast90d, s.ordersLast30d, s.ordersLast60d, s.ordersLast90d,
      s.recentVsPreviousOrderRate, s.recentVsPreviousSpend, s.recentVsPreviousQuantity,
      s.customerAgeAtCutoff, l.inactivityLabel,
      GROUP_CONCAT(cef.featureName ORDER BY cef.featureName SEPARATOR ',') AS existingFeatures
     FROM customer_explanations ce
     JOIN churn_predictions p ON p.modelRunId = ce.modelRunId AND p.snapshotId = ce.snapshotId
     JOIN customer_feature_snapshots s ON s.id = ce.snapshotId
     JOIN customer_behavior_labels l ON l.snapshotId = ce.snapshotId AND l.labelable = 1
     LEFT JOIN customer_explanation_features cef ON cef.explanationId = ce.id
     WHERE ce.explanationRunId = ? AND ce.modelRunId = ? AND s.featureVersion = ?
     GROUP BY ce.id, ce.modelRunId, ce.snapshotId, ce.customerId, ce.cutoffAt,
       p.rawProbability, p.calibratedProbability, p.predictedClass, s.featureVersion,
       s.daysSinceLastPurchase, s.totalOrders, s.purchaseFrequency, s.totalGrossValue,
       s.totalNetValue, s.averageOrderValue, s.totalItems, s.averageItemsPerOrder,
       s.uniqueProducts, s.activeMonths, s.purchaseCount, s.averageQuantityPerOrder,
       s.averageDaysBetweenOrders, s.purchaseIntervalVariance, s.customerLifetimeDays,
       s.inactiveDays, s.returnCount, s.returnQuantity, s.returnValue, s.returnRate,
       s.cancellationCount, s.cancellationRate, s.productDiversity, s.purchasesLast7d,
       s.purchasesLast30d, s.purchasesLast60d, s.purchasesLast90d, s.spendLast30d,
       s.spendLast60d, s.spendLast90d, s.ordersLast30d, s.ordersLast60d, s.ordersLast90d,
       s.recentVsPreviousOrderRate, s.recentVsPreviousSpend, s.recentVsPreviousQuantity,
       s.customerAgeAtCutoff, l.inactivityLabel
     ORDER BY ce.id`,
    [1, MODEL_RUN_ID, FEATURE_VERSION]
  );
  const shaped = rows.map(row => {
    const existing = new Set(
      String(row.existingFeatures ?? "")
        .split(",")
        .filter(Boolean)
    );
    const missingFeatureNames = EXPECTED_FEATURES.filter(
      feature => !existing.has(feature)
    );
    if (
      Number(row.modelRunId) !== MODEL_RUN_ID ||
      String(row.featureVersion) !== FEATURE_VERSION
    )
      throw new Error("Recovery row provenance mismatch");
    return { ...row, missingFeatureNames };
  });
  return {
    rows: shaped,
    missingKeys: shaped.reduce(
      (sum, row) => sum + row.missingFeatureNames.length,
      0
    ),
  };
}

async function persistMissingFeatures(
  connection: mysql.Connection
): Promise<number> {
  const input = createInterface({
    input: createReadStream(FEATURES_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let batch: FeatureRow[] = [];
  let written = 0;
  let batches = 0;
  const flush = async () => {
    if (!batch.length) return;
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?)").join(",");
    const values = batch.flatMap(row => [
      row.explanationId,
      row.featureName,
      row.featureValue,
      row.isMissing,
      row.shapValue,
      row.contributionDirection,
      row.rank,
    ]);
    await connection.query(
      `INSERT IGNORE INTO customer_explanation_features (explanationId, featureName, featureValue, isMissing, shapValue, contributionDirection, \`rank\`) VALUES ${placeholders}`,
      values
    );
    written += batch.length;
    batches += 1;
    if (batches % 25 === 0)
      console.log(
        JSON.stringify({
          status: "progress",
          batches,
          written,
          remaining: 456700 - written,
        })
      );
    batch = [];
  };
  for await (const line of input) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line) as FeatureRow);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return written;
}

async function verify(connection: mysql.Connection) {
  const [rows] = await connection.query<DbRow[]>(
    `SELECT
      (SELECT COUNT(*) FROM model_explanation_runs WHERE id = 1) AS runs,
      (SELECT COUNT(*) FROM customer_explanations WHERE explanationRunId = 1) AS explanations,
      (SELECT COUNT(*) FROM customer_explanation_features cef JOIN customer_explanations ce ON ce.id = cef.explanationId WHERE ce.explanationRunId = 1) AS attributions,
      (SELECT COUNT(*) FROM (SELECT explanationId, featureName, COUNT(*) c FROM customer_explanation_features GROUP BY explanationId, featureName HAVING c > 1) d) AS duplicates,
      (SELECT COUNT(*) FROM customer_explanation_features cef LEFT JOIN customer_explanations ce ON ce.id = cef.explanationId WHERE ce.id IS NULL) AS orphanAttributions,
      (SELECT COUNT(*) FROM customer_explanations ce LEFT JOIN churn_predictions p ON p.modelRunId = ce.modelRunId AND p.snapshotId = ce.snapshotId WHERE ce.explanationRunId = 1 AND p.id IS NULL) AS missingPredictions,
      (SELECT COUNT(*) FROM customer_explanations ce JOIN customer_feature_snapshots s ON s.id = ce.snapshotId WHERE ce.explanationRunId = 1 AND (ce.modelRunId <> 1 OR s.featureVersion <> ? OR ce.cutoffAt <> s.cutoffAt)) AS alignmentFailures`,
    [FEATURE_VERSION]
  );
  return rows[0];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const before = await verify(connection);
    const exported = await exportMissingRows(connection);
    if (exported.missingKeys !== 456700)
      throw new Error(
        `Expected 456700 missing keys, found ${exported.missingKeys}`
      );
    await writeFile(INPUT_PATH, JSON.stringify(exported.rows), "utf8");
    await runRecoveryPython();
    const recoverySummary = JSON.parse(
      await readFile(SUMMARY_PATH, "utf8")
    ) as {
      writtenKeyCount: number;
      maxAdditivityError: number;
      maxRawPredictionDifference: number;
      maxCalibratedPredictionDifference: number;
    };
    if (recoverySummary.writtenKeyCount !== exported.missingKeys)
      throw new Error(
        `Recovery emitted ${recoverySummary.writtenKeyCount} keys, expected ${exported.missingKeys}`
      );
    const inserted = await persistMissingFeatures(connection);
    const after = await verify(connection);
    console.log(
      JSON.stringify(
        {
          status: "completed",
          before,
          incompleteExplanations: exported.rows.length,
          missingKeys: exported.missingKeys,
          emittedKeys: recoverySummary.writtenKeyCount,
          insertAttemptRows: inserted,
          recoverySummary,
          after,
          expectedAttributions: 984200,
        },
        null,
        2
      )
    );
    if (
      Number(after.attributions) !== 984200 ||
      Number(after.explanations) !== 26600 ||
      Number(after.runs) !== 1 ||
      Number(after.duplicates) !== 0 ||
      Number(after.orphanAttributions) !== 0 ||
      Number(after.missingPredictions) !== 0 ||
      Number(after.alignmentFailures) !== 0
    )
      throw new Error("Targeted Phase 6 recovery verification failed");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
