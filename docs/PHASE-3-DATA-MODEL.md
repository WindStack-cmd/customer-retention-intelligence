# Phase 3 Database Architecture — Pulseboard Retention Foundation

## Scope

Phase 3 adds a provenance-preserving MySQL/TiDB data model around the actual Phase 2 UCI Online Retail processed and normalized CSV outputs. It does not replace the existing authentication user table, connect real database metrics to the dashboard, or implement churn, ML, CLV, recommendations, GenAI, or deployment.

## Layers

| Layer                                 | Table(s)                                                      | Purpose                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source/staging                        | `retail_source_rows`                                          | Preserve every normalized source row, including missing `CustomerID`, duplicate rows, cancellations, returns, and price anomalies.                         |
| Provenance/quality                    | `data_provenance`, `data_quality_runs`, `data_quality_issues` | Preserve source checksums, transformation version, run counts, warnings, and traceable issue descriptions.                                                 |
| Customer-linked analytical foundation | `customers`, `orders`, `invoice_items`, `products`            | Support customer, invoice, line-item, product, purchase-frequency, inactivity, and future feature queries only for rows with a source customer identifier. |
| Application/auth                      | `users`                                                       | Existing Manus authentication identity table; unrelated to source customer identity.                                                                       |

Rows without `CustomerID` are not converted into fake customers and therefore do not enter `customers`, `orders`, or `invoice_items`. They remain available in `retail_source_rows` with `sourceCustomerId = NULL` when the staging layer is loaded.

## ER relationships

```text
data_provenance 1 ────< data_quality_runs 1 ────< data_quality_issues
       │                         │
       ├────────< customers      ├────────< orders >──────── 0..1 customers
       ├────────< products       ├────────< invoice_items >── products
       ├────────< orders          ├────────< retail_source_rows
       ├────────< invoice_items   └────────< invoice_items
       └────────< retail_source_rows

orders 1 ────< invoice_items
```

The application-facing relationship is **customer → orders → invoice_items**. `products` uses the source `StockCode` as its stable natural key; no artificial product identity is inferred beyond the database surrogate primary key. `retail_source_rows` intentionally does not foreign-key to customer, order, or product because it must preserve rows that cannot safely enter those analytical entities.

## Table responsibilities and keys

| Table                 | Primary key | Natural/unique key    | Important foreign keys                                   | Important indexes                    |
| --------------------- | ----------- | --------------------- | -------------------------------------------------------- | ------------------------------------ |
| `data_provenance`     | `id`        | `sourceSha256`        | None                                                     | dataset name                         |
| `data_quality_runs`   | `id`        | `runKey`              | `provenanceId`                                           | provenance                           |
| `data_quality_issues` | `id`        | No global natural key | `runId`                                                  | run, issue type                      |
| `customers`           | `id`        | `sourceCustomerId`    | `provenanceId`                                           | last activity, provenance            |
| `products`            | `id`        | `sourceStockCode`     | `provenanceId`                                           | provenance                           |
| `orders`              | `id`        | `sourceInvoiceId`     | nullable `customerId`, `provenanceId`, `ingestionRunId`  | customer/date, provenance            |
| `invoice_items`       | `id`        | `sourceRowHash`       | `orderId`, `productId`, `provenanceId`, `ingestionRunId` | order, product, provenance           |
| `retail_source_rows`  | `id`        | `sourceRowHash`       | `provenanceId`, `ingestionRunId`                         | invoice, source customer, provenance |

The current source is a single UCI dataset, so source-level natural keys are globally unique in this Phase 3 schema. If future sources are loaded, the natural-key strategy should be revisited to include a source namespace rather than silently merging unrelated identifiers.

## Actual Phase 2 compatibility

The importer consumes the actual Phase 2 fields:

```text
_row_number, InvoiceNo, StockCode, Description, Quantity, InvoiceDate,
UnitPrice, CustomerID, Country, invoice_is_cancellation, quantity_valid,
unit_price_valid, invoice_date_valid, line_revenue_gbp
```

`retail_source_rows` stores the normalized/staging representation, including nullable typed values and validity flags. `invoice_items` stores the 406,829 customer-linked processed rows. `customers`, `products`, and `orders` are derived from that same processed file using deterministic source identifiers.

## Revenue semantics

`lineRevenue` is the Phase 2 derived value `Quantity × UnitPrice`, stored as a decimal with two fractional places in GBP. It is a **line-value proxy**, not a claim of final recognized revenue, profit, margin, or cash collection.

The schema preserves `isCancellation` and signed `quantity`; it does not silently classify all negative quantities as returns or remove them. A future analytical layer may define:

- gross positive sales from qualifying non-cancellation lines;
- cancellation/return value from cancellation-marked or negative-quantity lines;
- net line value as an explicitly documented signed aggregation;
- revenue-at-risk only after choosing and documenting which of those measures is appropriate.

Negative and zero unit prices remain in the source/staging layer and are represented in `data_quality_issues`. They must not silently become normal revenue.

## Provenance and lineage

The Phase 2 quality report supplies the UCI dataset name, official URL, source workbook name, source checksum, archive checksum, retrieval timestamp, row counts, warning counts, and transformation notes. The importer stores those fields in `data_provenance` and references the resulting row from every analytical and staging table. `data_quality_runs` stores the Phase 2 quality status and counts under a deterministic run key:

```text
uci-online-retail:<source-sha256>:phase2-stdlib-v1
```

Each source row receives a deterministic SHA-256 key based on the source workbook checksum and Phase 2 `_row_number`. That key is shared by `retail_source_rows` and `invoice_items`, preserving source-to-processed lineage without inventing a new business transaction identifier.

## Import behavior

`pnpm db:import` reads the Phase 2 processed and normalized CSVs as streams. It uses parameterized SQL, 50-row source batches, and validated 500-row invoice-item batches, committing each batch so TiDB query memory remains bounded. The importer is resumable: an interrupted run leaves the deterministic `data_quality_runs` row, and a later run reuses it, verifies completed dimensions before reusing their mappings, and skips duplicate source rows/items through unique deterministic hashes.

A completed run is recognized only when database counts equal 541,909 source rows and 406,829 processed invoice items. If a run exists but is incomplete, the importer resumes rather than appending a second run or inventing a new set of records.

## Phase 3 boundary

This foundation structurally supports customer spend, order counts, last activity, purchase frequency, product history, inactivity cohorts, future churn labeling, and later ML features. It does not calculate churn risk or replace the dashboard's synthetic/demo metrics. The dashboard remains clearly synthetic until a later phase proves database-backed metrics against reconciled analytical definitions.
