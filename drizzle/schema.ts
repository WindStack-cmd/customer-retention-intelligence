import {
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing auth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const dataProvenance = mysqlTable(
  "data_provenance",
  {
    id: int("id").autoincrement().primaryKey(),
    datasetName: varchar("datasetName", { length: 160 }).notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    sourceFile: varchar("sourceFile", { length: 255 }).notNull(),
    sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
    archiveSha256: varchar("archiveSha256", { length: 64 }),
    transformationVersion: varchar("transformationVersion", {
      length: 80,
    }).notNull(),
    retrievedAt: timestamp("retrievedAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    sourceHashUnique: uniqueIndex("data_provenance_source_sha256_unique").on(
      table.sourceSha256
    ),
    datasetIndex: index("data_provenance_dataset_idx").on(table.datasetName),
  })
);

export const dataQualityRuns = mysqlTable(
  "data_quality_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    runKey: varchar("runKey", { length: 160 }).notNull(),
    status: mysqlEnum("status", ["PASS", "WARNING", "FAIL"]).notNull(),
    rowsInspected: int("rowsInspected").notNull(),
    rowsAccepted: int("rowsAccepted").notNull(),
    rowsRejected: int("rowsRejected").notNull(),
    qualitySummary: text("qualitySummary").notNull(),
    executedAt: timestamp("executedAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runKeyUnique: uniqueIndex("data_quality_runs_run_key_unique").on(
      table.runKey
    ),
    provenanceIndex: index("data_quality_runs_provenance_idx").on(
      table.provenanceId
    ),
  })
);

export const dataQualityIssues = mysqlTable(
  "data_quality_issues",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => dataQualityRuns.id),
    issueType: varchar("issueType", { length: 80 }).notNull(),
    severity: mysqlEnum("severity", ["INFO", "WARNING", "ERROR"]).notNull(),
    entityName: varchar("entityName", { length: 80 }).notNull(),
    entityKey: varchar("entityKey", { length: 160 }),
    description: text("description").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runIndex: index("data_quality_issues_run_idx").on(table.runId),
    issueTypeIndex: index("data_quality_issues_type_idx").on(table.issueType),
  })
);

export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceCustomerId: varchar("sourceCustomerId", { length: 64 }).notNull(),
    firstActivityAt: timestamp("firstActivityAt").notNull(),
    lastActivityAt: timestamp("lastActivityAt").notNull(),
    country: varchar("country", { length: 128 }),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    sourceCustomerUnique: uniqueIndex("customers_source_customer_unique").on(
      table.sourceCustomerId
    ),
    activityIndex: index("customers_last_activity_idx").on(
      table.lastActivityAt
    ),
    provenanceIndex: index("customers_provenance_idx").on(table.provenanceId),
  })
);

export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceStockCode: varchar("sourceStockCode", { length: 64 }).notNull(),
    description: text("description"),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    stockCodeUnique: uniqueIndex("products_source_stock_code_unique").on(
      table.sourceStockCode
    ),
    provenanceIndex: index("products_provenance_idx").on(table.provenanceId),
  })
);

export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceInvoiceId: varchar("sourceInvoiceId", { length: 64 }).notNull(),
    customerId: int("customerId").references(() => customers.id),
    invoiceDate: timestamp("invoiceDate").notNull(),
    isCancellation: int("isCancellation").notNull().default(0),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    ingestionRunId: int("ingestionRunId")
      .notNull()
      .references(() => dataQualityRuns.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    sourceInvoiceUnique: uniqueIndex("orders_source_invoice_unique").on(
      table.sourceInvoiceId
    ),
    customerDateIndex: index("orders_customer_date_idx").on(
      table.customerId,
      table.invoiceDate
    ),
    provenanceIndex: index("orders_provenance_idx").on(table.provenanceId),
  })
);

