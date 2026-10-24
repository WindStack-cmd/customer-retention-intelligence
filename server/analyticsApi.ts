import mysql, { type RowDataPacket } from "mysql2/promise";
import { z } from "zod";

export const paginationSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const customerListSchema = paginationSchema.extend({
  search: z.string().trim().max(200).default(""),
  country: z.string().trim().max(128).optional(),
  minRisk: z.number().min(0).max(1).optional(),
  maxRisk: z.number().min(0).max(1).optional(),
  priorityBand: z.enum(["Urgent", "High", "Monitor"]).optional(),
});

export const customerIdSchema = z.object({
  customerId: z.number().int().positive(),
});
export const recommendationListSchema = paginationSchema.extend({
  priorityBand: z.enum(["Urgent", "High", "Monitor"]).optional(),
  action: z.string().trim().max(100).optional(),
});

export type DbRow = RowDataPacket & Record<string, unknown>;

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): string | null {
  return value instanceof Date
    ? value.toISOString()
    : value
      ? String(value)
      : null;
}

async function connection(): Promise<mysql.Connection> {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  return mysql.createConnection(process.env.DATABASE_URL);
}

async function query<T extends DbRow = DbRow>(
  db: mysql.Connection,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const [rows] = await db.query<T[]>(sql, params);
  return rows;
}

async function one<T extends DbRow = DbRow>(
  db: mysql.Connection,
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await query<T>(db, sql, params);
  return rows[0];
}

export async function executiveOverview() {
  const db = await connection();
  try {
    const [summary, bands, metadata] = await Promise.all([
      one(
        db,
        `SELECT COUNT(*) AS customerCount,
          AVG(r.priorityScore) AS averagePriorityScore,
          AVG(v.calibratedChurnProbability) AS averageChurnProbability,
          SUM(v.behavioralClv) AS totalBehavioralClv,
          SUM(v.revenueAtRisk) AS totalRevenueAtRisk,
          SUM(v.expectedFutureValue) AS totalExpectedFutureValue
        FROM customer_retention_recommendations r
        JOIN customer_value_snapshots v
          ON v.runId = r.valueRunId AND v.customerId = r.customerId AND v.snapshotId = r.snapshotId
        WHERE r.runId = (SELECT id FROM retention_recommendation_runs WHERE status='completed' ORDER BY id DESC LIMIT 1)`
      ),
      query(
        db,
        `SELECT priorityBand, COUNT(*) AS customerCount,
          AVG(priorityScore) AS averagePriorityScore,
          SUM(JSON_EXTRACT(supportingSignals, '$.revenueAtRisk')) AS revenueAtRisk
        FROM customer_retention_recommendations
        WHERE runId = (SELECT id FROM retention_recommendation_runs WHERE status='completed' ORDER BY id DESC LIMIT 1)
        GROUP BY priorityBand ORDER BY FIELD(priorityBand, 'Urgent', 'High', 'Monitor')`
      ),
      one(
        db,
        `SELECT rr.id AS recommendationRunId, rr.runKey, rr.cutoffAt,
          rr.featureVersion, rr.methodologyVersion, rr.rationaleVersion,
          rr.modelRunId, rr.explanationRunId, rr.valueRunId,
          m.modelName, m.modelVersion, m.status AS modelStatus,
          p.datasetName, p.sourceSha256
        FROM retention_recommendation_runs rr
        JOIN churn_model_runs m ON m.id = rr.modelRunId
        JOIN data_provenance p ON p.id = rr.provenanceId
        WHERE rr.status='completed' ORDER BY rr.id DESC LIMIT 1`
      ),
    ]);
    return {
      dataStatus: "REAL_DATABASE_RECORDS" as const,
      summary: {
        customerCount: asNumber(summary?.customerCount),
        averagePriorityScore: asNumber(summary?.averagePriorityScore),
        averageChurnProbability: asNumber(summary?.averageChurnProbability),
        totalBehavioralClv: asNumber(summary?.totalBehavioralClv),
        totalRevenueAtRisk: asNumber(summary?.totalRevenueAtRisk),
        totalExpectedFutureValue: asNumber(summary?.totalExpectedFutureValue),
      },
      priorityBands: bands.map(row => ({
        priorityBand: String(row.priorityBand),
        customerCount: asNumber(row.customerCount),
        averagePriorityScore: asNumber(row.averagePriorityScore),
        revenueAtRisk: asNumber(row.revenueAtRisk),
      })),
      metadata: metadata
        ? {
            recommendationRunId: asNumber(metadata.recommendationRunId),
            runKey: String(metadata.runKey),
            cutoffAt: asDate(metadata.cutoffAt),
            featureVersion: String(metadata.featureVersion),
            methodologyVersion: String(metadata.methodologyVersion),
            rationaleVersion: String(metadata.rationaleVersion),
            modelRunId: asNumber(metadata.modelRunId),
            explanationRunId: asNumber(metadata.explanationRunId),
            valueRunId: asNumber(metadata.valueRunId),
            modelName: String(metadata.modelName),
            modelVersion: String(metadata.modelVersion),
            modelStatus: String(metadata.modelStatus),
            datasetName: String(metadata.datasetName),
            sourceSha256: String(metadata.sourceSha256),
          }
        : null,
    };
  } finally {
    await db.end();
  }
}

