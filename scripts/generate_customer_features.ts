import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  calculateCustomerFeatures,
  FEATURE_VERSION,
  type FeatureItem,
  type FeatureOrder,
} from "./customer_features";

const PROVENANCE_ID = Number(process.env.FEATURE_PROVENANCE_ID ?? "30001");
const RUN_ID = Number(process.env.FEATURE_RUN_ID ?? "30001");
const CUTOFF_AT = new Date(
  process.env.FEATURE_CUTOFF_AT ?? "2011-11-09T23:59:59Z"
);
const HORIZON_DAYS = Number(process.env.FEATURE_HORIZON_DAYS ?? "30");
const BATCH_SIZE = 100;
const OBSERVATION_START_AT = new Date("2010-12-01T00:00:00Z");
const OBSERVATION_END_AT = CUTOFF_AT;

type DbRow = RowDataPacket & Record<string, unknown>;

type CustomerRow = DbRow & { id: number };
type OrderRow = DbRow & {
  customerId: number;
  orderId: number;
  invoiceDate: Date;
  orderCancellation: number;
};
type ItemRow = DbRow & {
  customerId: number;
  orderId: number;
  productId: number;
  quantity: string;
  lineRevenue: string;
  itemCancellation: number;
};

type CustomerAccumulator = {
  orders: FeatureOrder[];
  items: FeatureItem[];
};

function requiredEnv(): string {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!Number.isInteger(PROVENANCE_ID) || !Number.isInteger(RUN_ID))
    throw new Error("Feature provenance/run IDs must be integers");
  if (!Number.isInteger(HORIZON_DAYS) || HORIZON_DAYS < 1 || HORIZON_DAYS > 365)
    throw new Error("FEATURE_HORIZON_DAYS must be 1..365");
  if (Number.isNaN(CUTOFF_AT.getTime()))
    throw new Error("FEATURE_CUTOFF_AT must be an ISO timestamp");
  return process.env.DATABASE_URL;
}

function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime()))
    throw new Error(`Invalid database date: ${String(value)}`);
  return date;
}

function asNumber(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error(`Invalid database number: ${String(value)}`);
  return number;
}