export const retailSourceRows = mysqlTable(
  "retail_source_rows",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceRowNumber: int("sourceRowNumber").notNull(),
    sourceRowHash: varchar("sourceRowHash", { length: 64 }).notNull(),
    invoiceNo: varchar("invoiceNo", { length: 64 }).notNull(),
    stockCode: varchar("stockCode", { length: 64 }).notNull(),
    description: text("description"),
    quantity: decimal("quantity", { precision: 14, scale: 3 }),
    invoiceDate: timestamp("invoiceDate"),
    unitPrice: decimal("unitPrice", { precision: 14, scale: 4 }),
    sourceCustomerId: varchar("sourceCustomerId", { length: 64 }),
    country: varchar("country", { length: 128 }),
    isCancellation: int("isCancellation").notNull().default(0),
    quantityValid: int("quantityValid").notNull().default(1),
    unitPriceValid: int("unitPriceValid").notNull().default(1),
    invoiceDateValid: int("invoiceDateValid").notNull().default(1),
    lineRevenue: decimal("lineRevenue", { precision: 16, scale: 2 }),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    ingestionRunId: int("ingestionRunId")
      .notNull()
      .references(() => dataQualityRuns.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    sourceRowHashUnique: uniqueIndex("retail_source_rows_hash_unique").on(
      table.sourceRowHash
    ),
    invoiceIndex: index("retail_source_rows_invoice_idx").on(table.invoiceNo),
    customerIndex: index("retail_source_rows_customer_idx").on(
      table.sourceCustomerId
    ),
    provenanceIndex: index("retail_source_rows_provenance_idx").on(
      table.provenanceId
    ),
  })
);

