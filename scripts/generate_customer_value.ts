import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  calculateCustomerValue,
  CUSTOMER_VALUE_HORIZON_DAYS,
  CUSTOMER_VALUE_METHODOLOGY_VERSION,
} from "./customer_value";

const MODEL_RUN_ID = Number(process.env.CUSTOMER_VALUE_MODEL_RUN_ID ?? "1");
const FEATURE_VERSION =
  process.env.CUSTOMER_VALUE_FEATURE_VERSION ?? "phase4-rfm-behavioral-v1";
const HORIZON_DAYS = Number(
  process.env.CUSTOMER_VALUE_HORIZON_DAYS ?? CUSTOMER_VALUE_HORIZON_DAYS
);
const BATCH_SIZE = Math.min(
  250,
  Math.max(50, Number(process.env.CUSTOMER_VALUE_BATCH_SIZE ?? "250"))
);
const PROVENANCE_ID = Number(process.env.CUSTOMER_VALUE_PROVENANCE_ID ?? "0");

type DbRow = RowDataPacket & Record<string, unknown>;
type CandidateRow = DbRow & {
  snapshotId: number;
  customerId: number;
  modelRunId: number;
  cutoffAt: Date;
  featureVersion: string;
  calibratedChurnProbability: string;
  historicalGrossRevenue: string;
  historicalNetRevenue: string;
  returnValue: string;
  orderCount: number;
  averageOrderValue: string;
  purchaseFrequency: string;
  lifetimeActivityDays: number;
};

const REVENUE_SEMANTICS = JSON.stringify({
  grossRevenue:
    "Phase 4 totalGrossValue: positive line revenue only, before returns/cancellations",
  netRevenue:
    "Phase 4 totalNetValue: signed line revenue including negative quantities and cancellations",
  returnValue:
    "Phase 4 returnValue: signed non-positive value from return/cancellation items",
  negativeQuantities:
    "Preserved as returns; excluded from gross revenue and included in signed net revenue",
  missingCustomerId:
    "Excluded from customer-linked features and customer value; retained in source provenance/reconciliation",
  expectedFutureValue:
    "Observed net average order value times observed orders-per-30-day-month times the 90-day horizon",
  revenueAtRisk:
    "Expected future value multiplied by the selected Phase 5 calibrated churn probability",
  behavioralClv:
    "Historical signed net revenue plus expected future value weighted by one minus calibrated churn probability",
  contractualClaim: false,
});

function requiredEnv(): string {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!Number.isInteger(MODEL_RUN_ID) || MODEL_RUN_ID < 1)
    throw new Error("CUSTOMER_VALUE_MODEL_RUN_ID must be a positive integer");
  if (!Number.isInteger(HORIZON_DAYS) || HORIZON_DAYS < 1 || HORIZON_DAYS > 365)
    throw new Error(
      "CUSTOMER_VALUE_HORIZON_DAYS must be an integer from 1 to 365"
    );
  return process.env.DATABASE_URL;
}

