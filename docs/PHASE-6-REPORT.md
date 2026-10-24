# PHASE 6 — EXPLAINABLE AI / SHAP REPORT

## Status

**COMPLETE.** Phase 6 produces real model-backed SHAP explanations for all 26,600 persisted Phase 5 customer predictions. Phase 7 has not started.

## Methodology

- **Selected model:** Phase 5 Logistic Regression, model run `1`, version `phase5-churn-model-v1`.
- **Feature version:** `phase4-rfm-behavioral-v1`.
- **Explainer:** `shap.LinearExplainer`, SHAP `0.52.0`, with a deterministic independent background of the first 256 chronologically ordered transformed rows.
- **Model input:** the fitted Phase 5 pipeline after median imputation with missing indicators and standardization. The 37 original business features map to 39 transformed columns; indicators exist for `averageDaysBetweenOrders` and `purchaseIntervalVariance`.
- **Stored feature names:** SHAP contributions from missing indicators are aggregated back to their original business feature and recorded with `isMissing`, so consumers do not see opaque preprocessing names.
- **Output space:** raw class-1 Logistic Regression decision-function space, i.e. log-odds. SHAP values are not percentage-point probability changes. Persisted raw and calibrated probabilities remain separate model outputs.
- **Top-N configuration:** `topN=5`; all 37 feature attributions are persisted so later consumers can select positive and negative contributors without recalculating.

SHAP attribution describes how the trained model associates input values with a prediction. It does not prove causation, intervention effects, that changing a feature will reduce risk, or that a customer will definitely become inactive.

## Persistence and provenance

The additive schema migration `drizzle/0004_ambiguous_quentin_quire.sql` adds `model_explanation_runs`, `customer_explanations`, and `customer_explanation_features`. Migration `drizzle/0005_cool_mockingbird.sql` adds the explicit missing-value flag. Uniqueness is enforced on explanation run plus snapshot and explanation plus feature name.

Every explanation is linked to:

- model run `1`
- model version `phase5-churn-model-v1`
- feature version `phase4-rfm-behavioral-v1`
- snapshot and cutoff timestamp
- SHAP explainer/version and output space
- deterministic top-N and transformed-feature configuration

The original SHAP stream was lost after the first persistence session was terminated. Recovery therefore reconstructed the exact Phase 5 Logistic Regression training pipeline from database-exported labeled snapshots, verified reconstructed raw and calibrated probabilities against persisted predictions, and generated SHAP only for the exact missing keys. Existing 527,500 rows were preserved by insert-only upserts.

## Final counts and validation

| Check                                                   |     Result |
| ------------------------------------------------------- | ---------: |
| Explanation runs                                        |          1 |
| Customer explanations                                   |     26,600 |
| SHAP attribution rows                                   |    984,200 |
| Features per explanation                                |         37 |
| Distinct feature names                                  |         37 |
| Duplicate attribution keys                              |          0 |
| Orphan attribution rows                                 |          0 |
| Orphan customer references                              |          0 |
| Prediction/explanation alignment failures               |          0 |
| Cutoff/feature-version alignment failures               |          0 |
| Missing prediction references                           |          0 |
| Maximum SHAP additivity error                           | `3.55e-15` |
| Maximum reconstructed raw-probability difference        |  `5.00e-9` |
| Maximum reconstructed calibrated-probability difference |  `5.00e-9` |

## Artifacts and commands

The targeted recovery implementation is in `pipelines/recover_missing_shap.py` and `scripts/recover_phase6_missing.ts`. The recovery output is local and ignored under `artifacts/phase6-recovery/`. It contains the machine-readable missing-key summary and attribution stream used for the bounded persistence pass.

The focused tests are in `pipelines/test_phase6_recovery.py`. Existing project checks also passed: Vitest regression suite (12 tests), TypeScript, ESLint, Prettier, Drizzle validation, production build, and HTTP health check (`200 OK`).

## Boundary

The synthetic dashboard was not modified or represented as real SHAP data. No CLV, revenue-at-risk, recommendations, GenAI, MLOps, deployment, or Phase 7 work was started.
