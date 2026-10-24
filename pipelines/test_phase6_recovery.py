import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from recover_missing_shap import EXPLAINER_TYPE, EXPLAINER_VERSION, OUTPUT_SPACE


@unittest.skipUnless(
    Path("artifacts/phase6-recovery/recovery/recovery_summary.json").is_file(),
    "requires regenerated Phase 6 recovery artifacts",
)
class Phase6RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.summary_path = Path("artifacts/phase6-recovery/recovery/recovery_summary.json")
        with self.summary_path.open("r", encoding="utf-8") as handle:
            self.summary = json.load(handle)

    def test_recovery_summary_is_complete_and_numerically_valid(self):
        self.assertEqual(self.summary["status"], "recovered_missing_only")
        self.assertEqual(self.summary["explainerType"], EXPLAINER_TYPE)
        self.assertEqual(self.summary["explainerVersion"], EXPLAINER_VERSION)
        self.assertEqual(self.summary["outputSpace"], OUTPUT_SPACE)
        self.assertEqual(self.summary["rowCount"], 26600)
        self.assertEqual(self.summary["missingExplanationCount"], 12344)
        self.assertEqual(self.summary["missingKeyCount"], 456700)
        self.assertEqual(self.summary["writtenKeyCount"], 456700)
        self.assertLessEqual(self.summary["maxAdditivityError"], 1e-7)
        self.assertLessEqual(self.summary["maxRawPredictionDifference"], 1e-8)
        self.assertLessEqual(self.summary["maxCalibratedPredictionDifference"], 1e-8)

    def test_business_and_transformed_feature_names_are_aligned(self):
        business = self.summary["featureColumns"]
        transformed = self.summary["transformedFeatureNames"]
        self.assertEqual(len(business), 37)
        self.assertEqual(transformed[:37], business)
        self.assertEqual(
            transformed[37:],
            [
                "averageDaysBetweenOrders__missing_indicator",
                "purchaseIntervalVariance__missing_indicator",
            ],
        )


if __name__ == "__main__":
    unittest.main()