export const invoiceItems = mysqlTable(
  "invoice_items",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceRowNumber: int("sourceRowNumber").notNull(),
    sourceRowHash: varchar("sourceRowHash", { length: 64 }).notNull(),
    orderId: int("orderId")
      .notNull()
      .references(() => orders.id),
    productId: int("productId")
      .notNull()
      .references(() => products.id),
    description: text("description"),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: decimal("unitPrice", { precision: 14, scale: 4 }).notNull(),
    lineRevenue: decimal("lineRevenue", { precision: 16, scale: 2 }).notNull(),
    isCancellation: int("isCancellation").notNull().default(0),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    ingestionRunId: int("ingestionRunId")
      .notNull()
      .references(() => dataQualityRuns.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    sourceRowHashUnique: uniqueIndex("invoice_items_source_row_hash_unique").on(
      table.sourceRowHash
    ),
    orderIndex: index("invoice_items_order_idx").on(table.orderId),
    productIndex: index("invoice_items_product_idx").on(table.productId),
    provenanceIndex: index("invoice_items_provenance_idx").on(
      table.provenanceId
    ),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type DataProvenance = typeof dataProvenance.$inferSelect;
export type DataQualityRun = typeof dataQualityRuns.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type RetailSourceRow = typeof retailSourceRows.$inferSelect;

export const customerFeatureRuns = mysqlTable(
  "customer_feature_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    runKey: varchar("runKey", { length: 200 }).notNull(),
    featureVersion: varchar("featureVersion", { length: 80 }).notNull(),
    cutoffAt: timestamp("cutoffAt").notNull(),
    horizonDays: int("horizonDays").notNull(),
    observationStartAt: timestamp("observationStartAt").notNull(),
    observationEndAt: timestamp("observationEndAt").notNull(),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  },
  table => ({
    runKeyUnique: uniqueIndex("customer_feature_runs_key_unique").on(
      table.runKey
    ),
    provenanceIndex: index("customer_feature_runs_provenance_idx").on(
      table.provenanceId
    ),
  })
);

export const customerFeatureSnapshots = mysqlTable(
  "customer_feature_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => customerFeatureRuns.id),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    customerId: int("customerId")
      .notNull()
      .references(() => customers.id),
    cutoffAt: timestamp("cutoffAt").notNull(),
    featureVersion: varchar("featureVersion", { length: 80 }).notNull(),
    daysSinceLastPurchase: int("daysSinceLastPurchase").notNull(),
    totalOrders: int("totalOrders").notNull(),
    purchaseFrequency: decimal("purchaseFrequency", {
      precision: 16,
      scale: 6,
    }).notNull(),
    totalGrossValue: decimal("totalGrossValue", {
      precision: 18,
      scale: 2,
    }).notNull(),
    totalNetValue: decimal("totalNetValue", {
      precision: 18,
      scale: 2,
    }).notNull(),
    averageOrderValue: decimal("averageOrderValue", {
      precision: 18,
      scale: 2,
    }).notNull(),
    totalItems: decimal("totalItems", { precision: 18, scale: 3 }).notNull(),
    averageItemsPerOrder: decimal("averageItemsPerOrder", {
      precision: 18,
      scale: 6,
    }).notNull(),
    uniqueProducts: int("uniqueProducts").notNull(),
    activeMonths: int("activeMonths").notNull(),
    purchaseCount: int("purchaseCount").notNull(),
    averageQuantityPerOrder: decimal("averageQuantityPerOrder", {
      precision: 18,
      scale: 6,
    }).notNull(),
    averageDaysBetweenOrders: decimal("averageDaysBetweenOrders", {
      precision: 18,
      scale: 6,
    }),
    purchaseIntervalVariance: decimal("purchaseIntervalVariance", {
      precision: 20,
      scale: 6,
    }),
    firstPurchaseDate: timestamp("firstPurchaseDate").notNull(),
    lastPurchaseDate: timestamp("lastPurchaseDate").notNull(),
    customerLifetimeDays: int("customerLifetimeDays").notNull(),
    inactiveDays: int("inactiveDays").notNull(),
    returnCount: int("returnCount").notNull(),
    returnQuantity: decimal("returnQuantity", {
      precision: 18,
      scale: 3,
    }).notNull(),
    returnValue: decimal("returnValue", { precision: 18, scale: 2 }).notNull(),
    returnRate: decimal("returnRate", { precision: 16, scale: 6 }).notNull(),
    cancellationCount: int("cancellationCount").notNull(),
    cancellationRate: decimal("cancellationRate", {
      precision: 16,
      scale: 6,
    }).notNull(),
    productDiversity: decimal("productDiversity", {
      precision: 16,
      scale: 6,
    }).notNull(),
    purchasesLast7d: int("purchasesLast7d").notNull(),
    purchasesLast30d: int("purchasesLast30d").notNull(),
    purchasesLast60d: int("purchasesLast60d").notNull(),
    purchasesLast90d: int("purchasesLast90d").notNull(),
    spendLast30d: decimal("spendLast30d", {
      precision: 18,
      scale: 2,
    }).notNull(),
    spendLast60d: decimal("spendLast60d", {
      precision: 18,
      scale: 2,
    }).notNull(),
    spendLast90d: decimal("spendLast90d", {
      precision: 18,
      scale: 2,
    }).notNull(),
    ordersLast30d: int("ordersLast30d").notNull(),
    ordersLast60d: int("ordersLast60d").notNull(),
    ordersLast90d: int("ordersLast90d").notNull(),
    recentVsPreviousOrderRate: decimal("recentVsPreviousOrderRate", {
      precision: 16,
      scale: 6,
    }).notNull(),
    recentVsPreviousSpend: decimal("recentVsPreviousSpend", {
      precision: 16,
      scale: 6,
    }).notNull(),
    recentVsPreviousQuantity: decimal("recentVsPreviousQuantity", {
      precision: 16,
      scale: 6,
    }).notNull(),
    acquisitionMonth: varchar("acquisitionMonth", { length: 7 }).notNull(),
    acquisitionQuarter: varchar("acquisitionQuarter", { length: 7 }).notNull(),
    cohortMonth: varchar("cohortMonth", { length: 7 }).notNull(),
    customerAgeAtCutoff: int("customerAgeAtCutoff").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    snapshotUnique: uniqueIndex("customer_feature_snapshot_unique").on(
      table.runId,
      table.customerId
    ),
    customerIndex: index("customer_feature_snapshot_customer_idx").on(
      table.customerId,
      table.cutoffAt
    ),
    runIndex: index("customer_feature_snapshot_run_idx").on(table.runId),
  })
);

export type CustomerFeatureRun = typeof customerFeatureRuns.$inferSelect;
export type CustomerFeatureSnapshot =
  typeof customerFeatureSnapshots.$inferSelect;

export const customerBehaviorLabels = mysqlTable(
  "customer_behavior_labels",
  {
    id: int("id").autoincrement().primaryKey(),
    snapshotId: int("snapshotId")
      .notNull()
      .references(() => customerFeatureSnapshots.id),
    runId: int("runId")
      .notNull()
      .references(() => customerFeatureRuns.id),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    customerId: int("customerId")
      .notNull()
      .references(() => customers.id),
    cutoffAt: timestamp("cutoffAt").notNull(),
    horizonEndAt: timestamp("horizonEndAt").notNull(),
    labelVersion: varchar("labelVersion", { length: 80 }).notNull(),
    inactivityLabel: int("inactivityLabel").notNull(),
    futureOrderCount: int("futureOrderCount").notNull(),
    labelable: int("labelable").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    snapshotUnique: uniqueIndex("customer_behavior_labels_snapshot_unique").on(
      table.snapshotId
    ),
    customerCutoffUnique: uniqueIndex(
      "customer_behavior_labels_customer_cutoff_unique"
    ).on(table.customerId, table.cutoffAt, table.labelVersion),
    runIndex: index("customer_behavior_labels_run_idx").on(table.runId),
  })
);

