import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";

const FEATURE_VERSION =
  process.env.FEATURE_VERSION ?? "phase4-rfm-behavioral-v1";
const LABEL_VERSION =
  process.env.LABEL_VERSION ?? "behavioral-inactivity-30d-v1";
const PROVENANCE_ID = Number(process.env.FEATURE_PROVENANCE_ID ?? "30001");
const ARTIFACT_DIR = process.env.PHASE5_ARTIFACT_DIR ?? "artifacts/phase5";
const DATASET_PATH = join(ARTIFACT_DIR, "modeling_dataset.json");
const RESULT_PATH = join(ARTIFACT_DIR, "model_result.json");
const PREDICTION_PATH = join(ARTIFACT_DIR, "predictions.json");
const MODEL_VERSION = "phase5-churn-model-v1";
const PREDICTION_VERSION = "phase5-prediction-v1";
const BATCH_SIZE = 250;

const FEATURE_COLUMNS = [
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
] as const;

type DbRow = RowDataPacket & Record<string, unknown>;
type ModelRow = DbRow & { [key: string]: unknown };
type Metric = {
  split: string;
  metricName: string;
  metricValue: number | null;
  metricJson: string | null;
};
type Prediction = {
  snapshotId: number;
  customerId: number;
  cutoffAt: string;
  rawProbability: number;
  calibratedProbability: number;
  predictedClass: number;
};
type Result = {
  modelName: string;
  modelVersion: string;
  predictionVersion: string;
  featureColumns: string[];
  datasetSha256: string;
  threshold: number;
  artifactPath: string;
  artifactSha256: string;
  comparison: unknown[];
  splits: Array<{
    name: string;
    rowCount: number;
    customerCount: number;
    positiveCount: number;
    negativeCount: number;
    minCutoff: string;
    maxCutoff: string;
  }>;
  metrics: Metric[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asNumber(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error(`Expected numeric value, got ${String(value)}`);
  return number;
}

async function runPythonModel(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "python" : "python3",
      ["pipelines/churn_modeling.py"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PHASE5_DATASET_PATH: DATASET_PATH,
          PHASE5_RESULT_PATH: RESULT_PATH,
          PHASE5_ARTIFACT_DIR: ARTIFACT_DIR,
        },
        stdio: "inherit",
      }
    );
    child.once("error", reject);
    child.once("exit", code =>
      code === 0
        ? resolve()
        : reject(new Error(`Python modeling process exited with code ${code}`))
    );
  });
}

async function getModelRows(connection: mysql.Connection): Promise<ModelRow[]> {
  const selectColumns = FEATURE_COLUMNS.map(column => `s.${column}`).join(", ");
  const [rows] = await connection.query<ModelRow[]>(
    `SELECT s.id AS snapshotId, s.customerId, s.cutoffAt, s.featureVersion, s.provenanceId, s.runId,
      l.labelVersion, l.inactivityLabel, ${selectColumns}
     FROM customer_feature_snapshots s
     JOIN customer_behavior_labels l ON l.snapshotId = s.id
     WHERE s.featureVersion = ? AND l.labelVersion = ? AND l.labelable = 1
     ORDER BY s.cutoffAt, s.customerId, s.id`,
    [FEATURE_VERSION, LABEL_VERSION]
  );
  return rows;
}

async function insertMetrics(
  connection: mysql.Connection,
  modelRunId: number,
  metrics: Metric[],
  comparison: unknown[]
): Promise<void> {
  const allMetrics = [
    ...metrics,
    ...comparison.flatMap((entry: any) => [
      {
        split: "validation",
        metricName: `comparison.${entry.model}.validation_pr_auc`,
        metricValue: entry.validation_pr_auc,
        metricJson: null,
      },
      {
        split: "validation",
        metricName: `comparison.${entry.model}.validation_brier_score`,
        metricValue: entry.validation_brier_score,
        metricJson: null,
      },
    ]),
  ];
  for (let offset = 0; offset < allMetrics.length; offset += BATCH_SIZE) {
    const batch = allMetrics.slice(offset, offset + BATCH_SIZE);
    const placeholders = batch.map(() => "(?,?,?,?,?)").join(",");
    const values = batch.flatMap(metric => [
      modelRunId,
      metric.split,
      metric.metricName,
      metric.metricValue,
      metric.metricJson,
    ]);
    await connection.query(
      `INSERT INTO churn_model_metrics (modelRunId, split, metricName, metricValue, metricJson) VALUES ${placeholders} ON DUPLICATE KEY UPDATE metricValue=VALUES(metricValue), metricJson=VALUES(metricJson)`,
      values
    );
  }
}

async function insertPredictions(
  connection: mysql.Connection,
  modelRunId: number,
  threshold: number,
  predictions: Prediction[]
): Promise<void> {
  for (let offset = 0; offset < predictions.length; offset += BATCH_SIZE) {
    const batch = predictions.slice(offset, offset + BATCH_SIZE);
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?)").join(",");
    const values = batch.flatMap(prediction => [
      modelRunId,
      prediction.snapshotId,
      prediction.customerId,
      new Date(prediction.cutoffAt),
      prediction.rawProbability,
      prediction.calibratedProbability,
      prediction.predictedClass,
      threshold,
      PREDICTION_VERSION,
      new Date(prediction.cutoffAt),
    ]);
    await connection.query(
      `INSERT INTO churn_predictions (modelRunId, snapshotId, customerId, cutoffAt, rawProbability, calibratedProbability, predictedClass, threshold, predictionVersion, createdAt) VALUES ${placeholders} ON DUPLICATE KEY UPDATE rawProbability=VALUES(rawProbability), calibratedProbability=VALUES(calibratedProbability), predictedClass=VALUES(predictedClass), threshold=VALUES(threshold), predictionVersion=VALUES(predictionVersion)`,
      values
    );
  }
}