function asNumber(value: unknown, name: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be finite`);
  return number;
}

async function getCandidates(
  connection: mysql.Connection
): Promise<CandidateRow[]> {
  const [rows] = await connection.query<CandidateRow[]>(
    `SELECT s.id AS snapshotId, s.customerId, p.modelRunId, s.cutoffAt,
      s.featureVersion, p.calibratedProbability AS calibratedChurnProbability,
      s.totalGrossValue AS historicalGrossRevenue,
      s.totalNetValue AS historicalNetRevenue,
      s.returnValue, s.totalOrders AS orderCount,
      s.averageOrderValue, s.purchaseFrequency,
      s.customerLifetimeDays AS lifetimeActivityDays
     FROM customer_feature_snapshots s
     JOIN churn_predictions p
       ON p.snapshotId = s.id AND p.modelRunId = ?
     WHERE s.featureVersion = ?
     ORDER BY s.customerId, s.cutoffAt DESC, s.id DESC`,
    [MODEL_RUN_ID, FEATURE_VERSION]
  );
  const latestByCustomer = new Map<number, CandidateRow>();
  for (const row of rows) {
    const customerId = asNumber(row.customerId, "customerId");
    if (!latestByCustomer.has(customerId))
      latestByCustomer.set(customerId, row);
  }
  return Array.from(latestByCustomer.values()).sort(
    (left, right) =>
      asNumber(left.customerId, "customerId") -
      asNumber(right.customerId, "customerId")
  );
}

async function getModelRun(
  connection: mysql.Connection
): Promise<{ provenanceId: number; featureVersion: string }> {
  const [rows] = await connection.query<DbRow[]>(
    "SELECT provenanceId, featureVersion FROM churn_model_runs WHERE id = ? AND status = 'completed' LIMIT 1",
    [MODEL_RUN_ID]
  );
  if (!rows[0])
    throw new Error(`Completed model run ${MODEL_RUN_ID} was not found`);
  const featureVersion = String(rows[0].featureVersion);
  if (featureVersion !== FEATURE_VERSION)
    throw new Error(
      `Model feature version ${featureVersion} does not match ${FEATURE_VERSION}`
    );
  return {
    provenanceId: asNumber(rows[0].provenanceId, "provenanceId"),
    featureVersion,
  };
}

async function ensureRun(
  connection: mysql.Connection,
  sourceSha256: string,
  provenanceId: number,
  cutoffAt: Date
): Promise<number> {
  const runKey = `phase7:${sourceSha256}:${MODEL_RUN_ID}:${FEATURE_VERSION}:${cutoffAt.toISOString()}:${CUSTOMER_VALUE_METHODOLOGY_VERSION}:${HORIZON_DAYS}`;
  await connection.query(
    `INSERT INTO revenue_intelligence_runs (runKey, provenanceId, modelRunId, featureVersion, cutoffAt, horizonDays, methodologyVersion, revenueSemantics, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed')
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), status=VALUES(status), revenueSemantics=VALUES(revenueSemantics)`,
    [
      runKey,
      provenanceId,
      MODEL_RUN_ID,
      FEATURE_VERSION,
      cutoffAt,
      HORIZON_DAYS,
      CUSTOMER_VALUE_METHODOLOGY_VERSION,
      REVENUE_SEMANTICS,
    ]
  );
  const [rows] = await connection.query<DbRow[]>(
    "SELECT id FROM revenue_intelligence_runs WHERE runKey = ? LIMIT 1",
    [runKey]
  );
  if (!rows[0]) throw new Error("Unable to create or find the Phase 7 run");
  return asNumber(rows[0].id, "revenueIntelligenceRunId");
}

async function insertBatch(
  connection: mysql.Connection,
  runId: number,
  provenanceId: number,
  rows: CandidateRow[]
): Promise<void> {
  const values = rows.map(row => {
    const value = calculateCustomerValue({
      historicalGrossRevenue: asNumber(
        row.historicalGrossRevenue,
        "historicalGrossRevenue"
      ),
      historicalNetRevenue: asNumber(
        row.historicalNetRevenue,
        "historicalNetRevenue"
      ),
      returnValue: asNumber(row.returnValue, "returnValue"),
      orderCount: asNumber(row.orderCount, "orderCount"),
      averageOrderValue: asNumber(row.averageOrderValue, "averageOrderValue"),
      purchaseFrequency: asNumber(row.purchaseFrequency, "purchaseFrequency"),
      lifetimeActivityDays: asNumber(
        row.lifetimeActivityDays,
        "lifetimeActivityDays"
      ),
      calibratedChurnProbability: asNumber(
        row.calibratedChurnProbability,
        "calibratedChurnProbability"
      ),
      horizonDays: HORIZON_DAYS,
    });
    return [
      runId,
      row.snapshotId,
      row.customerId,
      MODEL_RUN_ID,
      row.cutoffAt,
      FEATURE_VERSION,
      CUSTOMER_VALUE_METHODOLOGY_VERSION,
      HORIZON_DAYS,
      value.historicalGrossRevenue,
      value.historicalNetRevenue,
      value.returnValue,
      value.orderCount,
      value.averageOrderValue,
      value.purchaseFrequency,
      value.lifetimeActivityDays,
      value.calibratedChurnProbability,
      value.expectedFutureValue,
      value.behavioralClv,
      value.revenueAtRisk,
    ];
  });
  const columns = [
    "runId",
    "snapshotId",
    "customerId",
    "modelRunId",
    "cutoffAt",
    "featureVersion",
    "methodologyVersion",
    "horizonDays",
    "historicalGrossRevenue",
    "historicalNetRevenue",
    "returnValue",
    "orderCount",
    "averageOrderValue",
    "purchaseFrequency",
    "lifetimeActivityDays",
    "calibratedChurnProbability",
    "expectedFutureValue",
    "behavioralClv",
    "revenueAtRisk",
  ];
  const placeholders = rows
    .map(() => `(${columns.map(() => "?").join(",")})`)
    .join(",");
  const updates = columns
    .slice(4)
    .map(column => `${column}=VALUES(${column})`)
    .join(",");
  await connection.query(
    `INSERT INTO customer_value_snapshots (${columns.join(",")}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
    values.flat()
  );
}

