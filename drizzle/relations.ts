import { relations } from "drizzle-orm";
import {
  customers,
  dataProvenance,
  dataQualityIssues,
  dataQualityRuns,
  invoiceItems,
  orders,
  products,
  retailSourceRows,
} from "./schema";

export const dataProvenanceRelations = relations(dataProvenance, ({ many }) => ({
  qualityRuns: many(dataQualityRuns),
  customers: many(customers),
  products: many(products),
  orders: many(orders),
  sourceRows: many(retailSourceRows),
  invoiceItems: many(invoiceItems),
}));

export const dataQualityRunRelations = relations(dataQualityRuns, ({ one, many }) => ({
  provenance: one(dataProvenance, { fields: [dataQualityRuns.provenanceId], references: [dataProvenance.id] }),
  issues: many(dataQualityIssues),
  orders: many(orders),
  sourceRows: many(retailSourceRows),
  invoiceItems: many(invoiceItems),
}));

export const dataQualityIssueRelations = relations(dataQualityIssues, ({ one }) => ({
  run: one(dataQualityRuns, { fields: [dataQualityIssues.runId], references: [dataQualityRuns.id] }),
}));

export const customerRelations = relations(customers, ({ one, many }) => ({
  provenance: one(dataProvenance, { fields: [customers.provenanceId], references: [dataProvenance.id] }),
  orders: many(orders),
}));

export const productRelations = relations(products, ({ one, many }) => ({
  provenance: one(dataProvenance, { fields: [products.provenanceId], references: [dataProvenance.id] }),
  invoiceItems: many(invoiceItems),
}));

export const orderRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  provenance: one(dataProvenance, { fields: [orders.provenanceId], references: [dataProvenance.id] }),
  ingestionRun: one(dataQualityRuns, { fields: [orders.ingestionRunId], references: [dataQualityRuns.id] }),
  invoiceItems: many(invoiceItems),
}));

export const sourceRowRelations = relations(retailSourceRows, ({ one }) => ({
  provenance: one(dataProvenance, { fields: [retailSourceRows.provenanceId], references: [dataProvenance.id] }),
  ingestionRun: one(dataQualityRuns, { fields: [retailSourceRows.ingestionRunId], references: [dataQualityRuns.id] }),
}));

export const invoiceItemRelations = relations(invoiceItems, ({ one }) => ({
  order: one(orders, { fields: [invoiceItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [invoiceItems.productId], references: [products.id] }),
  provenance: one(dataProvenance, { fields: [invoiceItems.provenanceId], references: [dataProvenance.id] }),
  ingestionRun: one(dataQualityRuns, { fields: [invoiceItems.ingestionRunId], references: [dataQualityRuns.id] }),
}));
