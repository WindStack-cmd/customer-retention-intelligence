# PHASE 7 — CLV + REVENUE INTELLIGENCE

## Status

**COMPLETE.** Phase 7 generated real database-backed behavioral customer value and revenue-at-risk results from the verified Phase 4 snapshots and Phase 5 calibrated churn probabilities. Phases 0–6 were not recalculated or modified. Phase 8 was not started.

## Methodology

This dataset has no subscription contracts, contract terms, renewal dates, or contractual margin. The result is therefore **behavioral/purchase-based expected customer value**, not contractual CLV.

For each customer, the generator selects the latest usable Phase 4 snapshot available for the selected Phase 5 model run. The latest cutoff is `2011-11-09T23:59:59Z`; all feature values are already cutoff-safe.

- **Historical gross revenue:** Phase 4 `totalGrossValue`, the sum of positive line revenue only.
- **Historical net revenue:** Phase 4 `totalNetValue`, the signed sum of line revenue including returns and cancellations.
- **Return value:** Phase 4 `returnValue`, the signed non-positive value from items with negative quantity or cancellation status.
- **Average order value:** Phase 4 signed net revenue divided by observed order count.
- **Purchase frequency:** Phase 4 observed orders per 30-day month.
- **Lifetime activity:** Phase 4 customer lifetime/activity days.
- **Expected future value:** `max(0, averageOrderValue) × purchaseFrequency × (horizonDays / 30)`, using a transparent 90-day horizon.
- **Behavioral CLV:** `historicalNetRevenue + expectedFutureValue × (1 − calibratedChurnProbability)`.
- **Revenue at risk:** `expectedFutureValue × calibratedChurnProbability`.
- **Churn probability:** the existing Phase 5 selected model's calibrated probability; churn was not recalculated.

All monetary results are rounded to two decimal places. The methodology is intentionally lightweight and auditable; it is not a BG/NBD, survival, margin, or contractual model.

## Revenue semantics

- Positive line revenue contributes to gross revenue.
- Negative quantities and cancellations are preserved as returns and reduce signed net revenue.
- Missing `CustomerID` rows remain in source provenance/reconciliation but are excluded from customer-linked snapshots and customer value results.
- The 90-day expected-value horizon is an explicit modeling assumption, not a claim about a contractual period.
- Revenue-at-risk is an expected-value exposure, not a guaranteed loss and not an intervention outcome.

## Persistence and provenance

Migration `drizzle/0004_spicy_lila_cheney.sql` adds `revenue_intelligence_runs` and `customer_value_snapshots`. The run records provenance ID, Phase 5 model run ID, feature version, cutoff, horizon, methodology version, status, and serialized revenue semantics. Each customer value row references its run, feature snapshot, customer, and model run.

Generation is bounded in batches of up to 250 rows and uses deterministic run keys plus unique-key upserts. Rerunning the generator produced the same run ID and totals without duplicate rows.

## Final results

| Measure                  |                  Result |
| ------------------------ | ----------------------: |
| Customer value rows      |                   4,122 |
| Distinct customers       |                   4,122 |
| Distinct snapshots       |                   4,122 |
| Snapshot cutoff          | 2011-11-09 23:59:59 UTC |
| Expected future value    |        GBP 3,225,184.89 |
| Revenue at risk          |        GBP 1,576,835.81 |
| Historical gross revenue |        GBP 7,587,541.47 |
| Historical net revenue   |        GBP 7,170,307.94 |

## Validation

- Duplicate customer/snapshot keys: 0.
- Invalid calibrated probabilities: 0.
- Invalid monetary values: 0.
- Invalid positive return values: 0.
- Orphan feature snapshots, customers, or model references: 0.
- Temporal cutoff/feature-version mismatches: 0.
- Historical gross reconciliation to source: exact at GBP 7,587,541.47.
- Historical net reconciliation to source: exact at GBP 7,170,307.94.
- Deterministic idempotent rerun: passed with identical run and totals.

## Verification

Passed:

- Focused Phase 7 Vitest suite: 6 tests.
- Full existing Vitest regression suite: 18 tests.
- TypeScript typecheck.
- ESLint.
- Prettier maintained-file check.
- Drizzle schema/migration check.
- Production build.
- Application health endpoint: HTTP 200.
- Read-only `pnpm value:verify` database integrity and reconciliation verifier.

## Boundary

No retention recommendations, intervention economics, dashboard redesign, GenAI, MLOps, deployment, or Phase 8 work was started.