export async function listCustomers(input: z.infer<typeof customerListSchema>) {
  const db = await connection();
  try {
    const params: unknown[] = [];
    const filters: string[] = [];
    if (input.search) {
      filters.push("(c.sourceCustomerId LIKE ? OR c.country LIKE ?)");
      const search = `%${input.search}%`;
      params.push(search, search);
    }
    if (input.country) {
      filters.push("c.country = ?");
      params.push(input.country);
    }
    if (input.minRisk !== undefined) {
      filters.push("v.calibratedChurnProbability >= ?");
      params.push(input.minRisk);
    }
    if (input.maxRisk !== undefined) {
      filters.push("v.calibratedChurnProbability <= ?");
      params.push(input.maxRisk);
    }
    if (input.priorityBand) {
      filters.push("r.priorityBand = ?");
      params.push(input.priorityBand);
    }
    const where = filters.length ? ` AND ${filters.join(" AND ")}` : "";
    const runIdSql =
      "(SELECT id FROM retention_recommendation_runs WHERE status='completed' ORDER BY id DESC LIMIT 1)";
    const countParams = [...params];
    const totalRow = await one(
      db,
      `SELECT COUNT(*) AS total FROM customer_retention_recommendations r
       JOIN customers c ON c.id = r.customerId
       JOIN customer_value_snapshots v ON v.runId = r.valueRunId AND v.customerId = r.customerId AND v.snapshotId = r.snapshotId
       WHERE r.runId = ${runIdSql}${where}`,
      countParams
    );
    const offset = (input.page - 1) * input.pageSize;
    const rows = await query(
      db,
      `SELECT c.id AS customerId, c.sourceCustomerId, c.country,
        c.firstActivityAt, c.lastActivityAt, r.priorityScore, r.priorityBand,
        r.recommendedAction, v.calibratedChurnProbability, v.behavioralClv,
        v.revenueAtRisk, v.expectedFutureValue, r.cutoffAt
       FROM customer_retention_recommendations r
       JOIN customers c ON c.id = r.customerId
       JOIN customer_value_snapshots v ON v.runId = r.valueRunId AND v.customerId = r.customerId AND v.snapshotId = r.snapshotId
       WHERE r.runId = ${runIdSql}${where}
       ORDER BY r.priorityScore DESC, r.customerId ASC LIMIT ? OFFSET ?`,
      [...params, input.pageSize, offset]
    );
    return {
      page: input.page,
      pageSize: input.pageSize,
      total: asNumber(totalRow?.total),
      dataStatus: "REAL_DATABASE_RECORDS" as const,
      items: rows.map(row => ({
        customerId: asNumber(row.customerId),
        sourceCustomerId: String(row.sourceCustomerId),
        country: row.country ? String(row.country) : null,
        firstActivityAt: asDate(row.firstActivityAt),
        lastActivityAt: asDate(row.lastActivityAt),
        priorityScore: asNumber(row.priorityScore),
        priorityBand: String(row.priorityBand),
        recommendedAction: String(row.recommendedAction),
        calibratedChurnProbability: asNumber(row.calibratedChurnProbability),
        behavioralClv: asNumber(row.behavioralClv),
        revenueAtRisk: asNumber(row.revenueAtRisk),
        expectedFutureValue: asNumber(row.expectedFutureValue),
        cutoffAt: asDate(row.cutoffAt),
      })),
    };
  } finally {
    await db.end();
  }
}

