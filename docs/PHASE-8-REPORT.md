# Phase 8 — Retention Engine & Recommendations

## Status

**Complete.** Phase 8 adds a deterministic, explainable retention recommendation engine over the verified Phase 5–7 records. No ingestion, feature engineering, model training, SHAP generation, CLV calculation, dashboard redesign, GenAI, MLOps, deployment, or Phase 9 work was started.

## Inputs and provenance

The generated run uses the aligned records already persisted by prior phases:

- **Data provenance:** Phase 3 provenance ID `30001`.
- **Model run:** `churn_model_runs.id = 1`.
- **Feature version:** `phase4-rfm-behavioral-v1`.
- **Explanation run:** `model_explanation_runs.id = 1`, using the completed SHAP explanations.
- **Value run:** `revenue_intelligence_runs.id = 1`, methodology `behavioral-clv-v1`.
- **Cutoff:** inherited from the value run, `2011-11-09T23:59:59Z`.
- **Recommendation run:** `retention_recommendation_runs.id = 1`.
- **Recommendation methodology:** `retention-rules-v1`.
- **Rationale version:** `retention-rationale-v1`.

The recommendation run is keyed by source checksum, model/explanation/value run IDs, feature version, and methodology version. Customer recommendations are unique per recommendation run and customer, and are upserted in bounded batches.

## Prioritization logic

The engine does not rank by churn probability alone. For each customer it computes a deterministic score:

```text
priority score = 100 × (
  0.45 × calibrated churn probability
  + 0.35 × percentile rank of revenue at risk
  + 0.20 × percentile rank of behavioral CLV
)
```

The percentile ranks are calculated over the current aligned customer cohort. Priority bands are:

- **Urgent:** score `>= 75`
- **High:** score `>= 50` and `< 75`
- **Monitor:** score `< 50`

This combines predicted risk, exposed future value, and customer value. Revenue at risk remains a model-derived exposure estimate, not proven recoverable revenue.

## Action rules and explanations

The action rule uses the highest positive persisted SHAP contributor when available:

- Engagement or inactivity signal → **Personalized re-engagement**
- Return, cancellation, or variance signal → **Service follow-up**
- Revenue/value signal → **Relevant offer review**
- No positive SHAP driver available → **Customer health review**
- Monitor band → **Monitor account**

Each record stores the actual churn probability, behavioral CLV, revenue at risk, expected future value, customer activity/return signals, percentile ranks, score weights, and the selected SHAP signal. Missing/imputed SHAP provenance is retained in the supporting signal JSON.

## Intervention economics boundary

No intervention cost, uplift, conversion rate, treatment effect, or guaranteed savings was available in the existing data. Therefore:

- `interventionCost` is `NULL`.
- `expectedBenefit` is `NULL`.
- `benefitEvidence` explicitly states that no experimental uplift or guaranteed savings estimate exists.

The recommendations identify where to focus and what operational action is relevant to the observed signals. They **do not claim that an intervention will save revenue**.

## Persisted results

| Measure                         |        Result |
| ------------------------------- | ------------: |
| Recommendation run              |             1 |
| Customer recommendations        |         4,122 |
| Distinct customers              |         4,122 |
| Urgent                          |           511 |
| High                            |         2,523 |
| Monitor                         |         1,088 |
| Average priority score          | 59.2077033690 |
| Duplicate customer keys         |             0 |
| Duplicate snapshot keys         |             0 |
| Unsupported economics populated |             0 |

## Implementation

- `scripts/retention_recommendations.ts` — pure deterministic scoring and action rules.
- `scripts/generate_retention_recommendations.ts` — bounded, idempotent database generation.
- `scripts/verify_retention_recommendations.ts` — read-only integrity/provenance verifier.
- `scripts/retention_recommendations.test.ts` — focused unit tests.
- `drizzle/0005_careless_the_hunter.sql` — additive Phase 8 persistence migration.

Commands:

```bash
pnpm recommendation:generate
pnpm recommendation:verify
pnpm exec vitest run scripts/retention_recommendations.test.ts
```

## Verification

Passed:

- Focused Phase 8 tests: **7/7**.
- Full Vitest suite: **25/25**.
- TypeScript: **passed**.
- ESLint: **passed**.
- Prettier maintained-file check: **passed**.
- Drizzle schema check: **passed**.
- Production build: **passed**.
- Recommendation verifier: **passed**.
- Idempotency rerun: **passed**; remained at 4,122 recommendations with the same band counts.

Database verifier results:

- Missing customer, snapshot, value, model, or explanation references: **0**.
- Temporal/provenance mismatches: **0**.
- Invalid scores or bands: **0**.
- Empty actions or rationales: **0**.
- Missing core supporting risk/value signals: **0**.
- Future-dated recommendations: **0**.

## Limitations

The recommendations are deterministic policy outputs over historical snapshots and calibrated model outputs. They are not causal treatment recommendations and have not been experimentally validated. The next phase may add an operational UI or experimentation framework, but those are outside Phase 8.