export const churnModelRuns = mysqlTable(
  "churn_model_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    runKey: varchar("runKey", { length: 220 }).notNull(),
    modelName: varchar("modelName", { length: 80 }).notNull(),
    modelVersion: varchar("modelVersion", { length: 80 }).notNull(),
    featureVersion: varchar("featureVersion", { length: 80 }).notNull(),
    labelVersion: varchar("labelVersion", { length: 80 }).notNull(),
    datasetVersion: varchar("datasetVersion", { length: 200 }).notNull(),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    trainStartAt: timestamp("trainStartAt").notNull(),
    trainEndAt: timestamp("trainEndAt").notNull(),
    validationStartAt: timestamp("validationStartAt").notNull(),
    validationEndAt: timestamp("validationEndAt").notNull(),
    testStartAt: timestamp("testStartAt").notNull(),
    testEndAt: timestamp("testEndAt").notNull(),
    threshold: decimal("threshold", { precision: 12, scale: 8 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    configJson: text("configJson").notNull(),
    artifactPath: varchar("artifactPath", { length: 300 }).notNull(),
    artifactSha256: varchar("artifactSha256", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runKeyUnique: uniqueIndex("churn_model_runs_key_unique").on(table.runKey),
    provenanceIndex: index("churn_model_runs_provenance_idx").on(
      table.provenanceId
    ),
  })
);

export const churnModelMetrics = mysqlTable(
  "churn_model_metrics",
  {
    id: int("id").autoincrement().primaryKey(),
    modelRunId: int("modelRunId")
      .notNull()
      .references(() => churnModelRuns.id),
    split: varchar("split", { length: 30 }).notNull(),
    metricName: varchar("metricName", { length: 80 }).notNull(),
    metricValue: decimal("metricValue", { precision: 18, scale: 10 }),
    metricJson: text("metricJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    metricUnique: uniqueIndex("churn_model_metrics_unique").on(
      table.modelRunId,
      table.split,
      table.metricName
    ),
    runIndex: index("churn_model_metrics_run_idx").on(table.modelRunId),
  })
);

export const churnPredictions = mysqlTable(
  "churn_predictions",
  {
    id: int("id").autoincrement().primaryKey(),
    modelRunId: int("modelRunId")
      .notNull()
      .references(() => churnModelRuns.id),
    snapshotId: int("snapshotId")
      .notNull()
      .references(() => customerFeatureSnapshots.id),
    customerId: int("customerId")
      .notNull()
      .references(() => customers.id),
    cutoffAt: timestamp("cutoffAt").notNull(),
    rawProbability: decimal("rawProbability", {
      precision: 12,
      scale: 8,
    }).notNull(),
    calibratedProbability: decimal("calibratedProbability", {
      precision: 12,
      scale: 8,
    }).notNull(),
    predictedClass: int("predictedClass").notNull(),
    threshold: decimal("threshold", { precision: 12, scale: 8 }).notNull(),
    predictionVersion: varchar("predictionVersion", { length: 80 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    predictionUnique: uniqueIndex("churn_predictions_unique").on(
      table.modelRunId,
      table.snapshotId
    ),
    customerIndex: index("churn_predictions_customer_idx").on(
      table.customerId,
      table.cutoffAt
    ),
    runIndex: index("churn_predictions_run_idx").on(table.modelRunId),
  })
);

export type CustomerBehaviorLabel = typeof customerBehaviorLabels.$inferSelect;
export type ChurnModelRun = typeof churnModelRuns.$inferSelect;
export type ChurnModelMetric = typeof churnModelMetrics.$inferSelect;
export type ChurnPrediction = typeof churnPredictions.$inferSelect;

export const revenueIntelligenceRuns = mysqlTable(
  "revenue_intelligence_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    runKey: varchar("runKey", { length: 240 }).notNull(),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    modelRunId: int("modelRunId")
      .notNull()
      .references(() => churnModelRuns.id),
    featureVersion: varchar("featureVersion", { length: 80 }).notNull(),
    cutoffAt: timestamp("cutoffAt").notNull(),
    horizonDays: int("horizonDays").notNull(),
    methodologyVersion: varchar("methodologyVersion", {
      length: 100,
    }).notNull(),
    revenueSemantics: text("revenueSemantics").notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runKeyUnique: uniqueIndex("revenue_intelligence_runs_key_unique").on(
      table.runKey
    ),
    provenanceIndex: index("revenue_intelligence_runs_provenance_idx").on(
      table.provenanceId
    ),
    modelIndex: index("revenue_intelligence_runs_model_idx").on(
      table.modelRunId
    ),
  })
);

