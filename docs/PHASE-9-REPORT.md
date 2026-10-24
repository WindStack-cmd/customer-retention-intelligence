# Phase 9 — Production Backend APIs

## Status

**Complete.** Phase 9 adds authenticated, read-only tRPC APIs over the verified Phase 3–8 database records. Existing ingestion, features, models, SHAP explanations, CLV calculations, recommendations, demo UI, and data remain unchanged. No Phase 10 work was started.

## API surface

All Phase 9 procedures are under the authenticated `analytics` router:

| Procedure                     | Purpose                                                                                                                                          | Bounds                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `analytics.executiveOverview` | Real customer count, average churn risk, CLV, revenue at risk, expected future value, priority-band summaries, and model/provenance metadata     | Fixed aggregate query                  |
| `analytics.customers`         | Customer search, country/risk/band filters, deterministic priority sorting, and pagination                                                       | Page 1–10,000; page size 1–100         |
| `analytics.customerDetail`    | Customer identity, feature snapshot, complete churn prediction, CLV/revenue-at-risk, recommendation, top SHAP explanations, and 20 recent orders | One customer; SHAP/orders capped at 20 |
| `analytics.recommendations`   | Priority, action, rationale, supporting signals, benefit-evidence boundary, and run references                                                   | Page 1–10,000; page size 1–100         |
| `analytics.dataQuality`       | Latest 20 quality runs and latest 100 quality issues                                                                                             | Fixed limits                           |
| `analytics.modelRuns`         | Latest 20 model-run metadata records and artifact checksums                                                                                      | Fixed limit                            |

The existing public `retention.overview` procedure remains the clearly labeled synthetic demo layer and was not replaced or silently mixed with production records.

## Security and correctness

- Every Phase 9 procedure uses the existing `protectedProcedure`; unauthenticated callers receive `UNAUTHORIZED`.
- Inputs use Zod validation for positive IDs, bounded pages/page sizes, bounded strings, risk range `[0, 1]`, and enumerated priority bands.
- User input is passed as SQL parameters. No user-controlled table, column, sort, or SQL fragment is accepted.
- SQL uses fixed query shapes and bounded result sets. Customer detail uses three bounded queries in parallel rather than N+1 per feature/order.
- Database failures are logged server-side and returned as a generic `INTERNAL_SERVER_ERROR` message without SQL or credential leakage.
- Responses identify `REAL_DATABASE_RECORDS`; demo data remains explicitly separate.
- APIs expose model/provenance references but no secrets, tokens, passwords, or private authentication fields.
- Recommendation benefit fields preserve the Phase 8 evidence boundary; no intervention effectiveness is claimed.

## Verification

Passed:

- Focused Phase 9 API tests: **6/6**.
- Full Vitest suite: **31/31**.
- TypeScript: **passed**.
- ESLint: **passed**.
- Prettier maintained-file check: **passed**.
- Drizzle schema check: **passed**.
- Production build: **passed**.
- Health endpoint: **HTTP 200**.

The focused tests verified:

- unauthenticated access rejection;
- invalid pagination and risk-filter rejection;
- real executive metrics and metadata;
- bounded pagination and empty search results;
- customer-list/detail consistency;
- complete prediction fields and actual SHAP explanations;
- recommendation supporting signals and evidence limits;
- bounded model and data-quality metadata.

## Implementation files

- `server/analyticsApi.ts` — bounded database query layer and response mapping.
- `server/routers.ts` — authenticated tRPC procedures and generic error boundary.
- `server/analytics.api.test.ts` — database-backed API tests.

No frontend redesign was made in Phase 9.
