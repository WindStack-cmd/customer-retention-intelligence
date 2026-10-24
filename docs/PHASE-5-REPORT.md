# PHASE 5 — CHURN MODELING & PREDICTION REPORT

## 1. Status

**COMPLETE.** Phase 5 implements and verifies a reproducible, temporally correct, database-backed behavioral inactivity modeling pipeline. No fake labels, predictions, metrics, or synthetic model results were used. Phase 6 has **not** started.

No money, paid service, or external API is required. The implementation uses the local project, the configured MySQL/TiDB database, the already-loaded open dataset, and lightweight CPU-safe Python dependencies.

## 2. Implemented scope

Phase 5 adds versioned behavioral labels, chronological dataset construction, train-only preprocessing, a Logistic Regression baseline, a stronger Random Forest comparison, validation-only Platt calibration, validation-only threshold analysis, local model artifacts, persisted model metadata, metrics, predictions, deterministic tests, and read-only verification. The existing dashboard remains unchanged and continues to represent demo/synthetic dashboard data; the real model is not presented as a dashboard business metric.

## 3. Churn-target definition

The UCI Online Retail source does not contain contractual subscription churn. The Phase 5 target is therefore called **behavioral inactivity / retention risk**. For every customer snapshot, label `1` means no order occurred in `(cutoff, cutoff + 30 days]`; label `0` means at least one order occurred in that interval. Features use only transactions at or before the cutoff. The cutoff itself is included in features and excluded from the future outcome window; the horizon endpoint is included. This is an observed retention-risk proxy, not contractual churn truth, intent, causality, or a financial outcome.

The source timeline is `2010-12-01 08:26:00` through `2011-12-09 12:50:00`. Eight immutable feature runs are available at April 30, May 31, June 30, July 31, August 31, September 30, October 31, and November 9, 2011. The final November 9 cutoff is usable because its complete 30-day outcome window ends December 9, 2011, within the source history.

## 4. Modeling dataset

The dataset contains 26,600 labeled customer snapshots from feature version `phase4-rfm-behavioral-v1` and label version `behavioral-inactivity-30d-v1`. There are 18,557 positive inactivity labels and 8,043 negative labels. There are no unlabeled rows in the persisted modeling dataset. The dataset checksum is `1610d0659938323b5f7c29eaf0dcd7535e14d94268af3dd134cd38c8acb96238`.

The model feature list contains 36 numeric Phase 4 fields. Customer ID, snapshot ID, cutoff timestamp, cohort strings, target fields, and future outcome information are excluded. The feature order is deterministic and persisted in the model configuration.

## 5. Chronological train/validation/test split

| Split      | Cutoff range             |   Rows | Customers | Positive inactivity | Negative inactivity |
| ---------- | ------------------------ | -----: | --------: | ------------------: | ------------------: |
| Train      | 2011-04-30 to 2011-08-31 | 14,810 |     3,360 |     10,629 (71.77%) |      4,181 (28.23%) |
| Validation | 2011-09-30 to 2011-10-31 |  7,668 |     4,010 |      5,232 (68.23%) |      2,436 (31.77%) |
| Test       | 2011-11-09 only          |  4,122 |     4,122 |      2,696 (65.41%) |      1,426 (34.59%) |

The same customer can appear at different historical cutoffs. This is acceptable for prospective snapshot evaluation because each row is evaluated using only its own past, and the split is chronological rather than randomly mixed.

## 6. Models and preprocessing

The baseline is class-balanced Logistic Regression with `C=1.0`, `lbfgs`, `max_iter=1000`, and seed `42`. The stronger comparison is a class-balanced Random Forest with 160 trees, depth 8, minimum leaf size 4, one CPU worker, and seed `42`. Numeric missing values are median-imputed inside the training-fitted pipeline. Logistic Regression standardizes after imputation; Random Forest does not require scaling. No temporal oversampling was used.

Logistic Regression was selected because its validation PR-AUC was `0.83175`, slightly higher than Random Forest at `0.82876`, while remaining simpler to inspect and operate. Random Forest validation Brier score was slightly lower (`0.19863` versus Logistic Regression raw `0.20388`), so the comparison is retained and the selection is documented rather than treated as an arbitrary AI score.

## 7. Validation and test metrics

Metrics below are calculated from real persisted predictions. Calibrated probabilities are evaluated at the validation-selected threshold `0.50`.

| Split      | Probability | ROC-AUC |  PR-AUC |   Brier | Precision |  Recall |      F1 |
| ---------- | ----------- | ------: | ------: | ------: | --------: | ------: | ------: |
| Validation | Raw         | 0.73860 | 0.83175 | 0.20388 |   0.80676 | 0.73012 | 0.76653 |
| Validation | Calibrated  | 0.73860 | 0.83175 | 0.17974 |   0.74090 | 0.95317 | 0.83374 |
| Test       | Raw         | 0.74545 | 0.81607 | 0.20181 |   0.79797 | 0.72960 | 0.76226 |
| Test       | Calibrated  | 0.74545 | 0.81607 | 0.18611 |   0.71886 | 0.95697 | 0.82100 |