export async function customerDetail(customerId: number) {
  const db = await connection();
  try {
    const row = await one(
      db,
      `SELECT c.id AS customerId, c.sourceCustomerId, c.country,
        c.firstActivityAt, c.lastActivityAt, s.*, v.historicalGrossRevenue,
        v.historicalNetRevenue, v.returnValue, v.orderCount, v.averageOrderValue,
        v.purchaseFrequency AS valuePurchaseFrequency, v.lifetimeActivityDays,
        v.calibratedChurnProbability, v.expectedFutureValue, v.behavioralClv,
        v.revenueAtRisk, r.priorityScore, r.priorityBand, r.recommendedAction,
        r.rationale, r.supportingSignals, r.benefitEvidence,
        r.explanationId, r.explanationRunId, r.modelRunId, r.valueRunId,
        p.rawProbability, p.predictedClass, p.threshold, p.predictionVersion
       FROM customers c
       JOIN customer_retention_recommendations r ON r.customerId = c.id
       JOIN customer_feature_snapshots s ON s.id = r.snapshotId
       JOIN customer_value_snapshots v ON v.runId = r.valueRunId AND v.customerId = r.customerId AND v.snapshotId = r.snapshotId
       JOIN churn_predictions p ON p.modelRunId = r.modelRunId AND p.snapshotId = r.snapshotId
       WHERE c.id = ? AND r.runId = (SELECT id FROM retention_recommendation_runs WHERE status='completed' ORDER BY id DESC LIMIT 1)
       LIMIT 1`,
      [customerId]
    );
    if (!row) return null;
    const [features, orders] = await Promise.all([
      query(
        db,
        `SELECT featureName, featureValue, shapValue, contributionDirection, \`rank\`, isMissing
        FROM customer_explanation_features WHERE explanationId = ? ORDER BY \`rank\` ASC LIMIT 20`,
        [row.explanationId]
      ),
      query(
        db,
        `SELECT id, sourceInvoiceId, invoiceDate, isCancellation
        FROM orders WHERE customerId = ? ORDER BY invoiceDate DESC, id DESC LIMIT 20`,
        [customerId]
      ),
    ]);
    return {
      dataStatus: "REAL_DATABASE_RECORDS" as const,
      customer: {
        customerId: asNumber(row.customerId),
        sourceCustomerId: String(row.sourceCustomerId),
        country: row.country ? String(row.country) : null,
        firstActivityAt: asDate(row.firstActivityAt),
        lastActivityAt: asDate(row.lastActivityAt),
      },
      features: {
        snapshotId: asNumber(row.id),
        cutoffAt: asDate(row.cutoffAt),
        featureVersion: String(row.featureVersion),
        daysSinceLastPurchase: asNumber(row.daysSinceLastPurchase),
        totalOrders: asNumber(row.totalOrders),
        purchaseFrequency: asNumber(row.purchaseFrequency),
        totalGrossValue: asNumber(row.totalGrossValue),
        totalNetValue: asNumber(row.totalNetValue),
        averageOrderValue: asNumber(row.averageOrderValue),
        uniqueProducts: asNumber(row.uniqueProducts),
        inactiveDays: asNumber(row.inactiveDays),
        returnCount: asNumber(row.returnCount),
        returnValue: asNumber(row.returnValue),
        returnRate: asNumber(row.returnRate),
        cancellationCount: asNumber(row.cancellationCount),
        cancellationRate: asNumber(row.cancellationRate),
        recentVsPreviousOrderRate: asNumber(row.recentVsPreviousOrderRate),
        recentVsPreviousSpend: asNumber(row.recentVsPreviousSpend),
        purchasesLast30d: asNumber(row.purchasesLast30d),
        ordersLast30d: asNumber(row.ordersLast30d),
      },
      predictionAndValue: {
        rawProbability: asNumber(row.rawProbability),
        calibratedChurnProbability: asNumber(row.calibratedChurnProbability),
        predictedClass: asNumber(row.predictedClass),
        threshold: asNumber(row.threshold),
        predictionVersion: String(row.predictionVersion),
        historicalGrossRevenue: asNumber(row.historicalGrossRevenue),
        historicalNetRevenue: asNumber(row.historicalNetRevenue),
        returnValue: asNumber(row.returnValue),
        orderCount: asNumber(row.orderCount),
        averageOrderValue: asNumber(row.averageOrderValue),
        purchaseFrequency: asNumber(row.valuePurchaseFrequency),
        lifetimeActivityDays: asNumber(row.lifetimeActivityDays),
        expectedFutureValue: asNumber(row.expectedFutureValue),
        behavioralClv: asNumber(row.behavioralClv),
        revenueAtRisk: asNumber(row.revenueAtRisk),
      },
      recommendation: {
        priorityScore: asNumber(row.priorityScore),
        priorityBand: String(row.priorityBand),
        recommendedAction: String(row.recommendedAction),
        rationale: String(row.rationale),
        supportingSignals: JSON.parse(String(row.supportingSignals)),
        benefitEvidence: String(row.benefitEvidence),
        modelRunId: asNumber(row.modelRunId),
        explanationRunId: asNumber(row.explanationRunId),
        valueRunId: asNumber(row.valueRunId),
      },
      explanations: features.map(feature => ({
        featureName: String(feature.featureName),
        featureValue: asNumber(feature.featureValue),
        shapValue: asNumber(feature.shapValue),
        contributionDirection: String(feature.contributionDirection),
        rank: asNumber(feature.rank),
        isMissing: asNumber(feature.isMissing) === 1,
      })),
      recentOrders: orders.map(order => ({
        id: asNumber(order.id),
        sourceInvoiceId: String(order.sourceInvoiceId),
        invoiceDate: asDate(order.invoiceDate),
        isCancellation: asNumber(order.isCancellation) === 1,
      })),
    };
  } finally {
    await db.end();
  }
}

