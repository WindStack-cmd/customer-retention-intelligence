import "dotenv/config";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

const RECOVERY_DIR = path.resolve(process.env.RECOVERY_DIR ?? "data/recovery");
const BATCH_SIZE = 250;

type CsvRow = Record<string, string>;
type TableSpec = {
  table: string;
  file: string;
  columns: string[];
  key: string;
};
type TableSpecTuple = [
  file: string,
  table: string,
  columns: string[],
  key: string,
];

const TABLES: TableSpecTuple[] = [
  [
    "data_provenance_20261024_053355.csv",
    "data_provenance",
    [
      "id",
      "datasetName",
      "sourceUrl",
      "sourceFile",
      "sourceSha256",
      "archiveSha256",
      "transformationVersion",
      "retrievedAt",
      "createdAt",
    ],
    "id",
  ],
  [
    "data_quality_runs_20261024_053405.csv",
    "data_quality_runs",
    [
      "id",
      "provenanceId",
      "runKey",
      "status",
      "rowsInspected",
      "rowsAccepted",
      "rowsRejected",
      "qualitySummary",
      "executedAt",
      "createdAt",
    ],
    "id",
  ],
  [
    "data_quality_issues_20261024_053400.csv",
    "data_quality_issues",
    [
      "id",
      "runId",
      "issueType",
      "severity",
      "entityName",
      "entityKey",
      "description",
      "createdAt",
    ],
    "id",
  ],
  [
    "customers_20261024_052130.csv",
    "customers",
    [
      "id",
      "sourceCustomerId",
      "firstActivityAt",
      "lastActivityAt",
      "country",
      "provenanceId",
      "createdAt",
    ],
    "id",
  ],
  [
    "products_20261024_053508.csv",
    "products",
    ["id", "sourceStockCode", "description", "provenanceId", "createdAt"],
    "id",
  ],
  [
    "orders_20261024_053459.csv",
    "orders",
    [
      "id",
      "sourceInvoiceId",
      "customerId",
      "invoiceDate",
      "isCancellation",
      "provenanceId",
      "ingestionRunId",
      "createdAt",
    ],
    "id",
  ],
  [
    "retail_source_rows_20261024_053603.csv",
    "retail_source_rows",
    [
      "id",
      "sourceRowNumber",
      "sourceRowHash",
      "invoiceNo",
      "stockCode",
      "description",
      "quantity",
      "invoiceDate",
      "unitPrice",
      "sourceCustomerId",
      "country",
      "isCancellation",
      "quantityValid",
      "unitPriceValid",
      "invoiceDateValid",
      "lineRevenue",
      "provenanceId",
      "ingestionRunId",
      "createdAt",
    ],
    "id",
  ],
  [
    "invoice_items_20261024_053423.csv",
    "invoice_items",
    [
      "id",
      "sourceRowNumber",
      "sourceRowHash",
      "orderId",
      "productId",
      "description",
      "quantity",
      "unitPrice",
      "lineRevenue",
      "isCancellation",
      "provenanceId",
      "ingestionRunId",
      "createdAt",
    ],
    "id",
  ],
  [
    "customer_feature_runs_20261024_052920.csv",
    "customer_feature_runs",
    [
      "id",
      "provenanceId",
      "runKey",
      "featureVersion",
      "cutoffAt",
      "horizonDays",
      "observationStartAt",
      "observationEndAt",
      "generatedAt",
    ],
    "id",
  ],
  [
    "customer_feature_snapshots_20261024_054653.csv",
    "customer_feature_snapshots",
    [
      "id",
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
      "createdAt",
    ],
    "id",
  ],
  [
    "customer_behavior_labels_20261024_052827.csv",
    "customer_behavior_labels",
    [
      "id",
      "snapshotId",
      "runId",
      "provenanceId",
      "customerId",
      "cutoffAt",
      "horizonEndAt",
      "labelVersion",
      "inactivityLabel",
      "futureOrderCount",
      "labelable",
      "createdAt",
    ],
    "id",
  ],
  [
    "churn_model_runs_20261024_052811.csv",
    "churn_model_runs",
    [
      "id",
      "runKey",
      "modelName",
      "modelVersion",
      "featureVersion",
      "labelVersion",
      "datasetVersion",
      "provenanceId",
      "trainStartAt",
      "trainEndAt",
      "validationStartAt",
      "validationEndAt",
      "testStartAt",
      "testEndAt",
      "threshold",
      "status",
      "configJson",
      "artifactPath",
      "artifactSha256",
      "createdAt",
    ],
    "id",
  ],
  [
    "churn_model_metrics_20261024_052804.csv",
    "churn_model_metrics",
    [
      "id",
      "modelRunId",
      "split",
      "metricName",
      "metricValue",
      "metricJson",
      "createdAt",
    ],
    "id",
  ],
  [
    "churn_predictions_20261024_052819.csv",
    "churn_predictions",
    [
      "id",
      "modelRunId",
      "snapshotId",
      "customerId",
      "cutoffAt",
      "rawProbability",
      "calibratedProbability",
      "predictedClass",
      "threshold",
      "predictionVersion",
      "createdAt",
    ],
    "id",
  ],
  [
    "model_explanation_runs_20261024_053441.csv",
    "model_explanation_runs",
    [
      "id",
      "runKey",
      "modelRunId",
      "featureVersion",
      "explainerType",
      "explainerVersion",
      "outputSpace",
      "topN",
      "featureCount",
      "configJson",
      "artifactPath",
      "artifactSha256",
      "createdAt",
    ],
    "id",
  ],
  [
    "customer_explanations_20261024_052906.csv",
    "customer_explanations",
    [
      "id",
      "explanationRunId",
      "modelRunId",
      "snapshotId",
      "customerId",
      "cutoffAt",
      "rawProbability",
      "calibratedProbability",
      "predictedClass",
      "baseValue",
      "modelOutput",
      "additivityError",
      "createdAt",
    ],
    "id",
  ],
  [
    "revenue_intelligence_runs_20261024_053615.csv",
    "revenue_intelligence_runs",
    [
      "id",
      "runKey",
      "provenanceId",
      "modelRunId",
      "featureVersion",
      "cutoffAt",
      "horizonDays",
      "methodologyVersion",
      "revenueSemantics",
      "status",
      "createdAt",
    ],
    "id",
  ],
  [
    "customer_value_snapshots_20261024_053030.csv",
    "customer_value_snapshots",
    [
      "id",
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
      "createdAt",
    ],
    "id",
  ],
  [
    "retention_recommendation_runs_20261024_053609.csv",
    "retention_recommendation_runs",
    [
      "id",
      "runKey",
      "provenanceId",
      "modelRunId",
      "explanationRunId",
      "valueRunId",
      "featureVersion",
      "cutoffAt",
      "methodologyVersion",
      "rationaleVersion",
      "status",
      "createdAt",
    ],
    "id",
  ],
  [
    "customer_retention_recommendations_20261024_054045.csv",
    "customer_retention_recommendations",
    [
      "id",
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
      "createdAt",
    ],
    "id",
  ],
  [
    "model_monitoring_runs_20261024_053452.csv",
    "model_monitoring_runs",
    [
      "id",
      "runKey",
      "modelRunId",
      "provenanceId",
      "modelVersion",
      "featureVersion",
      "snapshotCutoffAt",
      "referenceStartAt",
      "referenceEndAt",
      "monitoredStartAt",
      "monitoredEndAt",
      "referenceSampleCount",
      "monitoredSampleCount",
      "performanceSampleCount",
      "status",
      "performanceStatus",
      "statusReason",
      "methodologyVersion",
      "configJson",
      "executedAt",
      "createdAt",
    ],
    "id",
  ],
  [
    "model_monitoring_findings_20261024_053446.csv",
    "model_monitoring_findings",
    [
      "id",
      "monitoringRunId",
      "category",
      "metricName",
      "status",
      "metricValue",
      "referenceValue",
      "threshold",
      "sampleCount",
      "details",
      "createdAt",
    ],
    "id",
  ],
];
const TABLE_SPECS: TableSpec[] = TABLES.map(([file, table, columns, key]) => ({
  file,
  table,
  columns,
  key,
}));

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) {
      value += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += char;
  }
  values.push(value.replace(/\r$/, ""));
  return values;
}

