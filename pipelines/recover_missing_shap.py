"""Targeted Phase 6 recovery when the original SHAP stream is unavailable.

This script never writes database rows. It reconstructs the verified Phase 5
Logistic Regression deterministically from database-exported snapshots, checks
its probabilities against persisted predictions, and emits only missing
explanation-feature keys for an insert-only persistence step.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import shap

from churn_modeling import (
    FEATURE_COLUMNS,
    apply_platt_calibrator,
    cutoff_key,
    fit_platt_calibrator,
    make_models,
    rows_to_matrix,
    split_rows,
)

TOP_N = int(os.environ.get("PHASE6_TOP_N", "5"))
BACKGROUND_SIZE = int(os.environ.get("PHASE6_BACKGROUND_SIZE", "256"))
ADDITIVITY_TOLERANCE = float(os.environ.get("PHASE6_ADDITIVITY_TOLERANCE", "1e-7"))
PREDICTION_TOLERANCE = float(os.environ.get("PHASE6_PREDICTION_TOLERANCE", "1e-8"))
OUTPUT_SPACE = "raw_log_odds_class_1"
EXPLAINER_TYPE = "shap.LinearExplainer"
EXPLAINER_VERSION = f"shap-{shap.__version__}"


def sigmoid(values: np.ndarray) -> np.ndarray:
    clipped = np.clip(values, -700.0, 700.0)
    return 1.0 / (1.0 + np.exp(-clipped))


def rank_contributions(values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    directions = np.where(values > 0.0, "positive", np.where(values < 0.0, "negative", "neutral"))
    ranks = np.zeros(values.shape[0], dtype=int)
    positive = np.flatnonzero(values > 0.0)
    negative = np.flatnonzero(values < 0.0)
    for rank, index in enumerate(positive[np.argsort(-values[positive], kind="mergesort")], start=1):
        ranks[index] = rank
    for rank, index in enumerate(negative[np.argsort(values[negative], kind="mergesort")], start=1):
        ranks[index] = rank
    return directions, ranks


def transformed_feature_names(missing_indices: np.ndarray) -> list[str]:
    names = list(FEATURE_COLUMNS)
    names.extend(f"{FEATURE_COLUMNS[int(index)]}__missing_indicator" for index in missing_indices)
    return names


def main() -> None:
    input_path = Path(os.environ.get("PHASE6_RECOVERY_INPUT", "artifacts/phase6/recovery_input.json"))
    output_dir = Path(os.environ.get("PHASE6_RECOVERY_OUTPUT_DIR", "artifacts/phase6/recovery"))
    output_dir.mkdir(parents=True, exist_ok=True)
    with input_path.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)
    if not isinstance(rows, list) or not rows:
        raise ValueError("Recovery input is empty")
    if len({int(row["snapshotId"]) for row in rows}) != len(rows):
        raise ValueError("Recovery input contains duplicate snapshots")
    missing_rows = [row for row in rows if row.get("missingFeatureNames")]
    missing_key_count = sum(len(row["missingFeatureNames"]) for row in missing_rows)
    if missing_key_count == 0:
        raise ValueError("Recovery input has no missing attribution keys")

    splits = split_rows(rows)
    matrices = {name: rows_to_matrix(value) for name, value in splits.items()}
    model = make_models()["logistic_regression"]
    model.fit(matrices["train"][0], matrices["train"][1])
    raw_probabilities = {
        split_name: model.predict_proba(matrix)[:, 1]
        for split_name, (matrix, _) in matrices.items()
    }
    calibration_rows = [
        index
        for index, row in enumerate(splits["validation"])
        if cutoff_key(str(row["cutoffAt"])) == "2011-09-30"
    ]
    calibrator = fit_platt_calibrator(
        raw_probabilities["validation"][calibration_rows],
        matrices["validation"][1][calibration_rows],
    )
    calibrated_probabilities = {
        split_name: apply_platt_calibrator(calibrator, probabilities)
        for split_name, probabilities in raw_probabilities.items()
    }
    persisted_raw = {int(row["snapshotId"]): float(row["rawProbability"]) for row in rows}
    persisted_calibrated = {int(row["snapshotId"]): float(row["calibratedProbability"]) for row in rows}
    reconstructed_raw: dict[int, float] = {}
    reconstructed_calibrated: dict[int, float] = {}
    for split_name, split_rows_value in splits.items():
        for index, row in enumerate(split_rows_value):
            snapshot_id = int(row["snapshotId"])
            reconstructed_raw[snapshot_id] = float(raw_probabilities[split_name][index])
            reconstructed_calibrated[snapshot_id] = float(calibrated_probabilities[split_name][index])
    raw_errors = np.asarray([abs(reconstructed_raw[key] - persisted_raw[key]) for key in persisted_raw], dtype=float)
    calibrated_errors = np.asarray([abs(reconstructed_calibrated[key] - persisted_calibrated[key]) for key in persisted_calibrated], dtype=float)
    if float(raw_errors.max()) > PREDICTION_TOLERANCE:
        raise ValueError(f"Reconstructed raw prediction differs from persisted model: {float(raw_errors.max())}")
    if float(calibrated_errors.max()) > PREDICTION_TOLERANCE:
        raise ValueError(f"Reconstructed calibrated prediction differs from persisted model: {float(calibrated_errors.max())}")

    raw_matrix = np.asarray(
        [[float(row[column]) if row[column] is not None else np.nan for column in FEATURE_COLUMNS] for row in rows],
        dtype=float,
    )
    imputer = model.named_steps["imputer"]
    scaler = model.named_steps["scaler"]
    estimator = model.named_steps["model"]
    imputed_matrix = imputer.transform(raw_matrix)
    transformed_matrix = scaler.transform(imputed_matrix)
    missing_indices = np.asarray(getattr(imputer.indicator_, "features_", []), dtype=int)
    transformed_names = transformed_feature_names(missing_indices)
    if transformed_matrix.shape[1] != len(transformed_names):
        raise ValueError("Transformed feature-name mapping mismatch")
    background = transformed_matrix[: min(BACKGROUND_SIZE, len(transformed_matrix))]
    masker = shap.maskers.Independent(background, max_samples=len(background))
    explainer = shap.LinearExplainer(estimator, masker, feature_names=transformed_names)
    missing_positions = [index for index, row in enumerate(rows) if row.get("missingFeatureNames")]
    missing_matrix = transformed_matrix[missing_positions]
    shap_values = explainer.shap_values(missing_matrix)
    if isinstance(shap_values, list):
        shap_values = shap_values[-1]
    shap_values = np.asarray(shap_values, dtype=float)
    if shap_values.shape != missing_matrix.shape:
        raise ValueError(f"Unexpected SHAP shape {shap_values.shape}; expected {missing_matrix.shape}")
    base_value = float(np.asarray(explainer.expected_value).reshape(-1)[-1])
    model_outputs = estimator.decision_function(missing_matrix)
    additivity_errors = np.abs(base_value + shap_values.sum(axis=1) - model_outputs)
    if float(additivity_errors.max()) > ADDITIVITY_TOLERANCE:
        raise ValueError(f"SHAP additivity error exceeds tolerance: {float(additivity_errors.max())}")
    base_contributions = shap_values[:, : len(FEATURE_COLUMNS)].copy()
    indicator_contributions = shap_values[:, len(FEATURE_COLUMNS) :]
    for indicator_column, feature_index in enumerate(missing_indices):
        base_contributions[:, int(feature_index)] += indicator_contributions[:, indicator_column]
    observed_missing = np.isnan(raw_matrix[missing_positions])
    display_values = np.where(observed_missing, imputer.statistics_[None, :], raw_matrix[missing_positions])
    if not np.isfinite(display_values).all():
        raise ValueError("Recovery feature values contain non-finite values")

    output_path = output_dir / "missing_features.ndjson"
    written = 0
    with output_path.open("w", encoding="utf-8") as handle:
        for local_index, row_index in enumerate(missing_positions):
            row = rows[row_index]
            allowed = set(str(value) for value in rows[row_index]["missingFeatureNames"])
            directions, ranks = rank_contributions(base_contributions[local_index])
            for feature_index, feature_name in enumerate(FEATURE_COLUMNS):
                if feature_name not in allowed:
                    continue
                handle.write(json.dumps({
                    "explanationId": int(row["explanationId"]),
                    "snapshotId": int(row["snapshotId"]),
                    "featureName": feature_name,
                    "featureValue": float(display_values[local_index, feature_index]),
                    "isMissing": int(observed_missing[local_index, feature_index]),
                    "shapValue": float(base_contributions[local_index, feature_index]),
                    "contributionDirection": str(directions[feature_index]),
                    "rank": int(ranks[feature_index]),
                }, sort_keys=True, separators=(",", ":")) + "\n")
                written += 1
    summary = {
        "status": "recovered_missing_only",
        "modelRunId": int(rows[0]["modelRunId"]),
        "featureVersion": str(rows[0]["featureVersion"]),
        "modelName": "logistic_regression",
        "modelVersion": "phase5-churn-model-v1",
        "explainerType": EXPLAINER_TYPE,
        "explainerVersion": EXPLAINER_VERSION,
        "outputSpace": OUTPUT_SPACE,
        "topN": TOP_N,
        "featureColumns": FEATURE_COLUMNS,
        "transformedFeatureNames": transformed_names,
        "rowCount": len(rows),
        "missingExplanationCount": len(missing_rows),
        "missingKeyCount": missing_key_count,
        "writtenKeyCount": written,
        "backgroundSize": len(background),
        "maxAdditivityError": float(additivity_errors.max()),
        "meanAdditivityError": float(additivity_errors.mean()),
        "maxRawPredictionDifference": float(raw_errors.max()),
        "maxCalibratedPredictionDifference": float(calibrated_errors.max()),
        "predictionTolerance": PREDICTION_TOLERANCE,
        "additivityTolerance": ADDITIVITY_TOLERANCE,
        "outputPath": str(output_path),
    }
    with (output_dir / "recovery_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, sort_keys=True)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