export const customerValueSnapshots = mysqlTable(
  "customer_value_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => revenueIntelligenceRuns.id),
    snapshotId: int("snapshotId")
      .notNull()
      .references(() => customerFeatureSnapshots.id),
    customerId: int("customerId")
      .notNull()
      .references(() => customers.id),
    modelRunId: int("modelRunId")
      .notNull()
      .references(() => churnModelRuns.id),
    cutoffAt: timestamp("cutoffAt").notNull(),
    featureVersion: varchar("featureVersion", { length: 80 }).notNull(),
    methodologyVersion: varchar("methodologyVersion", {
      length: 100,
    }).notNull(),
    horizonDays: int("horizonDays").notNull(),
    historicalGrossRevenue: decimal("historicalGrossRevenue", {
      precision: 18,
      scale: 2,
    }).notNull(),
    historicalNetRevenue: decimal("historicalNetRevenue", {
      precision: 18,
      scale: 2,
    }).notNull(),
    returnValue: decimal("returnValue", { precision: 18, scale: 2 }).notNull(),
    orderCount: int("orderCount").notNull(),
    averageOrderValue: decimal("averageOrderValue", {
      precision: 18,
      scale: 2,
    }).notNull(),
    purchaseFrequency: decimal("purchaseFrequency", {
      precision: 16,
      scale: 6,
    }).notNull(),
    lifetimeActivityDays: int("lifetimeActivityDays").notNull(),
    calibratedChurnProbability: decimal("calibratedChurnProbability", {
      precision: 12,
      scale: 8,
    }).notNull(),
    expectedFutureValue: decimal("expectedFutureValue", {
      precision: 18,
      scale: 2,
    }).notNull(),
    behavioralClv: decimal("behavioralClv", {
      precision: 18,
      scale: 2,
    }).notNull(),
    revenueAtRisk: decimal("revenueAtRisk", {
      precision: 18,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    snapshotUnique: uniqueIndex(
      "customer_value_snapshots_run_snapshot_unique"
    ).on(table.runId, table.snapshotId),
    customerUnique: uniqueIndex(
      "customer_value_snapshots_run_customer_unique"
    ).on(table.runId, table.customerId),
    cutoffIndex: index("customer_value_snapshots_customer_cutoff_idx").on(
      table.customerId,
      table.cutoffAt
    ),
    modelIndex: index("customer_value_snapshots_model_idx").on(
      table.modelRunId
    ),
  })
);

export type RevenueIntelligenceRun =
  typeof revenueIntelligenceRuns.$inferSelect;
export type CustomerValueSnapshot = typeof customerValueSnapshots.$inferSelect;

export const retentionRecommendationRuns = mysqlTable(
  "retention_recommendation_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    runKey: varchar("runKey", { length: 260 }).notNull(),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    modelRunId: int("modelRunId")
      .notNull()
      .references(() => churnModelRuns.id),
    explanationRunId: int("explanationRunId").notNull(),
    valueRunId: int("valueRunId")
      .notNull()
      .references(() => revenueIntelligenceRuns.id),
    featureVersion: varchar("featureVersion", { length: 80 }).notNull(),
    cutoffAt: timestamp("cutoffAt").notNull(),
    methodologyVersion: varchar("methodologyVersion", {
      length: 100,
    }).notNull(),
    rationaleVersion: varchar("rationaleVersion", { length: 100 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runKeyUnique: uniqueIndex("retention_recommendation_runs_key_unique").on(
      table.runKey
    ),
    provenanceIndex: index("retention_recommendation_runs_provenance_idx").on(
      table.provenanceId
    ),
    modelIndex: index("retention_recommendation_runs_model_idx").on(
      table.modelRunId
    ),
    valueIndex: index("retention_recommendation_runs_value_idx").on(
      table.valueRunId
    ),
  })
);

