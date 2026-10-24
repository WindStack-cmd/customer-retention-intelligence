# PHASE 4 — ANALYTICAL FEATURE ENGINEERING REPORT

## Status

**COMPLETE.** Phase 4 creates a versioned, provenance-linked customer feature run for the completed UCI Online Retail import. The generator uses a fixed historical cutoff, excludes all transactions after that cutoff from feature calculations, preserves return and cancellation behavior, and writes one deterministic snapshot per eligible customer. A separate observed inactivity proxy is defined for supervised-label work but is not persisted in the feature table, preventing the future outcome from being mixed into the feature vector.

No money, paid service, or external API is required. The implementation uses the existing local project, configured MySQL/TiDB database, and the already-loaded open dataset.

## Analytical time semantics

| Semantic            | Definition                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Source timeline     | `2010-12-01 08:26:00` through `2011-12-09 12:50:00` UTC-normalized database timestamps, based on the imported order table |
| Observation cutoff  | `2011-11-09 23:59:59`                                                                                                     |
| Observation window  | `2010-12-01 00:00:00` through the inclusive cutoff                                                                        |
| Label horizon       | 30 calendar days after the cutoff, represented as `(cutoff, cutoff + 30 days]`                                            |
| Feature eligibility | Customer must have at least one imported order at or before the cutoff                                                    |
| Feature version     | `phase4-rfm-behavioral-v1`                                                                                                |
| Source run          | `30001`                                                                                                                   |
| Provenance record   | `30001`                                                                                                                   |

The cutoff is intentionally earlier than the source maximum so that a forward-looking behavioral outcome can be evaluated without using future transactions as predictors. A transaction exactly at the cutoff is included in the observation window. A transaction exactly at the horizon endpoint is included in the forward label window. Rolling feature windows use the same convention: `date > cutoff - window` and `date <= cutoff`.

## Behavioral churn proxy

The Phase 4 behavioral proxy is **observed inactivity within the forward horizon**. For a customer with an eligible pre-cutoff history:

> `observedInactivityProxy = 0` when the customer has at least one order in `(2011-11-09 23:59:59, 2011-12-09 23:59:59]`; otherwise `observedInactivityProxy = 1`.

This is an observed behavior label, not a contractual churn truth, cancellation probability, customer intent, or causal estimate. Customers without a pre-cutoff history are not included in the feature snapshot population and must not be silently assigned an inactivity label. The proxy is deliberately calculated outside the feature table so later modeling code cannot accidentally train on the future outcome as an input feature.

At the generated cutoff, 4,122 of 4,372 imported customers had eligible history and received snapshots. Among those snapshot customers, 1,426 had an order during the 30-day horizon and 2,696 had no observed order during the horizon. The full source has 1,676 distinct customers with a post-cutoff order in the horizon; the difference consists of customers whose first imported order occurs after the observation cutoff and therefore have no Phase 4 feature snapshot.

## Feature run and data lineage

| Field                       | Value                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Feature run ID              | `1`                                                                                                                            |
| Run key                     | `phase4:43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d:phase4-rfm-behavioral-v1:2011-11-09T23:59:59.000Z:30` |
| Feature snapshots           | `4,122`                                                                                                                        |
| Distinct snapshot customers | `4,122`                                                                                                                        |
| Source SHA-256              | `43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d`                                                             |
| Transformation lineage      | `phase2-stdlib-v1` in the upstream provenance record                                                                           |

The run record is linked to `data_provenance`, and every snapshot is linked to both the run and the same provenance record. The unique key `(runId, customerId)` makes reruns idempotent. A rerun with the same source hash, cutoff, horizon, and feature version resolves to the existing run key and does not create duplicate snapshots.

## Feature dictionary

The feature table is customer-at-cutoff grain. Monetary fields use the existing Phase 3 line-value convention, `Quantity × UnitPrice`, represented by the imported `lineRevenue`. These values are analytical line-value proxies, not accounting revenue, profit, margin, or cash collection.

