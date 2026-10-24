import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  buildRecommendation,
  percentileRanks,
  RATIONALE_VERSION,
  RECOMMENDATION_METHODOLOGY_VERSION,
  type ShapSignal,
} from "./retention_recommendations";

const MODEL_RUN_ID = Number(process.env.RECOMMENDATION_MODEL_RUN_ID ?? "1");
const BATCH_SIZE = Math.min(
  250,
  Math.max(50, Number(process.env.RECOMMENDATION_BATCH_SIZE ?? "250"))
);
const VALUE_METHODOLOGY_VERSION = "behavioral-clv-v1";
const FEATURE_VERSION = "phase4-rfm-behavioral-v1";

type DbRow = RowDataPacket & Record<string, unknown>;
type Candidate = DbRow & {
  customerId: number;
  snapshotId: number;
  explanationId: number;
  explanationRunId: number;
  valueRunId: number;
  modelRunId: number;
  cutoffAt: Date;
  featureVersion: string;
  calibratedChurnProbability: string;
  behavioralClv: string;
  revenueAtRisk: string;
  expectedFutureValue: string;
  historicalNetRevenue: string;
  orderCount: number;
  purchaseFrequency: string;
  inactiveDays: number;
  returnRate: string;
  cancellationRate: string;
  topShapFeatureName?: string;
  topShapFeatureValue?: string;
  topShapValue?: string;
  topShapDirection?: string;
  topShapRank?: number;
  topShapMissing?: number;
};

function number(value: unknown, name: string): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be finite`);
  return result;
}

function requiredEnv(): string {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!Number.isInteger(MODEL_RUN_ID) || MODEL_RUN_ID < 1)
    throw new Error("RECOMMENDATION_MODEL_RUN_ID must be a positive integer");
  return process.env.DATABASE_URL;
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

async function getCandidates(
  connection: mysql.Connection,
  explanationRunId: number,
  valueRunId: number
): Promise<Candidate[]> {
  const [rows] = await connection.query<Candidate[]>(
    `SELECT v.customerId, v.snapshotId, v.modelRunId, v.cutoffAt,
      v.featureVersion, v.calibratedChurnProbability, v.behavioralClv,
      v.revenueAtRisk, v.expectedFutureValue, v.historicalNetRevenue,
      v.orderCount, v.purchaseFrequency, s.inactiveDays, s.returnRate,
      s.cancellationRate, e.id AS explanationId, e.explanationRunId,
      f.featureName AS topShapFeatureName, f.featureValue AS topShapFeatureValue,
      f.shapValue AS topShapValue, f.contributionDirection AS topShapDirection,
      f.rank AS topShapRank, f.isMissing AS topShapMissing
     FROM customer_value_snapshots v
     JOIN customer_feature_snapshots s ON s.id = v.snapshotId
     JOIN customer_explanations e
       ON e.snapshotId = v.snapshotId AND e.modelRunId = v.modelRunId
      AND e.explanationRunId = ?
     LEFT JOIN (
       SELECT e2.customerId, e2.snapshotId, f2.featureName, f2.featureValue,
         f2.shapValue, f2.contributionDirection, f2.\`rank\`, f2.isMissing
       FROM customer_explanations e2
       JOIN customer_explanation_features f2 ON f2.explanationId = e2.id
       WHERE e2.explanationRunId = ? AND f2.shapValue > 0
       ORDER BY e2.customerId, f2.shapValue DESC, f2.rank ASC
     ) f ON f.snapshotId = v.snapshotId
     WHERE v.runId = ? AND v.modelRunId = ? AND v.featureVersion = ?
     ORDER BY v.customerId, f.shapValue DESC, f.rank ASC`,
    [
      explanationRunId,
      explanationRunId,
      valueRunId,
      MODEL_RUN_ID,
      FEATURE_VERSION,
    ]
  );
  const firstByCustomer = new Map<number, Candidate>();
  for (const row of rows) {
    const customerId = number(row.customerId, "customerId");
    if (!firstByCustomer.has(customerId)) firstByCustomer.set(customerId, row);
  }
  return Array.from(firstByCustomer.values()).sort(
    (left, right) =>
      number(left.customerId, "customerId") -
      number(right.customerId, "customerId")
  );
}