export async function runPhase5Model(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!Number.isInteger(PROVENANCE_ID))
    throw new Error("FEATURE_PROVENANCE_ID must be an integer");
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const rows = await getModelRows(connection);
    if (rows.length === 0)
      throw new Error("No labeled Phase 5 modeling rows found");
    await writeFile(DATASET_PATH, JSON.stringify(rows), "utf8");
    const datasetSha256 = sha256(await readFile(DATASET_PATH, "utf8"));
    await runPythonModel();
    const result = JSON.parse(await readFile(RESULT_PATH, "utf8")) as Result;
    const predictions = JSON.parse(
      await readFile(PREDICTION_PATH, "utf8")
    ) as Prediction[];
    if (result.datasetSha256 !== datasetSha256)
      throw new Error(
        "Model result dataset checksum does not match exported dataset"
      );
    if (result.featureColumns.join(",") !== FEATURE_COLUMNS.join(","))
      throw new Error(
        "Model feature ordering does not match orchestrator feature ordering"
      );
    for (const prediction of predictions) {
      if (
        prediction.rawProbability < 0 ||
        prediction.rawProbability > 1 ||
        prediction.calibratedProbability < 0 ||
        prediction.calibratedProbability > 1
      )
        throw new Error("Prediction probability outside [0,1]");
    }
    const splitByName = new Map(
      result.splits.map(split => [split.name, split])
    );
    const train = splitByName.get("train");
    const validation = splitByName.get("validation");
    const test = splitByName.get("test");
    if (!train || !validation || !test)
      throw new Error("Model result is missing temporal split metadata");
    const config = {
      featureColumns: FEATURE_COLUMNS,
      labelVersion: LABEL_VERSION,
      modelName: result.modelName,
      modelVersion: result.modelVersion,
      predictionVersion: result.predictionVersion,
      datasetSha256,
      threshold: result.threshold,
      comparison: result.comparison,
      splits: result.splits,
      calibration: { method: "platt_sigmoid", cutoff: "2011-09-30" },
      thresholdSelection: {
        cutoff: "2011-10-31",
        candidates: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
        criterion: "validation_f1_then_precision_then_lower_threshold",
      },
    };
    const runKey = `phase5:${datasetSha256}:${MODEL_VERSION}:${FEATURE_VERSION}:${LABEL_VERSION}:seed42`;
    await connection.query(
      `INSERT INTO churn_model_runs (runKey, modelName, modelVersion, featureVersion, labelVersion, datasetVersion, provenanceId, trainStartAt, trainEndAt, validationStartAt, validationEndAt, testStartAt, testEndAt, threshold, status, configJson, artifactPath, artifactSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), threshold=VALUES(threshold), status=VALUES(status), configJson=VALUES(configJson), artifactPath=VALUES(artifactPath), artifactSha256=VALUES(artifactSha256)`,
      [
        runKey,
        result.modelName,
        MODEL_VERSION,
        FEATURE_VERSION,
        LABEL_VERSION,
        datasetSha256,
        PROVENANCE_ID,
        new Date(train.minCutoff),
        new Date(train.maxCutoff),
        new Date(validation.minCutoff),
        new Date(validation.maxCutoff),
        new Date(test.minCutoff),
        new Date(test.maxCutoff),
        result.threshold,
        "completed",
        JSON.stringify(config),
        result.artifactPath,
        result.artifactSha256,
      ]
    );
    const [runRows] = await connection.query<DbRow[]>(
      "SELECT id FROM churn_model_runs WHERE runKey = ? LIMIT 1",
      [runKey]
    );
    const modelRunId = asNumber(runRows[0]?.id);
    await insertMetrics(
      connection,
      modelRunId,
      result.metrics,
      result.comparison
    );
    await insertPredictions(
      connection,
      modelRunId,
      result.threshold,
      predictions
    );
    const [summary] = await connection.query<DbRow[]>(
      "SELECT COUNT(*) AS predictionCount, COUNT(DISTINCT snapshotId) AS snapshotCount FROM churn_predictions WHERE modelRunId = ?",
      [modelRunId]
    );
    console.log(
      JSON.stringify(
        {
          status: "completed",
          modelRunId,
          runKey,
          modelName: result.modelName,
          datasetSha256,
          modelingRows: rows.length,
          predictions: Number(summary[0]?.predictionCount ?? 0),
          distinctPredictionSnapshots: Number(summary[0]?.snapshotCount ?? 0),
          threshold: result.threshold,
          artifactPath: result.artifactPath,
          artifactSha256: result.artifactSha256,
          splits: result.splits,
        },
        null,
        2
      )
    );
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith("run_phase5_model.ts")) {
  runPhase5Model().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