export async function generateCustomerValue(): Promise<void> {
  const connection = await mysql.createConnection(requiredEnv());
  try {
    const model = await getModelRun(connection);
    const [provenanceRows] = await connection.query<DbRow[]>(
      "SELECT id, sourceSha256 FROM data_provenance WHERE id = ? LIMIT 1",
      [PROVENANCE_ID > 0 ? PROVENANCE_ID : model.provenanceId]
    );
    if (!provenanceRows[0])
      throw new Error("Phase 7 provenance record was not found");
    const provenanceId = asNumber(provenanceRows[0].id, "provenanceId");
    const sourceSha256 = String(provenanceRows[0].sourceSha256);
    const candidates = await getCandidates(connection);
    if (candidates.length === 0)
      throw new Error("No customer snapshots have calibrated predictions");
    const cutoffAt = new Date(
      Math.max(...candidates.map(row => new Date(row.cutoffAt).getTime()))
    );
    const runId = await ensureRun(
      connection,
      sourceSha256,
      provenanceId,
      cutoffAt
    );
    for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
      await insertBatch(
        connection,
        runId,
        provenanceId,
        candidates.slice(offset, offset + BATCH_SIZE)
      );
      if ((offset / BATCH_SIZE) % 10 === 0)
        console.log(
          JSON.stringify({
            status: "progress",
            runId,
            processed: Math.min(offset + BATCH_SIZE, candidates.length),
            total: candidates.length,
          })
        );
    }
    const [summary] = await connection.query<DbRow[]>(
      `SELECT COUNT(*) AS customerCount, COUNT(DISTINCT customerId) AS distinctCustomers,
        COUNT(DISTINCT snapshotId) AS distinctSnapshots,
        MIN(cutoffAt) AS minCutoff, MAX(cutoffAt) AS maxCutoff,
        SUM(revenueAtRisk) AS totalRevenueAtRisk,
        SUM(expectedFutureValue) AS totalExpectedFutureValue
       FROM customer_value_snapshots WHERE runId = ?`,
      [runId]
    );
    console.log(
      JSON.stringify(
        {
          status: "completed",
          runId,
          provenanceId,
          modelRunId: MODEL_RUN_ID,
          featureVersion: model.featureVersion,
          methodologyVersion: CUSTOMER_VALUE_METHODOLOGY_VERSION,
          horizonDays: HORIZON_DAYS,
          customerCandidates: candidates.length,
          summary: summary[0],
        },
        null,
        2
      )
    );
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith("generate_customer_value.ts")) {
  generateCustomerValue().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