async function* rows(spec: TableSpec): AsyncGenerator<CsvRow> {
  const input = createReadStream(path.join(RECOVERY_DIR, spec.file), {
    encoding: "utf8",
  });
  const reader = createInterface({ input, crlfDelay: Infinity });
  let headers: string[] | undefined;
  try {
    for await (const line of reader) {
      if (!headers) {
        headers = parseCsvLine(line).map(value => value.replace(/^\uFEFF/, ""));
        if (headers.join("\0") !== spec.columns.join("\0"))
          throw new Error(
            `${spec.file}: header does not match expected schema`
          );
        continue;
      }
      if (line.trim()) {
        const values = parseCsvLine(line);
        if (values.length !== spec.columns.length)
          throw new Error(
            `${spec.file}: row has ${values.length} fields; expected ${spec.columns.length}`
          );
        yield Object.fromEntries(
          spec.columns.map((column, index) => [column, values[index] ?? ""])
        );
      }
    }
  } finally {
    input.destroy();
  }
}

function values(row: CsvRow, columns: string[]): unknown[] {
  return columns.map(column => (row[column] === "" ? null : row[column]));
}

async function validateFiles(): Promise<void> {
  await access(RECOVERY_DIR);
  for (const spec of TABLE_SPECS) {
    await access(path.join(RECOVERY_DIR, spec.file));
    let count = 0;
    const seen = new Set<string>();
    const fingerprints = new Map<string, string>();
    for await (const row of rows(spec)) {
      const key = row[spec.key];
      if (!key) throw new Error(`${spec.file}: empty ${spec.key}`);
      const fingerprint = JSON.stringify(row);
      const previous = fingerprints.get(key);
      if (previous && previous !== fingerprint)
        throw new Error(
          `${spec.file}: conflicting duplicate ${spec.key} ${key}`
        );
      fingerprints.set(key, fingerprint);
      seen.add(key);
      count += 1;
    }
    console.log(
      JSON.stringify({
        file: spec.file,
        table: spec.table,
        rows: count,
        uniqueKeys: seen.size,
      })
    );
  }
}

