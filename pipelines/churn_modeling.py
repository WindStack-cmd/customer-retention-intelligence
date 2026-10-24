"""Phase 5 behavioral inactivity modeling utilities.

This module contains only deterministic, database-independent modeling logic.
The Node orchestrator exports verified database rows and persists the results.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import joblib
import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


RANDOM_SEED = 42
MODEL_VERSION = "phase5-churn-model-v1"
PREPROCESSING_VERSION = "median-impute-v1"
PREDICTION_VERSION = "phase5-prediction-v1"
TRAIN_LAST_CUTOFF = "2011-08-31"
VALIDATION_LAST_CUTOFF = "2011-10-31"
TEST_CUTOFF = "2011-11-09"
CALIBRATION_CUTOFF = "2011-09-30"
THRESHOLD_CUTOFF = "2011-10-31"

FEATURE_COLUMNS = [
    "daysSinceLastPurchase",
    "totalOrders",
    "purchaseFrequency",
    "totalGrossValue",
    "totalNetValue",
    "averageOrderValue",
    "totalItems",
    "averageItemsPerOrder",
    "uniqueProducts",
    "activeMonths",
    "purchaseCount",
    "averageQuantityPerOrder",
    "averageDaysBetweenOrders",
    "purchaseIntervalVariance",
    "customerLifetimeDays",
    "inactiveDays",
    "returnCount",
    "returnQuantity",
    "returnValue",
    "returnRate",
    "cancellationCount",
    "cancellationRate",
    "productDiversity",
    "purchasesLast7d",
    "purchasesLast30d",
    "purchasesLast60d",
    "purchasesLast90d",
    "spendLast30d",
    "spendLast60d",
    "spendLast90d",
    "ordersLast30d",
    "ordersLast60d",
    "ordersLast90d",
    "recentVsPreviousOrderRate",
    "recentVsPreviousSpend",
    "recentVsPreviousQuantity",
    "customerAgeAtCutoff",
]

CANDIDATE_THRESHOLDS = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70]


@dataclass(frozen=True)
class Split:
    name: str
    mask: np.ndarray


def parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00").replace(".000", ""))


def cutoff_key(value: str) -> str:
    return parse_date(value).date().isoformat()


def behavioral_inactivity_label(order_times: Iterable[datetime], cutoff: datetime, horizon_days: int) -> tuple[int, int]:
    horizon_end = cutoff.timestamp() + horizon_days * 86_400
    future_order_count = sum(
        1
        for order_time in order_times
        if order_time.timestamp() > cutoff.timestamp()
        and order_time.timestamp() <= horizon_end
    )
    return (1 if future_order_count == 0 else 0, future_order_count)


def split_rows(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    result = {"train": [], "validation": [], "test": []}
    for row in rows:
        cutoff = cutoff_key(str(row["cutoffAt"]))
        if cutoff <= TRAIN_LAST_CUTOFF:
            result["train"].append(row)
        elif cutoff <= VALIDATION_LAST_CUTOFF:
            result["validation"].append(row)
        elif cutoff == TEST_CUTOFF:
            result["test"].append(row)
        else:
            raise ValueError(f"Unexpected cutoff outside temporal split: {cutoff}")
    for name in result:
        result[name].sort(key=lambda row: (str(row["cutoffAt"]), int(row["customerId"]), int(row["snapshotId"])))
    if not result["train"] or not result["validation"] or not result["test"]:
        raise ValueError("Temporal split must contain train, validation, and test rows")
    return result


def rows_to_matrix(rows: list[dict[str, Any]]) -> tuple[np.ndarray, np.ndarray]:
    matrix = np.asarray([[float(row[column]) if row[column] is not None else np.nan for column in FEATURE_COLUMNS] for row in rows], dtype=float)
    labels = np.asarray([int(row["inactivityLabel"]) for row in rows], dtype=int)
    if not np.isfinite(np.nan_to_num(matrix, nan=0.0)).all():
        raise ValueError("Feature matrix contains infinite values")
    return matrix, labels


def make_models() -> dict[str, Pipeline]:
    return {
        "logistic_regression": Pipeline([
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scaler", StandardScaler()),
            ("model", LogisticRegression(C=1.0, max_iter=1000, class_weight="balanced", solver="lbfgs", random_state=RANDOM_SEED)),
        ]),
        "random_forest": Pipeline([
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("model", RandomForestClassifier(n_estimators=160, max_depth=8, min_samples_leaf=4, class_weight="balanced", random_state=RANDOM_SEED, n_jobs=1)),
        ]),
    }


def safe_metric(function: Any, labels: np.ndarray, probabilities: np.ndarray) -> float | None:
    try:
        return float(function(labels, probabilities))
    except ValueError:
        return None


def classification_metrics(labels: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict[str, Any]:
    predicted = (probabilities >= threshold).astype(int)
    matrix = confusion_matrix(labels, predicted, labels=[0, 1]).tolist()
    return {
        "roc_auc": safe_metric(roc_auc_score, labels, probabilities),
        "pr_auc": safe_metric(average_precision_score, labels, probabilities),
        "brier_score": float(brier_score_loss(labels, probabilities)),
        "precision": float(precision_score(labels, predicted, zero_division=0)),
        "recall": float(recall_score(labels, predicted, zero_division=0)),
        "f1": float(f1_score(labels, predicted, zero_division=0)),
        "confusion_matrix": matrix,
        "positive_support": int(labels.sum()),
        "negative_support": int((labels == 0).sum()),
        "predicted_positive_count": int(predicted.sum()),
        "threshold": float(threshold),
        "precision_at_5pct": precision_at_k(labels, probabilities, 0.05),
        "recall_at_5pct": recall_at_k(labels, probabilities, 0.05),
        "precision_at_10pct": precision_at_k(labels, probabilities, 0.10),
        "recall_at_10pct": recall_at_k(labels, probabilities, 0.10),
        "precision_at_20pct": precision_at_k(labels, probabilities, 0.20),
        "recall_at_20pct": recall_at_k(labels, probabilities, 0.20),
    }


def precision_at_k(labels: np.ndarray, probabilities: np.ndarray, fraction: float) -> float:
    count = max(1, int(math.ceil(len(labels) * fraction)))
    order = np.argsort(-probabilities, kind="mergesort")[:count]
    return float(labels[order].mean())


def recall_at_k(labels: np.ndarray, probabilities: np.ndarray, fraction: float) -> float:
    positive_count = int(labels.sum())
    if positive_count == 0:
        return 0.0
    count = max(1, int(math.ceil(len(labels) * fraction)))
    order = np.argsort(-probabilities, kind="mergesort")[:count]
    return float(labels[order].sum() / positive_count)


def reliability_metrics(labels: np.ndarray, probabilities: np.ndarray, bins: int = 10) -> dict[str, Any]:
    fraction_true, mean_predicted = calibration_curve(labels, probabilities, n_bins=bins, strategy="uniform")
    return {
        "bin_true_rate": [float(value) for value in fraction_true],
        "bin_mean_probability": [float(value) for value in mean_predicted],
        "bin_count": [int(((probabilities >= index / bins) & (probabilities < (index + 1) / bins)).sum()) for index in range(bins)],
    }


def fit_platt_calibrator(raw_probabilities: np.ndarray, labels: np.ndarray) -> LogisticRegression:
    if len(np.unique(labels)) < 2:
        raise ValueError("Calibration split must contain both inactivity classes")
    clipped = np.clip(raw_probabilities, 1e-6, 1 - 1e-6)
    logits = np.log(clipped / (1 - clipped)).reshape(-1, 1)
    calibrator = LogisticRegression(C=1e6, max_iter=1000, solver="lbfgs", random_state=RANDOM_SEED)
    calibrator.fit(logits, labels)
    return calibrator


def apply_platt_calibrator(calibrator: LogisticRegression, raw_probabilities: np.ndarray) -> np.ndarray:
    clipped = np.clip(raw_probabilities, 1e-6, 1 - 1e-6)
    logits = np.log(clipped / (1 - clipped)).reshape(-1, 1)
    result = calibrator.predict_proba(logits)[:, 1]
    return np.clip(result, 0.0, 1.0)


def choose_threshold(labels: np.ndarray, probabilities: np.ndarray) -> tuple[float, list[dict[str, Any]]]:
    analysis = []
    for threshold in CANDIDATE_THRESHOLDS:
        metrics = classification_metrics(labels, probabilities, threshold)
        analysis.append({"threshold": threshold, "precision": metrics["precision"], "recall": metrics["recall"], "f1": metrics["f1"], "predictedPositiveCount": metrics["predicted_positive_count"]})
    best = max(analysis, key=lambda row: (row["f1"], row["precision"], -row["threshold"]))
    return float(best["threshold"]), analysis


def model_metrics_to_records(split_name: str, model_name: str, raw: dict[str, Any], calibrated: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for prefix, metrics in (("raw", raw), ("calibrated", calibrated)):
        for name in ("roc_auc", "pr_auc", "brier_score", "precision", "recall", "f1", "positive_support", "negative_support", "predicted_positive_count", "precision_at_5pct", "recall_at_5pct", "precision_at_10pct", "recall_at_10pct", "precision_at_20pct", "recall_at_20pct"):
            value = metrics[name]
            records.append({"split": split_name, "metricName": f"{model_name}.{prefix}.{name}", "metricValue": value, "metricJson": None})
        records.append({"split": split_name, "metricName": f"{model_name}.{prefix}.confusion_matrix", "metricValue": None, "metricJson": json.dumps(metrics["confusion_matrix"], sort_keys=True)})
    return records


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def train_and_evaluate(rows: list[dict[str, Any]], dataset_sha256: str, artifact_dir: Path) -> dict[str, Any]:
    np.random.seed(RANDOM_SEED)
    splits = split_rows(rows)
    matrices = {name: rows_to_matrix(value) for name, value in splits.items()}
    models = make_models()
    model_outputs: dict[str, dict[str, Any]] = {}
    comparison: list[dict[str, Any]] = []

    train_matrix, train_labels = matrices["train"]
    for name, model in models.items():
        model.fit(train_matrix, train_labels)
        probabilities = {split_name: model.predict_proba(matrix)[:, 1] for split_name, (matrix, _) in matrices.items()}
        validation_labels = matrices["validation"][1]
        validation_metrics = classification_metrics(validation_labels, probabilities["validation"], 0.5)
        comparison.append({"model": name, "validation_pr_auc": validation_metrics["pr_auc"], "validation_brier_score": validation_metrics["brier_score"], "inference": "CPU single-process"})
        model_outputs[name] = {"model": model, "probabilities": probabilities, "validation_metrics": validation_metrics}

    comparison.sort(key=lambda row: (row["validation_pr_auc"] if row["validation_pr_auc"] is not None else -1.0, -(row["validation_brier_score"] or 999.0)), reverse=True)
    selected_name = comparison[0]["model"]
    selected = model_outputs[selected_name]
    selected_model = selected["model"]
    raw_probabilities = selected["probabilities"]

    calibration_rows = [index for index, row in enumerate(splits["validation"]) if cutoff_key(str(row["cutoffAt"])) == CALIBRATION_CUTOFF]
    threshold_rows = [index for index, row in enumerate(splits["validation"]) if cutoff_key(str(row["cutoffAt"])) == THRESHOLD_CUTOFF]
    if not calibration_rows or not threshold_rows:
        raise ValueError("Validation split must contain dedicated calibration and threshold cutoffs")
    calibration_labels = matrices["validation"][1][calibration_rows]
    calibrator = fit_platt_calibrator(raw_probabilities["validation"][calibration_rows], calibration_labels)
    calibrated_probabilities = {
        split_name: apply_platt_calibrator(calibrator, probabilities)
        for split_name, probabilities in raw_probabilities.items()
    }
    threshold, threshold_analysis = choose_threshold(
        matrices["validation"][1][threshold_rows], calibrated_probabilities["validation"][threshold_rows]
    )

    metrics: list[dict[str, Any]] = []
    for split_name, (_, labels) in matrices.items():
        raw_metrics = classification_metrics(labels, raw_probabilities[split_name], threshold)
        calibrated_metrics = classification_metrics(labels, calibrated_probabilities[split_name], threshold)
        metrics.extend(model_metrics_to_records(split_name, selected_name, raw_metrics, calibrated_metrics))
        metrics.append({"split": split_name, "metricName": "selected.calibration_reliability", "metricValue": None, "metricJson": json.dumps(reliability_metrics(labels, calibrated_probabilities[split_name]), sort_keys=True)})
    metrics.append({"split": "validation", "metricName": "selected.threshold_analysis", "metricValue": None, "metricJson": json.dumps(threshold_analysis, sort_keys=True)})
    metrics.append({"split": "validation", "metricName": "selected.calibration_cutoff", "metricValue": None, "metricJson": json.dumps({"cutoff": CALIBRATION_CUTOFF, "method": "platt_sigmoid"}, sort_keys=True)})
    metrics.append({"split": "validation", "metricName": "selected.threshold_cutoff", "metricValue": threshold, "metricJson": json.dumps({"cutoff": THRESHOLD_CUTOFF, "selection": "max_validation_f1_tie_break_precision_then_lower_threshold"}, sort_keys=True)})

    predictions: list[dict[str, Any]] = []
    for split_name, split_rows_value in splits.items():
        for index, row in enumerate(split_rows_value):
            raw_probability = float(raw_probabilities[split_name][index])
            calibrated_probability = float(calibrated_probabilities[split_name][index])
            predictions.append({
                "snapshotId": int(row["snapshotId"]),
                "customerId": int(row["customerId"]),
                "cutoffAt": row["cutoffAt"],
                "rawProbability": raw_probability,
                "calibratedProbability": calibrated_probability,
                "predictedClass": int(calibrated_probability >= threshold),
                "split": split_name,
                "label": int(row["inactivityLabel"]),
            })

    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / f"{MODEL_VERSION}-{dataset_sha256[:16]}.joblib"
    bundle = {
        "model": selected_model,
        "calibrator": calibrator,
        "featureColumns": FEATURE_COLUMNS,
        "modelName": selected_name,
        "modelVersion": MODEL_VERSION,
        "preprocessingVersion": PREPROCESSING_VERSION,
        "predictionVersion": PREDICTION_VERSION,
        "randomSeed": RANDOM_SEED,
        "threshold": threshold,
        "datasetSha256": dataset_sha256,
        "calibrationCutoff": CALIBRATION_CUTOFF,
        "thresholdCutoff": THRESHOLD_CUTOFF,
    }
    joblib.dump(bundle, artifact_path, compress=3)
    artifact_sha256 = sha256_file(artifact_path)

    def split_summary(name: str) -> dict[str, Any]:
        rows_for_split = splits[name]
        labels = matrices[name][1]
        return {
            "name": name,
            "rowCount": len(rows_for_split),
            "customerCount": len({int(row["customerId"]) for row in rows_for_split}),
            "positiveCount": int(labels.sum()),
            "negativeCount": int((labels == 0).sum()),
            "minCutoff": min(str(row["cutoffAt"]) for row in rows_for_split),
            "maxCutoff": max(str(row["cutoffAt"]) for row in rows_for_split),
        }

    return {
        "modelName": selected_name,
        "modelVersion": MODEL_VERSION,
        "preprocessingVersion": PREPROCESSING_VERSION,
        "predictionVersion": PREDICTION_VERSION,
        "featureColumns": FEATURE_COLUMNS,
        "datasetSha256": dataset_sha256,
        "randomSeed": RANDOM_SEED,
        "threshold": threshold,
        "calibrationMethod": "platt_sigmoid",
        "calibrationCutoff": CALIBRATION_CUTOFF,
        "thresholdCutoff": THRESHOLD_CUTOFF,
        "comparison": comparison,
        "splits": [split_summary(name) for name in ("train", "validation", "test")],
        "metrics": metrics,
        "predictions": predictions,
        "artifactPath": str(artifact_path),
        "artifactSha256": artifact_sha256,
        "trainingConfig": {
            "logisticRegression": {"C": 1.0, "maxIter": 1000, "classWeight": "balanced", "solver": "lbfgs"},
            "randomForest": {"nEstimators": 160, "maxDepth": 8, "minSamplesLeaf": 4, "classWeight": "balanced", "nJobs": 1},
            "candidateThresholds": CANDIDATE_THRESHOLDS,
        },
    }


def load_rows(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)
    if not isinstance(rows, list) or not rows:
        raise ValueError("Modeling dataset must be a non-empty JSON list")
    return rows


def main() -> None:
    dataset_path = Path(os.environ.get("PHASE5_DATASET_PATH", "artifacts/phase5/modeling_dataset.json"))
    output_path = Path(os.environ.get("PHASE5_RESULT_PATH", "artifacts/phase5/model_result.json"))
    artifact_dir = Path(os.environ.get("PHASE5_ARTIFACT_DIR", "artifacts/phase5"))
    rows = load_rows(dataset_path)
    result = train_and_evaluate(rows, sha256_file(dataset_path), artifact_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    serializable = {key: value for key, value in result.items() if key != "predictions"}
    serializable["predictionPath"] = str(output_path.with_name("predictions.json"))
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(serializable, handle, indent=2, sort_keys=True)
    with output_path.with_name("predictions.json").open("w", encoding="utf-8") as handle:
        json.dump(result["predictions"], handle, indent=2, sort_keys=True)
    print(json.dumps(serializable, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
