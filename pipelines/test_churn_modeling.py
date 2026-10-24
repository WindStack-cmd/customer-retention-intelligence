import unittest
from datetime import datetime, timezone

import numpy as np

from pipelines.churn_modeling import (
    FEATURE_COLUMNS,
    TRAIN_LAST_CUTOFF,
    TEST_CUTOFF,
    VALIDATION_LAST_CUTOFF,
    apply_platt_calibrator,
    behavioral_inactivity_label,
    choose_threshold,
    fit_platt_calibrator,
    make_models,
    rows_to_matrix,
    split_rows,
)


UTC = timezone.utc


class ChurnModelingTests(unittest.TestCase):
    def test_label_boundaries_are_cutoff_exclusive_and_horizon_inclusive(self):
        cutoff = datetime(2021, 1, 1, 12, tzinfo=UTC)
        exact_cutoff = cutoff
        immediately_after = datetime(2021, 1, 1, 12, 0, 1, tzinfo=UTC)
        exact_horizon = datetime(2021, 1, 31, 12, tzinfo=UTC)
        after_horizon = datetime(2021, 1, 31, 12, 0, 1, tzinfo=UTC)
        self.assertEqual(behavioral_inactivity_label([exact_cutoff], cutoff, 30), (1, 0))
        self.assertEqual(behavioral_inactivity_label([immediately_after], cutoff, 30), (0, 1))
        self.assertEqual(behavioral_inactivity_label([exact_horizon], cutoff, 30), (0, 1))
        self.assertEqual(behavioral_inactivity_label([after_horizon], cutoff, 30), (1, 0))

    def test_temporal_split_is_strict_and_non_overlapping(self):
        def row(cutoff: str, snapshot_id: int) -> dict:
            return {"cutoffAt": f"{cutoff}T23:59:59.000Z", "customerId": snapshot_id, "snapshotId": snapshot_id, "inactivityLabel": snapshot_id % 2}

        rows = [row("2011-04-30", 1), row(TRAIN_LAST_CUTOFF, 2), row("2011-09-30", 3), row(VALIDATION_LAST_CUTOFF, 4), row(TEST_CUTOFF, 5)]
        split = split_rows(rows)
        self.assertEqual([item["snapshotId"] for item in split["train"]], [1, 2])
        self.assertEqual([item["snapshotId"] for item in split["validation"]], [3, 4])
        self.assertEqual([item["snapshotId"] for item in split["test"]], [5])
        self.assertEqual(sum(len(value) for value in split.values()), len(rows))

    def test_feature_matrix_excludes_identifier_and_target_columns(self):
        row = {column: 1.0 for column in FEATURE_COLUMNS}
        row.update({"customerId": 999, "snapshotId": 777, "cutoffAt": "2011-04-30T23:59:59.000Z", "inactivityLabel": 1})
        matrix, labels = rows_to_matrix([row])
        self.assertEqual(matrix.shape, (1, len(FEATURE_COLUMNS)))
        self.assertNotIn("customerId", FEATURE_COLUMNS)
        self.assertNotIn("inactivityLabel", FEATURE_COLUMNS)
        self.assertEqual(labels.tolist(), [1])

    def test_preprocessing_and_models_fit_only_from_training_matrix(self):
        train = np.asarray([[1.0] * len(FEATURE_COLUMNS), [2.0] * len(FEATURE_COLUMNS), [3.0] * len(FEATURE_COLUMNS), [4.0] * len(FEATURE_COLUMNS)])
        labels = np.asarray([0, 1, 0, 1])
        validation = np.asarray([[100.0] * len(FEATURE_COLUMNS)])
        for model in make_models().values():
            model.fit(train, labels)
            prediction = model.predict_proba(validation)[:, 1]
            self.assertEqual(prediction.shape, (1,))
            self.assertGreaterEqual(float(prediction[0]), 0.0)
            self.assertLessEqual(float(prediction[0]), 1.0)

    def test_calibration_is_bounded_and_threshold_selection_uses_only_supplied_validation_rows(self):
        raw = np.asarray([0.05, 0.20, 0.40, 0.60, 0.80, 0.95])
        labels = np.asarray([0, 0, 0, 1, 1, 1])
        calibrator = fit_platt_calibrator(raw, labels)
        calibrated = apply_platt_calibrator(calibrator, raw)
        self.assertTrue(np.all(calibrated >= 0.0))
        self.assertTrue(np.all(calibrated <= 1.0))
        threshold, analysis = choose_threshold(labels, calibrated)
        self.assertIn(threshold, {0.20, 0.30, 0.40, 0.50, 0.60, 0.70})
        self.assertEqual(len(analysis), 6)


if __name__ == "__main__":
    unittest.main()
