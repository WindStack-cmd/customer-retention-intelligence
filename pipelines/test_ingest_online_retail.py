from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from ingest_online_retail import EXPECTED_COLUMNS, ingest


class OnlineRetailIngestionTests(unittest.TestCase):
    def write_fixture(self, directory: Path, columns: list[str] | None = None) -> Path:
        path = directory / "fixture.csv"
        columns = columns or EXPECTED_COLUMNS
        rows = [
            ["536365", "85123A", "WHITE HANGING HEART", "6", "12/1/2010 8:26", "2.55", "17850", "United Kingdom"],
            ["C536366", "71053", "WHITE METAL LANTERN", "-1", "12/1/2010 8:28", "3.39", "17850", "United Kingdom"],
            ["536367", "84406B", "CREAM CUP", "8", "12/1/2010 8:34", "2.75", "", "United Kingdom"],
            ["536368", "84029G", "KNITTED UNION FLAG", "not-a-number", "12/1/2010 8:35", "3.39", "13047", "United Kingdom"],
            ["536369", "22752", "SET OF 7 CAKES", "2", "not-a-date", "1.65", "13047", "United Kingdom"],
            ["536365", "85123A", "WHITE HANGING HEART", "6", "12/1/2010 8:26", "2.55", "17850", "United Kingdom"],
        ]
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(columns)
            for row in rows:
                writer.writerow(row[: len(columns)])
        return path

    def test_valid_and_invalid_rows_are_reported_and_processed_deterministically(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = self.write_fixture(directory)
            first = ingest(source, directory / "run-one")
            second = ingest(source, directory / "run-two")

            self.assertEqual(first["overall_quality_status"], "WARNING")
            self.assertEqual(first["counts"]["rows_before_cleaning"], 6)
            self.assertEqual(first["counts"]["rows_after_cleaning"], 3)
            self.assertEqual(first["duplicates"]["exact_duplicate_rows"], 1)
            self.assertEqual(first["invalid_records"]["missing_customer_id"], 1)
            self.assertEqual(first["invalid_records"]["invalid_numeric"], 1)
            self.assertEqual(first["invalid_records"]["invalid_date"], 1)
            self.assertEqual(first["source"]["sha256"], second["source"]["sha256"])
            self.assertEqual(
                (directory / "run-one" / "processed" / "online_retail_processed.csv").read_bytes(),
                (directory / "run-two" / "processed" / "online_retail_processed.csv").read_bytes(),
            )

    def test_missing_required_column_fails_structural_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = self.write_fixture(directory, EXPECTED_COLUMNS[:-1])
            report = ingest(source, directory / "run")
            self.assertEqual(report["overall_quality_status"], "FAIL")
            self.assertEqual(report["structural"]["missing_required_columns"], ["Country"])

    def test_numeric_and_date_validity_are_explicit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = self.write_fixture(directory)
            report = ingest(source, directory / "run")
            self.assertEqual(report["invalid_records"]["invalid_numeric"], 1)
            self.assertEqual(report["invalid_records"]["invalid_date"], 1)
            self.assertEqual(report["invalid_records"]["rejected_from_customer_level_output"], 3)


if __name__ == "__main__":
    unittest.main()