| Feature                                                                       | Definition                                                                                                                     | Leakage-safe timing     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `daysSinceLastPurchase`                                                       | Whole days from the last eligible order to cutoff                                                                              | Eligible orders only    |
| `totalOrders`                                                                 | Count of eligible orders                                                                                                       | `invoiceDate <= cutoff` |
| `purchaseFrequency`                                                           | Orders divided by customer age in 30-day units, with a minimum denominator of one                                              | Eligible orders only    |
| `totalGrossValue`                                                             | Sum of positive eligible line values; negative lines contribute zero                                                           | Eligible items only     |
| `totalNetValue`                                                               | Signed sum of eligible line values, including returns/cancellations                                                            | Eligible items only     |
| `averageOrderValue`                                                           | Signed value divided by eligible order count                                                                                   | Eligible items only     |
| `totalItems`                                                                  | Signed quantity sum                                                                                                            | Eligible items only     |
| `averageItemsPerOrder`                                                        | Absolute quantity sum divided by order count                                                                                   | Eligible items only     |
| `uniqueProducts`                                                              | Count of distinct eligible product IDs                                                                                         | Eligible items only     |
| `activeMonths`                                                                | Count of distinct `YYYY-MM` months containing an eligible order                                                                | Eligible orders only    |
| `purchaseCount`                                                               | Count of eligible invoice-item rows                                                                                            | Eligible items only     |
| `averageQuantityPerOrder`                                                     | Signed quantity sum divided by order count                                                                                     | Eligible items only     |
| `averageDaysBetweenOrders`                                                    | Mean whole-day interval between chronologically ordered eligible orders                                                        | Eligible orders only    |
| `purchaseIntervalVariance`                                                    | Population variance of order intervals in days                                                                                 | Eligible orders only    |
| `firstPurchaseDate`                                                           | Earliest eligible order date                                                                                                   | Eligible orders only    |
| `lastPurchaseDate`                                                            | Latest eligible order date                                                                                                     | Eligible orders only    |
| `customerLifetimeDays`                                                        | Whole days between first and last eligible order                                                                               | Eligible orders only    |
| `inactiveDays`                                                                | Whole days between last eligible order and cutoff                                                                              | Eligible orders only    |
| `returnCount`                                                                 | Count of eligible items marked cancellation or having negative quantity                                                        | Eligible items only     |
| `returnQuantity`                                                              | Absolute quantity returned from negative-quantity return/cancellation lines                                                    | Eligible items only     |
| `returnValue`                                                                 | Signed value of return/cancellation lines                                                                                      | Eligible items only     |
| `returnRate`                                                                  | Return-item count divided by eligible item count                                                                               | Eligible items only     |
| `cancellationCount`                                                           | Count of eligible items marked `isCancellation`                                                                                | Eligible items only     |
| `cancellationRate`                                                            | Cancellation-item count divided by eligible item count                                                                         | Eligible items only     |
| `productDiversity`                                                            | Distinct product count divided by eligible item count                                                                          | Eligible items only     |
| `purchasesLast7d`, `purchasesLast30d`, `purchasesLast60d`, `purchasesLast90d` | Distinct eligible orders in each trailing window                                                                               | Strictly cutoff-bounded |
| `spendLast30d`, `spendLast60d`, `spendLast90d`                                | Signed line-value sums in each trailing window                                                                                 | Strictly cutoff-bounded |
| `ordersLast30d`, `ordersLast60d`, `ordersLast90d`                             | Distinct order counts in each trailing window                                                                                  | Strictly cutoff-bounded |
| `recentVsPreviousOrderRate`                                                   | Last-30-day order count divided by preceding 30-day order count; if denominator is zero, the recent count is retained          | Strictly cutoff-bounded |
| `recentVsPreviousSpend`                                                       | Last-30-day spend divided by the absolute preceding-30-day spend; if denominator is zero, recent spend is retained             | Strictly cutoff-bounded |
| `recentVsPreviousQuantity`                                                    | Last-30-day signed quantity divided by absolute preceding-30-day quantity; if denominator is zero, recent quantity is retained | Strictly cutoff-bounded |
| `acquisitionMonth`                                                            | `YYYY-MM` of first eligible order                                                                                              | Eligible orders only    |
| `acquisitionQuarter`                                                          | `YYYY-Qn` of first eligible order                                                                                              | Eligible orders only    |
| `cohortMonth`                                                                 | Same acquisition-month cohort key, retained as an explicit modeling dimension                                                  | Eligible orders only    |
| `customerAgeAtCutoff`                                                         | Whole days from first eligible order to cutoff                                                                                 | Eligible orders only    |