async function insertTable(
  connection: Connection,
  spec: TableSpec
): Promise<void> {
  const quotedColumns = spec.columns.map(column => `\`${column}\``).join(",");
  const placeholders = spec.columns.map(() => "?").join(",");
  const seen = new Set<string>();
  let batch: unknown[][] = [];
  let read = 0;
  let skippedDuplicates = 0;
  const flush = async () => {
    if (!batch.length) return;
    await connection.query(
      `INSERT INTO \`${spec.table}\` (${quotedColumns}) VALUES ${batch.map(() => `(${placeholders})`).join(",")} ON DUPLICATE KEY UPDATE \`${spec.key}\`=\`${spec.key}\``,
      batch.flat()
    );
    batch = [];
  };
  for await (const row of rows(spec)) {
    read += 1;
    const key = row[spec.key];
    if (seen.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(key);
    batch.push(values(row, spec.columns));
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  console.log(
    JSON.stringify({
      table: spec.table,
      read,
      importedUniqueKeys: seen.size,
      skippedExactDuplicateKeys: skippedDuplicates,
    })
  );
}

async function importDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required for recovery import");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    for (const spec of TABLE_SPECS) {
      await connection.beginTransaction();
      try {
        await insertTable(connection, spec);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    await connection.end();
  }
}

async function main() {
  await validateFiles();
  if (!process.argv.includes("--validate-only")) await importDatabase();
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "Recovery restore failed"
  );
  process.exitCode = 1;
});