async function getExistingRun(
  connection: mysql.Connection,
  runKey: string
): Promise<number | null> {
  const [rows] = await connection.query<DbRow[]>(
    "SELECT id FROM customer_feature_runs WHERE runKey = ? LIMIT 1",
    [runKey]
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function ensureRun(
  connection: mysql.Connection,
  runKey: string,
  sourceSha256: string
): Promise<number> {
  await connection.query(
    "INSERT INTO customer_feature_runs (provenanceId, runKey, featureVersion, cutoffAt, horizonDays, observationStartAt, observationEndAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
    [
      PROVENANCE_ID,
      runKey,
      FEATURE_VERSION,
      CUTOFF_AT,
      HORIZON_DAYS,
      OBSERVATION_START_AT,
      OBSERVATION_END_AT,
    ]
  );
  const runId = await getExistingRun(connection, runKey);
  if (!runId)
    throw new Error(`Unable to create or find feature run for ${sourceSha256}`);
  return runId;
}

function addOrder(accumulator: CustomerAccumulator, row: OrderRow): void {
  accumulator.orders.push({
    orderId: Number(row.orderId),
    invoiceDate: asDate(row.invoiceDate),
    isCancellation: Number(row.orderCancellation),
  });
}

function addItem(accumulator: CustomerAccumulator, row: ItemRow): void {
  accumulator.items.push({
    orderId: Number(row.orderId),
    productId: Number(row.productId),
    quantity: asNumber(row.quantity),
    lineRevenue: asNumber(row.lineRevenue),
    isCancellation: Number(row.itemCancellation),
  });
}

async function insertSnapshotBatch(
  connection: mysql.Connection,
  runId: number,
  rows: unknown[][]
): Promise<void> {
  if (rows.length === 0) return;
  const columns = [
    "runId",
    "provenanceId",
    "customerId",
    "cutoffAt",
    "featureVersion",
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
    "firstPurchaseDate",
    "lastPurchaseDate",
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
    "acquisitionMonth",
    "acquisitionQuarter",
    "cohortMonth",
    "customerAgeAtCutoff",
  ];
  const placeholders = rows
    .map(() => `(${columns.map(() => "?").join(",")})`)
    .join(",");
  const updates = columns
    .slice(1)
    .map(column => `${column}=VALUES(${column})`)
    .join(",");
  await connection.query(
    `INSERT INTO customer_feature_snapshots (${columns.join(",")}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
    rows.flat()
  );
}

function featureValues(
  runId: number,
  customerId: number,
  features: ReturnType<typeof calculateCustomerFeatures>
): unknown[] {
  return [
    runId,
    PROVENANCE_ID,
    customerId,
    CUTOFF_AT,
    FEATURE_VERSION,
    features.daysSinceLastPurchase,
    features.totalOrders,
    features.purchaseFrequency,
    features.totalGrossValue,
    features.totalNetValue,
    features.averageOrderValue,
    features.totalItems,
    features.averageItemsPerOrder,
    features.uniqueProducts,
    features.activeMonths,
    features.purchaseCount,
    features.averageQuantityPerOrder,
    features.averageDaysBetweenOrders,
    features.purchaseIntervalVariance,
    features.firstPurchaseDate,
    features.lastPurchaseDate,
    features.customerLifetimeDays,
    features.inactiveDays,
    features.returnCount,
    features.returnQuantity,
    features.returnValue,
    features.returnRate,
    features.cancellationCount,
    features.cancellationRate,
    features.productDiversity,
    features.purchasesLast7d,
    features.purchasesLast30d,
    features.purchasesLast60d,
    features.purchasesLast90d,
    features.spendLast30d,
    features.spendLast60d,
    features.spendLast90d,
    features.ordersLast30d,
    features.ordersLast60d,
    features.ordersLast90d,
    features.recentVsPreviousOrderRate,
    features.recentVsPreviousSpend,
    features.recentVsPreviousQuantity,
    features.acquisitionMonth,
    features.acquisitionQuarter,
    features.cohortMonth,
    features.customerAgeAtCutoff,
  ];
}

export async function generateFeatures(): Promise<void> {
  const connection = await mysql.createConnection(requiredEnv());
  try {
    const [provenanceRows] = await connection.query<DbRow[]>(
      "SELECT sourceSha256 FROM data_provenance WHERE id = ? LIMIT 1",
      [PROVENANCE_ID]
    );
    const sourceSha256 = String(provenanceRows[0]?.sourceSha256 ?? "");
    if (!sourceSha256)
      throw new Error(`Provenance ${PROVENANCE_ID} does not exist`);
    const runKey = `phase4:${sourceSha256}:${FEATURE_VERSION}:${CUTOFF_AT.toISOString()}:${HORIZON_DAYS}`;
    const runId = await ensureRun(connection, runKey, sourceSha256);
    const [customers] = await connection.query<CustomerRow[]>(
      "SELECT id FROM customers WHERE provenanceId = ? ORDER BY id",
      [PROVENANCE_ID]
    );
    const accumulators = new Map<number, CustomerAccumulator>();
    for (const customer of customers)
      accumulators.set(Number(customer.id), { orders: [], items: [] });

    const [orders] = await connection.query<OrderRow[]>(
      "SELECT o.customerId, o.id AS orderId, o.invoiceDate, o.isCancellation AS orderCancellation FROM orders o WHERE o.ingestionRunId = ? AND o.invoiceDate <= ? ORDER BY o.customerId, o.invoiceDate, o.id",
      [RUN_ID, CUTOFF_AT]
    );
    for (const order of orders) {
      const accumulator = accumulators.get(Number(order.customerId));
      if (accumulator) addOrder(accumulator, order);
    }
    const [items] = await connection.query<ItemRow[]>(
      "SELECT o.customerId, i.orderId, i.productId, i.quantity, i.lineRevenue, i.isCancellation AS itemCancellation FROM invoice_items i JOIN orders o ON o.id = i.orderId WHERE i.ingestionRunId = ? AND o.invoiceDate <= ? ORDER BY o.customerId, i.orderId, i.id",
      [RUN_ID, CUTOFF_AT]
    );
    for (const item of items) {
      const accumulator = accumulators.get(Number(item.customerId));
      if (accumulator) addItem(accumulator, item);
    }

    const values: unknown[][] = [];
    let generated = 0;
    for (const customerId of Array.from(accumulators.keys())) {
      const accumulator = accumulators.get(customerId);
      if (!accumulator || accumulator.orders.length === 0) continue;
      const features = calculateCustomerFeatures({
        cutoffAt: CUTOFF_AT,
        horizonDays: HORIZON_DAYS,
        orders: accumulator.orders,
        items: accumulator.items,
      });
      values.push(featureValues(runId, customerId, features));
      if (values.length >= BATCH_SIZE) {
        await insertSnapshotBatch(
          connection,
          runId,
          values.splice(0, values.length)
        );
      }
      generated += 1;
    }
    await insertSnapshotBatch(connection, runId, values);
    const [futureRows] = await connection.query<DbRow[]>(
      "SELECT COUNT(DISTINCT customerId) AS customersWithFutureOrder FROM orders WHERE ingestionRunId = ? AND invoiceDate > ? AND invoiceDate <= DATE_ADD(?, INTERVAL ? DAY)",
      [RUN_ID, CUTOFF_AT, CUTOFF_AT, HORIZON_DAYS]
    );
    const [snapshotRows] = await connection.query<DbRow[]>(
      "SELECT COUNT(*) AS count FROM customer_feature_snapshots WHERE runId = ?",
      [runId]
    );
    console.log(
      JSON.stringify(
        {
          status: "generated",
          runId,
          runKey,
          featureVersion: FEATURE_VERSION,
          cutoffAt: CUTOFF_AT.toISOString(),
          horizonDays: HORIZON_DAYS,
          customersConsidered: customers.length,
          customersWithFeatures: generated,
          snapshots: Number(snapshotRows[0]?.count ?? 0),
          customersWithFutureOrderWithinHorizon: Number(
            futureRows[0]?.customersWithFutureOrder ?? 0
          ),
          sourceSha256,
        },
        null,
        2
      )
    );
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith("generate_customer_features.ts")) {
  generateFeatures().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