export async function listRecommendations(
  input: z.infer<typeof recommendationListSchema>
) {
  const db = await connection();
  try {
    const params: unknown[] = [];
    const filters: string[] = [];
    if (input.priorityBand) {
      filters.push("r.priorityBand = ?");
      params.push(input.priorityBand);
    }
    if (input.action) {
      filters.push("r.recommendedAction = ?");
      params.push(input.action);
    }
    const where = filters.length ? ` AND ${filters.join(" AND ")}` : "";
    const runIdSql =
      "(SELECT id FROM retention_recommendation_runs WHERE status='completed' ORDER BY id DESC LIMIT 1)";
    const total = await one(
      db,
      `SELECT COUNT(*) AS total FROM customer_retention_recommendations r WHERE r.runId = ${runIdSql}${where}`,
      params
    );
    const offset = (input.page - 1) * input.pageSize;
    const rows = await query(
      db,
      `SELECT r.id, r.customerId, c.sourceCustomerId, c.country,
      r.priorityScore, r.priorityBand, r.recommendedAction, r.rationale,
      r.supportingSignals, r.benefitEvidence, r.cutoffAt, r.modelRunId,
      r.explanationRunId, r.valueRunId
      FROM customer_retention_recommendations r JOIN customers c ON c.id = r.customerId
      WHERE r.runId = ${runIdSql}${where}
      ORDER BY r.priorityScore DESC, r.customerId ASC LIMIT ? OFFSET ?`,
      [...params, input.pageSize, offset]
    );
    return {
      page: input.page,
      pageSize: input.pageSize,
      total: asNumber(total?.total),
      dataStatus: "REAL_DATABASE_RECORDS" as const,
      items: rows.map(row => ({
        id: asNumber(row.id),
        customerId: asNumber(row.customerId),
        sourceCustomerId: String(row.sourceCustomerId),
        country: row.country ? String(row.country) : null,
        priorityScore: asNumber(row.priorityScore),
        priorityBand: String(row.priorityBand),
        recommendedAction: String(row.recommendedAction),
        rationale: String(row.rationale),
        supportingSignals: JSON.parse(String(row.supportingSignals)),
        benefitEvidence: String(row.benefitEvidence),
        cutoffAt: asDate(row.cutoffAt),
        modelRunId: asNumber(row.modelRunId),
        explanationRunId: asNumber(row.explanationRunId),
        valueRunId: asNumber(row.valueRunId),
      })),
    };
  } finally {
    await db.end();
  }
}