async function ensureRun(
  connection: mysql.Connection,
  sourceSha256: string,
  provenanceId: number,
  explanationRunId: number,
  valueRunId: number,
  cutoffAt: Date
): Promise<number> {
  const runKey = `phase8:${sourceSha256}:${MODEL_RUN_ID}:${explanationRunId}:${valueRunId}:${FEATURE_VERSION}:${RECOMMENDATION_METHODOLOGY_VERSION}`;
  await connection.query(
    `INSERT INTO retention_recommendation_runs
      (runKey, provenanceId, modelRunId, explanationRunId, valueRunId, featureVersion, cutoffAt, methodologyVersion, rationaleVersion, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), status=VALUES(status)`,
    [
      runKey,
      provenanceId,
      MODEL_RUN_ID,
      explanationRunId,
      valueRunId,
      FEATURE_VERSION,
      cutoffAt,
      RECOMMENDATION_METHODOLOGY_VERSION,
      RATIONALE_VERSION,
    ]
  );
  const row = await one(
    connection,
    "SELECT id FROM retention_recommendation_runs WHERE runKey = ? LIMIT 1",
    [runKey]
  );
  return number(row.id, "recommendationRunId");
}

function shapSignal(row: Candidate): ShapSignal | undefined {
  if (!row.topShapFeatureName || row.topShapValue === undefined)
    return undefined;
  return {
    featureName: String(row.topShapFeatureName),
    featureValue: number(row.topShapFeatureValue ?? 0, "topShapFeatureValue"),
    shapValue: number(row.topShapValue, "topShapValue"),
    contributionDirection: String(row.topShapDirection ?? "increases_risk"),
    rank: number(row.topShapRank ?? 1, "topShapRank"),
    isMissing: number(row.topShapMissing ?? 0, "topShapMissing") === 1,
  };
}