export const customerRetentionRecommendations = mysqlTable(
  "customer_retention_recommendations",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => retentionRecommendationRuns.id),
    customerId: int("customerId")
      .notNull()
      .references(() => customers.id),
    snapshotId: int("snapshotId")
      .notNull()
      .references(() => customerFeatureSnapshots.id),
    modelRunId: int("modelRunId")
      .notNull()
      .references(() => churnModelRuns.id),
    explanationRunId: int("explanationRunId").notNull(),
    explanationId: int("explanationId").notNull(),
    valueRunId: int("valueRunId")
      .notNull()
      .references(() => revenueIntelligenceRuns.id),
    cutoffAt: timestamp("cutoffAt").notNull(),
    featureVersion: varchar("featureVersion", { length: 80 }).notNull(),
    methodologyVersion: varchar("methodologyVersion", {
      length: 100,
    }).notNull(),
    priorityScore: decimal("priorityScore", {
      precision: 12,
      scale: 6,
    }).notNull(),
    priorityBand: varchar("priorityBand", { length: 30 }).notNull(),
    recommendedAction: varchar("recommendedAction", { length: 100 }).notNull(),
    rationale: text("rationale").notNull(),
    supportingSignals: text("supportingSignals").notNull(),
    interventionCost: decimal("interventionCost", {
      precision: 18,
      scale: 2,
    }),
    expectedBenefit: decimal("expectedBenefit", {
      precision: 18,
      scale: 2,
    }),
    benefitEvidence: varchar("benefitEvidence", { length: 120 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    customerRunUnique: uniqueIndex(
      "customer_retention_recommendations_run_customer_unique"
    ).on(table.runId, table.customerId),
    snapshotIndex: index("customer_retention_recommendations_snapshot_idx").on(
      table.snapshotId
    ),
    priorityIndex: index("customer_retention_recommendations_priority_idx").on(
      table.runId,
      table.priorityScore
    ),
    modelIndex: index("customer_retention_recommendations_model_idx").on(
      table.modelRunId
    ),
  })
);

export type RetentionRecommendationRun =
  typeof retentionRecommendationRuns.$inferSelect;
export type CustomerRetentionRecommendation =
  typeof customerRetentionRecommendations.$inferSelect;