export async function dataQualityMetadata() {
  const db = await connection();
  try {
    const [runs, issues] = await Promise.all([
      query(
        db,
        `SELECT id, provenanceId, runKey, status, rowsInspected, rowsAccepted,
        rowsRejected, qualitySummary, executedAt FROM data_quality_runs ORDER BY id DESC LIMIT 20`
      ),
      query(
        db,
        `SELECT i.id, i.runId, i.issueType, i.severity, i.entityName, i.entityKey,
        i.description, i.createdAt FROM data_quality_issues i ORDER BY i.id DESC LIMIT 100`
      ),
    ]);
    return {
      dataStatus: "REAL_DATABASE_RECORDS" as const,
      runs: runs.map(row => ({
        id: asNumber(row.id),
        provenanceId: asNumber(row.provenanceId),
        runKey: String(row.runKey),
        status: String(row.status),
        rowsInspected: asNumber(row.rowsInspected),
        rowsAccepted: asNumber(row.rowsAccepted),
        rowsRejected: asNumber(row.rowsRejected),
        qualitySummary: String(row.qualitySummary),
        executedAt: asDate(row.executedAt),
      })),
      issues: issues.map(row => ({
        id: asNumber(row.id),
        runId: asNumber(row.runId),
        issueType: String(row.issueType),
        severity: String(row.severity),
        entityName: String(row.entityName),
        entityKey: row.entityKey ? String(row.entityKey) : null,
        description: String(row.description),
        createdAt: asDate(row.createdAt),
      })),
    };
  } finally {
    await db.end();
  }
}

export async function modelMetadata() {
  const db = await connection();
  try {
    const runs = await query(
      db,
      `SELECT id, runKey, modelName, modelVersion, featureVersion,
      labelVersion, datasetVersion, threshold, status, artifactSha256, createdAt
      FROM churn_model_runs ORDER BY id DESC LIMIT 20`
    );
    return {
      dataStatus: "REAL_DATABASE_RECORDS" as const,
      runs: runs.map(row => ({
        id: asNumber(row.id),
        runKey: String(row.runKey),
        modelName: String(row.modelName),
        modelVersion: String(row.modelVersion),
        featureVersion: String(row.featureVersion),
        labelVersion: String(row.labelVersion),
        datasetVersion: String(row.datasetVersion),
        threshold: asNumber(row.threshold),
        status: String(row.status),
        artifactSha256: String(row.artifactSha256),
        createdAt: asDate(row.createdAt),
      })),
    };
  } finally {
    await db.end();
  }
}
