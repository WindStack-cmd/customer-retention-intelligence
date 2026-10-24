import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql, { type RowDataPacket } from "mysql2/promise";

const LABEL_VERSION =
  process.env.LABEL_VERSION ?? "behavioral-inactivity-30d-v1";
const FEATURE_VERSION =
  process.env.FEATURE_VERSION ?? "phase4-rfm-behavioral-v1";
const RUN_KEY_PREFIX = "phase5:";

type DbRow = RowDataPacket & Record<string, unknown>;

function asNumber(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error(`Invalid database number: ${String(value)}`);
  return number;
}

async function scalar(
  connection: mysql.Connection,
  query: string,
  parameters: unknown[] = []
): Promise<number> {
  const [rows] = await connection.query<DbRow[]>(query, parameters);
  return asNumber(rows[0]?.value ?? 0);
}

async function sha256File(path: string): Promise<string> {
  const digest = createHash("sha256");
  const content = await readFile(path);
  digest.update(content);
  return digest.digest("hex");
}

export async function verifyPhase5Model(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [runs] = await connection.query<DbRow[]>(
      `SELECT id, runKey, featureVersion, labelVersion, threshold, status, artifactPath, artifactSha256, configJson
       FROM churn_model_runs WHERE runKey LIKE ? ORDER BY id DESC LIMIT 1`,
      [`${RUN_KEY_PREFIX}%`]
    );
    if (!runs[0]) throw new Error("No Phase 5 model run found");
    const run = runs[0];
    const modelRunId = asNumber(run.id);
    if (
      String(run.featureVersion) !== FEATURE_VERSION ||
      String(run.labelVersion) !== LABEL_VERSION
    )
      throw new Error(
        "Model run versions do not match expected Phase 5 versions"
      );
    if (String(run.status) !== "completed")
      throw new Error(`Model run status is ${String(run.status)}`);
    const config = JSON.parse(String(run.configJson)) as {
      splits?: Array<{ name: string; rowCount: number }>;
      featureColumns?: string[];
    };
    if (!config.featureColumns?.length)
      throw new Error("Persisted model config has no feature list");
    const [
      artifactSha256,
      predictionCount,
      distinctSnapshots,
      duplicatePredictions,
      probabilityViolations,
      labelCount,
      duplicateLabels,
      sourceSnapshotCount,
      missingPredictionSnapshots,
      orphanPredictions,
      metricCount,
      runKeyCount,
    ] = await Promise.all([
      sha256File(String(run.artifactPath)),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM churn_predictions WHERE modelRunId = ?",
        [modelRunId]
      ),
      scalar(
        connection,
        "SELECT COUNT(DISTINCT snapshotId) AS value FROM churn_predictions WHERE modelRunId = ?",
        [modelRunId]
      ),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM (SELECT snapshotId FROM churn_predictions WHERE modelRunId = ? GROUP BY snapshotId HAVING COUNT(*) > 1) duplicates",
        [modelRunId]
      ),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM churn_predictions WHERE modelRunId = ? AND (rawProbability < 0 OR rawProbability > 1 OR calibratedProbability < 0 OR calibratedProbability > 1)",
        [modelRunId]
      ),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM customer_behavior_labels WHERE labelVersion = ?",
        [LABEL_VERSION]
      ),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM (SELECT snapshotId FROM customer_behavior_labels WHERE labelVersion = ? GROUP BY snapshotId HAVING COUNT(*) > 1) duplicates",
        [LABEL_VERSION]
      ),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM customer_feature_snapshots WHERE featureVersion = ?",
        [FEATURE_VERSION]
      ),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM customer_feature_snapshots s JOIN customer_behavior_labels l ON l.snapshotId = s.id AND l.labelVersion = ? LEFT JOIN churn_predictions p ON p.snapshotId = s.id AND p.modelRunId = ? WHERE s.featureVersion = ? AND p.id IS NULL",
        [LABEL_VERSION, modelRunId, FEATURE_VERSION]
      ),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM churn_predictions p LEFT JOIN customer_feature_snapshots s ON s.id = p.snapshotId WHERE p.modelRunId = ? AND s.id IS NULL",
        [modelRunId]
      ),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM churn_model_metrics WHERE modelRunId = ?",
        [modelRunId]
      ),
      scalar(
        connection,
        "SELECT COUNT(*) AS value FROM churn_model_runs WHERE runKey = ?",
        [run.runKey]
      ),
    ]);
    if (artifactSha256 !== String(run.artifactSha256))
      throw new Error(
        "Persisted model artifact checksum does not match the database"
      );
    if (
      predictionCount !== sourceSnapshotCount ||
      distinctSnapshots !== sourceSnapshotCount
    )
      throw new Error(
        "Prediction coverage does not match labeled feature snapshot coverage"
      );
    if (
      duplicatePredictions !== 0 ||
      duplicateLabels !== 0 ||
      probabilityViolations !== 0 ||
      missingPredictionSnapshots !== 0 ||
      orphanPredictions !== 0 ||
      metricCount === 0 ||
      runKeyCount !== 1
    )
      throw new Error("Phase 5 persistence integrity checks failed");
    const [labelRows] = await connection.query<DbRow[]>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN l.inactivityLabel <> IF((SELECT COUNT(*) FROM orders future WHERE future.customerId=l.customerId AND future.ingestionRunId=30001 AND future.invoiceDate > l.cutoffAt AND future.invoiceDate <= l.horizonEndAt)=0,1,0) THEN 1 ELSE 0 END) AS leakageMismatches
       FROM customer_behavior_labels l WHERE l.labelVersion = ?`,
      [LABEL_VERSION]
    );
    if (asNumber(labelRows[0]?.leakageMismatches) !== 0)
      throw new Error(
        "Behavior labels do not match the post-cutoff outcome window"
      );
    console.log(
      JSON.stringify(
        {
          status: "verified",
          modelRunId,
          modelName: run.modelName,
          featureVersion: run.featureVersion,
          labelVersion: run.labelVersion,
          labeledSnapshots: labelCount,
          sourceFeatureSnapshots: sourceSnapshotCount,
          predictions: predictionCount,
          distinctPredictionSnapshots: distinctSnapshots,
          metrics: metricCount,
          duplicatePredictions,
          duplicateLabels,
          probabilityViolations,
          missingPredictionSnapshots,
          orphanPredictions,
          labelLeakageMismatches: asNumber(labelRows[0]?.leakageMismatches),
          artifactSha256,
          threshold: run.threshold,
          splitMetadata: config.splits,
        },
        null,
        2
      )
    );
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith("verify_phase5_model.ts")) {
  verifyPhase5Model().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