Null interval features are intentional for customers with only one eligible order; there is no valid inter-order interval in that case. Rates and trend ratios use deterministic zero-denominator behavior rather than silently emitting `NaN` or infinity.

## Leakage and integrity verification

The database verification produced the following results for feature run `1`:

| Check                                                 | Result                            |
| ----------------------------------------------------- | --------------------------------- |
| Snapshot rows                                         | `4,122`                           |
| Distinct customers                                    | `4,122`                           |
| Duplicate `(runId, customerId)` groups                | `0`                               |
| Snapshots with `lastPurchaseDate > cutoffAt`          | `0`                               |
| Snapshots with `firstPurchaseDate > lastPurchaseDate` | `0`                               |
| Customers with eligible pre-cutoff orders             | `4,122`                           |
| Customers with future order in full source horizon    | `1,676` distinct source customers |
| Snapshot customers active in the horizon              | `1,426`                           |
| Snapshot customers with observed inactivity           | `2,696`                           |
| Minimum eligible order count                          | `1`                               |
| Maximum eligible order count                          | `208`                             |
| Minimum gross value                                   | `0.00`                            |
| Maximum gross value                                   | `247,885.68`                      |

The generator reads only orders and invoice items whose order timestamp is at or before the cutoff for feature calculation. Future rows are queried only for the separate verification of the behavioral proxy and are never passed into `calculateCustomerFeatures`. The deterministic unit suite also checks that adding a future order cannot change pre-cutoff features.

## Implementation and reproducibility

The pure calculation layer is in `scripts/customer_features.ts`. The database runner is in `scripts/generate_customer_features.ts`, and the reproducible command is:

```bash
pnpm feature:generate
```

The read-only integrity verifier is in `scripts/verify_customer_features.ts` and is run with:

```bash
pnpm feature:verify
```

The runner accepts the following optional environment variables without changing the default analytical contract: `FEATURE_PROVENANCE_ID`, `FEATURE_RUN_ID`, `FEATURE_CUTOFF_AT`, and `FEATURE_HORIZON_DAYS`. The default values are the verified Phase 3 run, the Phase 4 cutoff, and a 30-day horizon. Inserts are performed in batches of 100 snapshots, while the unique constraint and deterministic run key protect reruns.

The storage migration creates `customer_feature_runs` and `customer_feature_snapshots`, adds foreign keys to provenance and customers, and adds indexes for provenance, run, and customer-at-cutoff access. The migration was applied successfully to the configured database before generation.

## Verification completed

The following checks passed after implementation:

- Phase 4 feature unit tests: 4 tests passed.
- TypeScript typecheck: passed.
- ESLint: passed.
- Database generation: completed normally with 4,122 snapshots.
- Database snapshot count and uniqueness checks: passed.
- Cutoff leakage check: passed with zero violations.
- Future-label split check: passed with 1,426 active and 2,696 inactive snapshot customers.
- Reusable database verifier: passed with zero duplicate groups, zero cutoff leakage rows, zero invalid date order rows, zero version mismatches, and zero invalid metric rows.

Phase 4 does not yet train a churn model, produce calibrated probabilities, call an LLM, connect the dashboard to real customer features, or claim causal retention impact. Those are later phases and must consume this versioned, cutoff-safe feature contract rather than recomputing features ad hoc.