Calibrated validation confusion matrix is `[[692, 1744], [245, 4987]]`. Calibrated test confusion matrix is `[[417, 1009], [116, 2580]]`. The ordering is `[[true negative, false positive], [false negative, true positive]]`.

For calibrated ranking metrics, validation Precision@5/10/20% is `0.85677 / 0.86571 / 0.87027`, with Recall@5/10/20% of `0.06288 / 0.12691 / 0.25516`. Test Precision@5/10/20% is `0.84541 / 0.87167 / 0.84970`, with Recall@5/10/20% of `0.06491 / 0.13353 / 0.26001`.

## 8. Calibration and threshold analysis

Platt sigmoid calibration was fitted on the September 30 validation cutoff only. The threshold was selected on October 31 validation data only. Candidate thresholds were `0.20`, `0.30`, `0.40`, `0.50`, `0.60`, and `0.70`:

| Threshold | Validation precision | Validation recall | Validation F1 | Predicted positive count |
| --------: | -------------------: | ----------------: | ------------: | -----------------------: |
|      0.20 |              0.67224 |           0.99733 |       0.80314 |                    3,887 |
|      0.30 |              0.68456 |           0.99313 |       0.81047 |                    3,801 |
|      0.40 |              0.69908 |           0.98511 |       0.81781 |                    3,692 |
|      0.50 |              0.71730 |           0.96069 |       0.82134 |                    3,509 |
|      0.60 |              0.73869 |           0.90954 |       0.81526 |                    3,226 |
|      0.70 |              0.77983 |           0.78817 |       0.78398 |                    2,648 |

The selected threshold is `0.50`, based on maximum validation F1 with deterministic precision and lower-threshold tie-break rules. Phase 5 establishes probability behavior only; action economics and intervention thresholds belong to later phases.

## 9. Persisted artifacts and database changes

The database migration `drizzle/0003_aromatic_frog_thor.sql` adds `customer_behavior_labels`, `churn_model_runs`, `churn_model_metrics`, and `churn_predictions`. Unique keys make label, model-run, metric, and prediction persistence idempotent. The final model run is ID `1`, with 26,600 predictions, 26,600 distinct prediction snapshots, and 106 persisted metrics.

Local artifacts are written under ignored `artifacts/phase5/`:

| Artifact                                        | Purpose                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `modeling_dataset.json`                         | Deterministic exported modeling rows                                                |
| `model_result.json`                             | Split metadata, comparison, metrics, threshold, and artifact references             |
| `predictions.json`                              | Reproducible row-level prediction export                                            |
| `phase5-churn-model-v1-1610d0659938323b.joblib` | Selected model, preprocessing pipeline, calibrator, feature list, and configuration |

The model artifact SHA-256 is `db16a2bc4c6d0458af82c415cefb438a0669959c1aa9666557587250110908fe`. Secrets are not stored in artifacts.

## 10. Leakage, reproducibility, and persistence verification

| Check                                                            |    Result |
| ---------------------------------------------------------------- | --------: |
| Labeled snapshots                                                |    26,600 |
| Duplicate labels                                                 |         0 |
| Duplicate predictions                                            |         0 |
| Distinct prediction snapshots                                    |    26,600 |
| Missing predictions for labeled snapshots                        |         0 |
| Orphan predictions                                               |         0 |
| Probability values outside `[0,1]`                               |         0 |
| Label leakage mismatches against future-window SQL recomputation |         0 |
| Model run-key duplicates                                         |         0 |
| Repeated training dataset checksum                               | identical |
| Repeated model artifact checksum                                 | identical |

Boundary tests cover a transaction exactly at the cutoff, immediately after the cutoff, exactly at the horizon endpoint, and immediately after the horizon. Tests also verify temporal split exclusivity, identifier/target exclusion, train-fitted preprocessing, bounded calibration outputs, and deterministic threshold selection.

## 11. Verification gate

The following checks passed:

- Behavioral target definition and documentation
- Feature cutoff and outcome-window documentation
- Label leakage and boundary tests
- Feature leakage separation
- Modeling dataset generation
- Chronological train/validation/test split
- Logistic Regression training
- Random Forest training and comparison
- ROC-AUC, PR-AUC, precision, recall, F1, confusion matrices, positive support, and predicted-positive counts
- Precision@5%, @10%, and @20%; Recall@5%, @10%, and @20%
- Platt calibration and Brier score comparison
- Validation-only threshold analysis
- Model artifact and metadata persistence
- Model-run, metric, label, and prediction idempotency
- Reproducibility rerun
- Phase 5 Python unit tests
- Existing Phase 0–4 Vitest suite
- TypeScript typecheck
- ESLint
- Prettier formatting
- Drizzle schema validation
- Production build
- Health endpoint
- Application regression checks

## 12. Warnings and limitations

This is a behavioral inactivity model on a historical retail dataset, not a contractual churn model. The source has documented missing customer identifiers, duplicate rows, returns/cancellations, and price/quantity anomalies. The test period is one final cutoff, the data span is short, repeated customers create correlated snapshots, and no fairness or causal-uplift analysis has been performed. The model is not connected to the dashboard business metrics. SHAP, CLV, revenue-at-risk, recommendations, intervention economics, GenAI, MLOps, deployment, and major dashboard changes were intentionally not implemented.

**Phase 6 has not started.**