export const modelExplanationRuns = mysqlTable(
  "model_explanation_runs",
  {
    id: int("id").primaryKey(),
    runKey: varchar("runKey", { length: 260 }).notNull(),
    modelRunId: int("modelRunId")
      .notNull()
      .references(() => churnModelRuns.id),
    featureVersion: varchar("featureVersion", { length: 80 }).notNull(),
    explainerType: varchar("explainerType", { length: 120 }).notNull(),
    explainerVersion: varchar("explainerVersion", { length: 80 }).notNull(),
    outputSpace: varchar("outputSpace", { length: 80 }).notNull(),
    topN: int("topN").notNull(),
    featureCount: int("featureCount").notNull(),
    configJson: text("configJson").notNull(),
    artifactPath: varchar("artifactPath", { length: 300 }).notNull(),
    artifactSha256: varchar("artifactSha256", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  table => ({
    runKeyUnique: uniqueIndex("model_explanation_runs_key_unique").on(
      table.runKey
    ),
  })
);

export const customerExplanations = mysqlTable("customer_explanations", {
  id: int("id").primaryKey(),
  explanationRunId: int("explanationRunId")
    .notNull()
    .references(() => modelExplanationRuns.id),
  modelRunId: int("modelRunId")
    .notNull()
    .references(() => churnModelRuns.id),
  snapshotId: int("snapshotId")
    .notNull()
    .references(() => customerFeatureSnapshots.id),
  customerId: int("customerId")
    .notNull()
    .references(() => customers.id),
  cutoffAt: timestamp("cutoffAt").notNull(),
  rawProbability: decimal("rawProbability", {
    precision: 12,
    scale: 8,
  }).notNull(),
  calibratedProbability: decimal("calibratedProbability", {
    precision: 12,
    scale: 8,
  }).notNull(),
  predictedClass: int("predictedClass").notNull(),
  baseValue: decimal("baseValue", { precision: 18, scale: 10 }).notNull(),
  modelOutput: decimal("modelOutput", { precision: 18, scale: 10 }).notNull(),
  additivityError: decimal("additivityError", {
    precision: 18,
    scale: 12,
  }).notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export const customerExplanationFeatures = mysqlTable(
  "customer_explanation_features",
  {
    id: int("id").autoincrement().primaryKey(),
    explanationId: int("explanationId")
      .notNull()
      .references(() => customerExplanations.id),
    featureName: varchar("featureName", { length: 120 }).notNull(),
    featureValue: decimal("featureValue", { precision: 18, scale: 10 }),
    isMissing: int("isMissing").notNull().default(0),
    shapValue: decimal("shapValue", { precision: 18, scale: 10 }).notNull(),
    contributionDirection: varchar("contributionDirection", {
      length: 30,
    }).notNull(),
    rank: int("rank").notNull(),
  },
  table => ({
    featureUnique: uniqueIndex(
      "customer_explanation_features_unique"
    ).on(table.explanationId, table.featureName),
  })
);

export const modelMonitoringRuns = mysqlTable(
  "model_monitoring_runs",
  {
    id: int("id").primaryKey(),
    runKey: varchar("runKey", { length: 260 }).notNull(),
    modelRunId: int("modelRunId")
      .notNull()
      .references(() => churnModelRuns.id),
    provenanceId: int("provenanceId")
      .notNull()
      .references(() => dataProvenance.id),
    modelVersion: varchar("modelVersion", { length: 80 }).notNull(),
    featureVersion: varchar("featureVersion", { length: 80 }).notNull(),
    snapshotCutoffAt: timestamp("snapshotCutoffAt").notNull(),
    referenceStartAt: timestamp("referenceStartAt").notNull(),
    referenceEndAt: timestamp("referenceEndAt").notNull(),
    monitoredStartAt: timestamp("monitoredStartAt").notNull(),
    monitoredEndAt: timestamp("monitoredEndAt").notNull(),
    referenceSampleCount: int("referenceSampleCount").notNull(),
    monitoredSampleCount: int("monitoredSampleCount").notNull(),
    performanceSampleCount: int("performanceSampleCount").notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    performanceStatus: varchar("performanceStatus", { length: 40 }).notNull(),
    statusReason: text("statusReason").notNull(),
    methodologyVersion: varchar("methodologyVersion", { length: 80 }).notNull(),
    configJson: text("configJson").notNull(),
    executedAt: timestamp("executedAt").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  table => ({
    runKeyUnique: uniqueIndex("model_monitoring_runs_key_unique").on(
      table.runKey
    ),
  })
);

export const modelMonitoringFindings = mysqlTable(
  "model_monitoring_findings",
  {
    id: int("id").primaryKey(),
    monitoringRunId: int("monitoringRunId")
      .notNull()
      .references(() => modelMonitoringRuns.id),
    category: varchar("category", { length: 60 }).notNull(),
    metricName: varchar("metricName", { length: 120 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    metricValue: decimal("metricValue", { precision: 18, scale: 10 }),
    referenceValue: decimal("referenceValue", { precision: 18, scale: 10 }),
    threshold: decimal("threshold", { precision: 18, scale: 10 }),
    sampleCount: int("sampleCount").notNull(),
    details: text("details").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  }
);

export const monitoringRuns = mysqlTable(
  "monitoring_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    runKey: varchar("runKey", { length: 220 }).notNull(),
    monitoringVersion: varchar("monitoringVersion", { length: 80 }).notNull(),
    modelRunId: int("modelRunId").references(() => churnModelRuns.id),
    baselineCutoffAt: timestamp("baselineCutoffAt"),
    currentCutoffAt: timestamp("currentCutoffAt"),
    status: varchar("status", { length: 40 }).notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runKeyUnique: uniqueIndex("monitoring_runs_key_unique").on(table.runKey),
    modelIndex: index("monitoring_runs_model_idx").on(table.modelRunId),
  })
);

export const monitoringMetrics = mysqlTable(
  "monitoring_metrics",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => monitoringRuns.id),
    metricType: varchar("metricType", { length: 40 }).notNull(),
    metricName: varchar("metricName", { length: 120 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    metricValue: decimal("metricValue", { precision: 18, scale: 10 }),
    details: text("details").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    metricUnique: uniqueIndex("monitoring_metrics_unique").on(
      table.runId,
      table.metricType,
      table.metricName
    ),
    runIndex: index("monitoring_metrics_run_idx").on(table.runId),
  })
);

export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type MonitoringMetric = typeof monitoringMetrics.$inferSelect;
