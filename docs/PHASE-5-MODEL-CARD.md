# Phase 5 Model Card — Behavioral Inactivity Risk

## Model purpose

This model estimates **behavioral inactivity risk** for customers in the UCI Online Retail transaction history. It is intended to support later retention prioritization by ranking customer snapshots according to the probability that no order will occur during the next 30 days.

## Intended use

The model may be used for offline analysis, temporal validation, and future customer-prioritization workflows built on the same feature and label contracts. The persisted probabilities are model outputs, not financial forecasts, contractual churn probabilities, customer intent, or causal treatment effects.

## Non-intended use

The model must not be interpreted as contractual subscription churn, involuntary churn, cancellation propensity, lifetime value, revenue at risk, intervention uplift, or a reason to automatically contact, exclude, or penalize a customer. Those capabilities are outside Phase 5 and require additional validated product and economic logic.

## Training data and target

The source is the imported UCI Online Retail dataset, provenance run `30001`, with transaction dates from `2010-12-01` through `2011-12-09`. The feature version is `phase4-rfm-behavioral-v1`. The target version is `behavioral-inactivity-30d-v1` and is defined as:

> `1` when the customer has no order in the strictly future, horizon-inclusive interval `(feature_cutoff, feature_cutoff + 30 days]`; `0` when at least one order occurs in that interval.

A transaction exactly at the feature cutoff is excluded from the outcome window. A transaction exactly at the 30-day endpoint is included. The target is therefore a **behavioral inactivity / retention-risk proxy**, not contractual churn truth.

## Features and preprocessing

The model uses 36 numeric, cutoff-safe Phase 4 features covering recency, frequency, monetary value, quantity, returns, cancellations, trailing-window activity, trend ratios, and customer age. Customer identifiers, snapshot identifiers, timestamps, cohort strings, target columns, and future outcome fields are excluded. Missing numeric values are median-imputed inside a training-fitted pipeline. Logistic Regression additionally standardizes the imputed matrix; the Random Forest uses the imputed values without scaling.

## Evaluation methodology

Rows are split chronologically, never randomly:

| Split      | Cutoff range                  |   Rows | Positive inactivity | Negative inactivity |
| ---------- | ----------------------------- | -----: | ------------------: | ------------------: |
| Train      | 2011-04-30 through 2011-08-31 | 14,810 |     10,629 (71.77%) |      4,181 (28.23%) |
| Validation | 2011-09-30 through 2011-10-31 |  7,668 |      5,232 (68.23%) |      2,436 (31.77%) |
| Test       | 2011-11-09 only               |  4,122 |      2,696 (65.41%) |      1,426 (34.59%) |

The same customer may occur in more than one period because each row represents a different historical snapshot. Temporal ordering prevents a later snapshot from entering an earlier split.

## Models

A class-balanced Logistic Regression baseline and a resource-bounded class-balanced Random Forest were trained with random seed `42`. Logistic Regression used `C=1.0`, `lbfgs`, and `max_iter=1000`. Random Forest used 160 trees, maximum depth 8, minimum leaf size 4, and one CPU worker. Logistic Regression was selected because it achieved the higher validation PR-AUC (`0.83175` versus `0.82876`) and remains easier to inspect and operate. The difference is small; the selection is not evidence that the baseline is universally superior.

## Calibration and threshold

A Platt sigmoid calibrator was fitted using the September 30 validation cutoff only. The operating threshold was selected using the October 31 validation cutoff only from `{0.20, 0.30, 0.40, 0.50, 0.60, 0.70}`. The selected threshold was `0.50`, maximizing validation F1 with deterministic precision and lower-threshold tie-breaks. Calibrated probabilities are persisted for downstream modeling use; the untouched November 9 test split was not used to fit calibration or select the threshold.

## Metrics

At the selected threshold, calibrated Logistic Regression produced the following real-prediction metrics:

| Split      | ROC-AUC |  PR-AUC |   Brier | Precision |  Recall |      F1 |
| ---------- | ------: | ------: | ------: | --------: | ------: | ------: |
| Validation | 0.73860 | 0.83175 | 0.17974 |   0.74090 | 0.95317 | 0.83374 |
| Test       | 0.74545 | 0.81607 | 0.18611 |   0.71886 | 0.95697 | 0.82100 |

Raw probability Brier scores were `0.20388` on validation and `0.20181` on test; calibration reduced them to `0.17974` and `0.18611`, respectively. Test ranking metrics are reported for evaluation only and were not used for selection.

## Limitations and known data-quality concerns

The source is a historical retail dataset rather than a subscription business. It contains returns, cancellations, missing customer identifiers in the raw source, duplicate source rows, and price/quantity anomalies documented in Phase 2. The imported customer-linked modeling population excludes customers without usable customer linkage and customers without eligible history at each cutoff. The target measures absence of an observed order over 30 days; it does not measure customer intent or business relationship termination. The time span is short, the test period is a single cutoff, repeated customers create correlated observations across time, and the calibration sample is modest. No fairness, uplift, cost-sensitive intervention, CLV, revenue-at-risk, SHAP, monitoring, or deployment claims are made in Phase 5.

## Reproducibility

The pipeline is implemented in `pipelines/churn_modeling.py` and `scripts/run_phase5_model.ts`. It uses dataset checksum `1610d0659938323b5f7c29eaf0dcd7535e14d94268af3dd134cd38c8acb96238`, feature version `phase4-rfm-behavioral-v1`, label version `behavioral-inactivity-30d-v1`, model version `phase5-churn-model-v1`, prediction version `phase5-prediction-v1`, and random seed `42`. The model artifact checksum is `db16a2bc4c6d0458af82c415cefb438a0669959c1aa9666557587250110908fe`. Re-running `pnpm model:train` with unchanged inputs reproduced the same dataset checksum, artifact checksum, model run key, metrics, and prediction coverage.