async function insertBatch(
  connection: mysql.Connection,
  runId: number,
  explanationRunId: number,
  valueRunId: number,
  candidates: Candidate[],
  riskRanks: Map<number, number>,
  revenueRanks: Map<number, number>,
  valueRanks: Map<number, number>
): Promise<void> {
  const values = candidates.map(row => {
    const customerId = number(row.customerId, "customerId");
    const result = buildRecommendation({
      customerId,
      calibratedChurnProbability: number(
        row.calibratedChurnProbability,
        "calibratedChurnProbability"
      ),
      behavioralClv: number(row.behavioralClv, "behavioralClv"),
      revenueAtRisk: number(row.revenueAtRisk, "revenueAtRisk"),
      expectedFutureValue: number(
        row.expectedFutureValue,
        "expectedFutureValue"
      ),
      historicalNetRevenue: number(
        row.historicalNetRevenue,
        "historicalNetRevenue"
      ),
      orderCount: number(row.orderCount, "orderCount"),
      purchaseFrequency: number(row.purchaseFrequency, "purchaseFrequency"),
      inactiveDays: number(row.inactiveDays, "inactiveDays"),
      returnRate: number(row.returnRate, "returnRate"),
      cancellationRate: number(row.cancellationRate, "cancellationRate"),
      topShapSignal: shapSignal(row),
      riskRank: riskRanks.get(customerId) ?? 0,
      revenueRiskRank: revenueRanks.get(customerId) ?? 0,
      valueRank: valueRanks.get(customerId) ?? 0,
    });
    return [
      runId,
      customerId,
      row.snapshotId,
      MODEL_RUN_ID,
      explanationRunId,
      row.explanationId,
      valueRunId,
      row.cutoffAt,
      FEATURE_VERSION,
      RECOMMENDATION_METHODOLOGY_VERSION,
      result.priorityScore,
      result.priorityBand,
      result.recommendedAction,
      result.rationale,
      JSON.stringify(result.supportingSignals),
      result.interventionCost,
      result.expectedBenefit,
      result.benefitEvidence,
    ];
  });
  const columns = [
    "runId",
    "customerId",
    "snapshotId",
    "modelRunId",
    "explanationRunId",
    "explanationId",
    "valueRunId",
    "cutoffAt",
    "featureVersion",
    "methodologyVersion",
    "priorityScore",
    "priorityBand",
    "recommendedAction",
    "rationale",
    "supportingSignals",
    "interventionCost",
    "expectedBenefit",
    "benefitEvidence",
  ];
  const placeholders = candidates
    .map(() => `(${columns.map(() => "?").join(",")})`)
    .join(",");
  const updates = columns
    .slice(4)
    .map(column => `${column}=VALUES(${column})`)
    .join(",");
  await connection.query(
    `INSERT INTO customer_retention_recommendations (${columns.join(",")}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
    values.flat()
  );
}

export async function generateRecommendations(): Promise<void> {
  const connection = await mysql.createConnection(requiredEnv());
  try {
    const valueRun = await one(
      connection,
      `SELECT id, provenanceId, modelRunId, featureVersion, cutoffAt
       FROM revenue_intelligence_runs
       WHERE modelRunId = ? AND methodologyVersion = ? AND status = 'completed'
       ORDER BY id DESC LIMIT 1`,
      [MODEL_RUN_ID, VALUE_METHODOLOGY_VERSION]
    );
    const explanationRun = await one(
      connection,
      `SELECT id, modelRunId, featureVersion FROM model_explanation_runs
       WHERE modelRunId = ? AND featureVersion = ? ORDER BY id DESC LIMIT 1`,
      [MODEL_RUN_ID, FEATURE_VERSION]
    );
    const explanationRunId = number(explanationRun.id, "explanationRunId");
    const valueRunId = number(valueRun.id, "valueRunId");
    const candidates = await getCandidates(
      connection,
      explanationRunId,
      valueRunId
    );
    if (candidates.length === 0)
      throw new Error(
        "No aligned value, feature, prediction, and explanation rows found"
      );
    const riskRanksArray = percentileRanks(
      candidates.map(row =>
        number(row.calibratedChurnProbability, "calibratedChurnProbability")
      )
    );
    const revenueRanksArray = percentileRanks(
      candidates.map(row => number(row.revenueAtRisk, "revenueAtRisk"))
    );
    const valueRanksArray = percentileRanks(
      candidates.map(row => number(row.behavioralClv, "behavioralClv"))
    );
    const riskRanks = new Map(
      candidates.map((row, index) => [
        number(row.customerId, "customerId"),
        riskRanksArray[index],
      ])
    );
    const revenueRanks = new Map(
      candidates.map((row, index) => [
        number(row.customerId, "customerId"),
        revenueRanksArray[index],
      ])
    );
    const valueRanks = new Map(
      candidates.map((row, index) => [
        number(row.customerId, "customerId"),
        valueRanksArray[index],
      ])
    );
    const provenanceId = number(valueRun.provenanceId, "provenanceId");
    const source = await one(
      connection,
      "SELECT sourceSha256 FROM data_provenance WHERE id = ? LIMIT 1",
      [provenanceId]
    );
    const runId = await ensureRun(
      connection,
      String(source.sourceSha256),
      provenanceId,
      explanationRunId,
      valueRunId,
      new Date(valueRun.cutoffAt)
    );
    for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
      await insertBatch(
        connection,
        runId,
        explanationRunId,
        valueRunId,
        candidates.slice(offset, offset + BATCH_SIZE),
        riskRanks,
        revenueRanks,
        valueRanks
      );
      if (offset % (BATCH_SIZE * 10) === 0)
        console.log(
          JSON.stringify({
            status: "progress",
            runId,
            processed: Math.min(offset + BATCH_SIZE, candidates.length),
            total: candidates.length,
          })
        );
    }
    const summary = await one(
      connection,
      `SELECT COUNT(*) AS recommendationCount,
        SUM(priorityBand='Urgent') AS urgentCount,
        SUM(priorityBand='High') AS highCount,
        SUM(priorityBand='Monitor') AS monitorCount,
        COUNT(DISTINCT customerId) AS customerCount
       FROM customer_retention_recommendations WHERE runId = ?`,
      [runId]
    );
    console.log(
      JSON.stringify(
        {
          status: "completed",
          runId,
          provenanceId,
          modelRunId: MODEL_RUN_ID,
          explanationRunId,
          valueRunId,
          featureVersion: FEATURE_VERSION,
          methodologyVersion: RECOMMENDATION_METHODOLOGY_VERSION,
          rationaleVersion: RATIONALE_VERSION,
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

if (process.argv[1]?.endsWith("generate_retention_recommendations.ts")) {
  generateRecommendations().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
