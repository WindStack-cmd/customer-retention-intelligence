#!/usr/bin/env python3
"""Ingest and validate the UCI Online Retail workbook without third-party packages."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import sys
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterable, Iterator
from xml.etree import ElementTree as ET

SOURCE_URL = "https://archive.ics.uci.edu/static/public/352/online+retail.zip"
EXPECTED_COLUMNS = [
    "InvoiceNo",
    "StockCode",
    "Description",
    "Quantity",
    "InvoiceDate",
    "UnitPrice",
    "CustomerID",
    "Country",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def excel_datetime(value: float) -> str:
    # Excel's default 1900 system includes the historical leap-year bug.
    base = datetime(1899, 12, 30)
    return (base + timedelta(days=value)).strftime("%Y-%m-%d %H:%M:%S")


def parse_datetime(value: str) -> datetime | None:
    text = value.strip()
    if not text:
        return None
    for fmt in ("%m/%d/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_float(value: str) -> float | None:
    text = value.strip()
    if not text:
        return None
    try:
        parsed = float(text)
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def read_xlsx(path: Path) -> Iterator[dict[str, str]]:
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root:
                shared.append("".join(node.text or "" for node in item.iter() if local_name(node.tag) == "t"))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        first_sheet = next(node for node in workbook.iter() if local_name(node.tag) == "sheet")
        relationship_id = next(value for key, value in first_sheet.attrib.items() if key.endswith("}id"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(node.attrib["Target"] for node in relationships if node.attrib.get("Id") == relationship_id)
        sheet_path = "xl/" + target.lstrip("/") if not target.startswith("xl/") else target
        sheet = ET.fromstring(archive.read(sheet_path))
        rows = [node for node in sheet.iter() if local_name(node.tag) == "row"]
        if not rows:
            return

        headers: list[str] = []
        for cell in [node for node in rows[0] if local_name(node.tag) == "c"]:
            headers.append(read_xlsx_cell(cell, shared))
        for row in rows[1:]:
            values = {header: "" for header in headers}
            for cell in [node for node in row if local_name(node.tag) == "c"]:
                reference = cell.attrib.get("r", "")
                match = re.match(r"([A-Z]+)", reference)
                if not match:
                    continue
                index = 0
                for character in match.group(1):
                    index = index * 26 + ord(character) - 64
                index -= 1
                if index < len(headers):
                    values[headers[index]] = read_xlsx_cell(cell, shared, headers[index])
            yield values


def read_xlsx_cell(cell: ET.Element, shared: list[str], header: str = "") -> str:
    kind = cell.attrib.get("t")
    value_node = next((node for node in cell if local_name(node.tag) == "v"), None)
    raw = value_node.text if value_node is not None and value_node.text is not None else ""
    if kind == "s":
        return shared[int(raw)] if raw else ""
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.iter() if local_name(node.tag) == "t")
    if header == "InvoiceDate" and raw:
        try:
            return excel_datetime(float(raw))
        except ValueError:
            return raw
    return raw


def read_csv(path: Path) -> Iterator[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        yield from csv.DictReader(handle)


def read_rows(path: Path) -> Iterator[dict[str, str]]:
    if path.suffix.lower() == ".xlsx":
        yield from read_xlsx(path)
    elif path.suffix.lower() == ".csv":
        yield from read_csv(path)
    else:
        raise ValueError(f"Unsupported source format: {path.suffix}. Expected .xlsx or .csv")


def normalize_row(row: dict[str, str], row_number: int) -> dict[str, str]:
    normalized = {column: (row.get(column) or "").strip() for column in EXPECTED_COLUMNS}
    quantity = parse_float(normalized["Quantity"])
    unit_price = parse_float(normalized["UnitPrice"])
    invoice_date = parse_datetime(normalized["InvoiceDate"])
    normalized.update(
        {
            "_row_number": str(row_number),
            "invoice_is_cancellation": str(normalized["InvoiceNo"].upper().startswith("C")).lower(),
            "quantity_valid": str(quantity is not None).lower(),
            "unit_price_valid": str(unit_price is not None).lower(),
            "invoice_date_valid": str(invoice_date is not None).lower(),
            "line_revenue_gbp": "" if quantity is None or unit_price is None else f"{quantity * unit_price:.2f}",
        }
    )
    return normalized


def quality_status(report: dict[str, object]) -> str:
    structural = report["structural"]
    invalid = report["invalid_records"]
    if structural["missing_required_columns"] or structural["empty_source"]:
        return "FAIL"
    if invalid["invalid_date"] or invalid["invalid_numeric"] or invalid["missing_customer_id"]:
        return "WARNING"
    return "PASS"


def write_csv(path: Path, rows: Iterable[dict[str, str]], columns: list[str]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in columns})
            count += 1
    return count


def ingest(source: Path, output_dir: Path, source_url: str = SOURCE_URL, source_archive: Path | None = None) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    staging_dir = output_dir / "staging"
    processed_dir = output_dir / "processed"
    quality_dir = output_dir / "quality"
    for directory in (staging_dir, processed_dir, quality_dir):
        directory.mkdir(parents=True, exist_ok=True)

    rows = list(read_rows(source))
    source_columns = list(rows[0].keys()) if rows else []
    normalized_rows = [normalize_row(row, index) for index, row in enumerate(rows, start=2)]
    staging_columns = ["_row_number", *EXPECTED_COLUMNS, "invoice_is_cancellation", "quantity_valid", "unit_price_valid", "invoice_date_valid", "line_revenue_gbp"]
    write_csv(staging_dir / "online_retail_normalized.csv", normalized_rows, staging_columns)

    exact_duplicates = len(normalized_rows) - len({tuple(row[column] for column in EXPECTED_COLUMNS) for row in normalized_rows})
    invoice_ids = [row["InvoiceNo"] for row in normalized_rows if row["InvoiceNo"]]
    customer_ids = [row["CustomerID"] for row in normalized_rows if row["CustomerID"]]
    missing_values = {
        column: sum(1 for row in normalized_rows if not row[column])
        for column in EXPECTED_COLUMNS
    }
    invalid_numeric = sum(1 for row in normalized_rows if row["Quantity"] and row["UnitPrice"] and (row["quantity_valid"] == "false" or row["unit_price_valid"] == "false"))
    invalid_date = sum(1 for row in normalized_rows if row["InvoiceDate"] and row["invoice_date_valid"] == "false")
    missing_customer = sum(1 for row in normalized_rows if not row["CustomerID"])
    negative_quantity = sum(1 for row in normalized_rows if (parse_float(row["Quantity"]) or 0) < 0)
    negative_unit_price = sum(1 for row in normalized_rows if (parse_float(row["UnitPrice"]) or 0) < 0)
    zero_unit_price = sum(1 for row in normalized_rows if parse_float(row["UnitPrice"]) == 0)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    parsed_dates = [parse_datetime(row["InvoiceDate"]) for row in normalized_rows]
    valid_dates = [value for value in parsed_dates if value is not None]
    future_dates = sum(1 for value in valid_dates if value > now)

    processed_rows = [
        row for row in normalized_rows
        if row["CustomerID"] and row["quantity_valid"] == "true" and row["unit_price_valid"] == "true" and row["invoice_date_valid"] == "true"
    ]
    processed_columns = [*staging_columns]
    processed_count = write_csv(processed_dir / "online_retail_processed.csv", processed_rows, processed_columns)

    report: dict[str, object] = {
        "source": {
            "dataset": "UCI Online Retail (dataset 352)",
            "source_url": source_url,
            "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
            "local_source": str(source),
            "source_filename": source.name,
            "sha256": sha256(source),
            "archive_filename": source_archive.name if source_archive else None,
            "archive_sha256": sha256(source_archive) if source_archive else None,
            "format": source.suffix.lower().lstrip("."),
            "published_currency": "GBP",
        },
        "counts": {
            "rows_before_cleaning": len(normalized_rows),
            "rows_after_cleaning": processed_count,
            "customers_before_cleaning": len(set(customer_ids)),
            "customers_after_cleaning": len({row["CustomerID"] for row in processed_rows}),
            "columns": len(source_columns),
        },
        "structural": {
            "expected_columns": EXPECTED_COLUMNS,
            "observed_columns": source_columns,
            "missing_required_columns": [column for column in EXPECTED_COLUMNS if column not in source_columns],
            "unexpected_columns": [column for column in source_columns if column not in EXPECTED_COLUMNS],
            "empty_source": not bool(normalized_rows),
        },
        "missing_values": {column: {"count": count, "percentage": round((count / len(normalized_rows)) * 100, 4) if normalized_rows else 0} for column, count in missing_values.items()},
        "duplicates": {
            "exact_duplicate_rows": exact_duplicates,
            "duplicate_invoice_ids": len(invoice_ids) - len(set(invoice_ids)),
            "duplicate_customer_ids": len(customer_ids) - len(set(customer_ids)),
            "note": "Duplicate invoice and customer identifiers are expected at line-item grain and are reported, not deleted.",
        },
        "invalid_records": {
            "missing_customer_id": missing_customer,
            "invalid_numeric": invalid_numeric,
            "invalid_date": invalid_date,
            "future_dates": future_dates,
            "rejected_from_customer_level_output": len(normalized_rows) - processed_count,
        },
        "numerical_business_rules": {
            "negative_quantity_rows": negative_quantity,
            "negative_unit_price_rows": negative_unit_price,
            "zero_unit_price_rows": zero_unit_price,
            "note": "Negative quantities commonly represent returns/cancellations in this source; negative prices are reported for review and are not silently deleted.",
        },
        "date_range": {
            "min": min(valid_dates).isoformat(sep=" ") if valid_dates else None,
            "max": max(valid_dates).isoformat(sep=" ") if valid_dates else None,
        },
        "numeric_ranges": {
            "quantity": {"min": min((parse_float(row["Quantity"]) for row in normalized_rows if parse_float(row["Quantity"]) is not None), default=None), "max": max((parse_float(row["Quantity"]) for row in normalized_rows if parse_float(row["Quantity"]) is not None), default=None)},
            "unit_price": {"min": min((parse_float(row["UnitPrice"]) for row in normalized_rows if parse_float(row["UnitPrice"]) is not None), default=None), "max": max((parse_float(row["UnitPrice"]) for row in normalized_rows if parse_float(row["UnitPrice"]) is not None), default=None)},
        },
        "transformations": [
            "Normalized expected columns and trimmed string values.",
            "Parsed numeric Quantity and UnitPrice values.",
            "Parsed InvoiceDate values and identified future dates.",
            "Added invoice cancellation flag from InvoiceNo leading C.",
            "Derived line_revenue_gbp as Quantity multiplied by UnitPrice.",
            "Excluded rows missing CustomerID or with invalid numeric/date fields from processed customer-level output; retained them in staging and quality counts.",
            "Retained cancellation and negative-quantity rows with flags; no silent deletion.",
        ],
        "overall_quality_status": "",
    }
    report["overall_quality_status"] = quality_status(report)
    (quality_dir / "online_retail_quality.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    markdown = [
        "# UCI Online Retail Data Quality Report",
        "",
        f"**Overall status:** `{report['overall_quality_status']}`",
        f"**Generated:** `{report['source']['retrieved_at_utc']}`",
        "",
        "## Source",
        f"- Dataset: {report['source']['dataset']}",
        f"- URL: {report['source']['source_url']}",
        f"- File: `{report['source']['source_filename']}`",
        f"- SHA-256: `{report['source']['sha256']}`",
        f"- Currency: {report['source']['published_currency']}",
        "",
        "## Counts",
        f"- Rows before cleaning: **{report['counts']['rows_before_cleaning']}**",
        f"- Rows after cleaning: **{report['counts']['rows_after_cleaning']}**",
        f"- Customers before cleaning: **{report['counts']['customers_before_cleaning']}**",
        f"- Customers after cleaning: **{report['counts']['customers_after_cleaning']}**",
        f"- Exact duplicate rows: **{report['duplicates']['exact_duplicate_rows']}**",
        f"- Missing CustomerID rows: **{report['invalid_records']['missing_customer_id']}**",
        f"- Invalid numeric rows: **{report['invalid_records']['invalid_numeric']}**",
        f"- Invalid date rows: **{report['invalid_records']['invalid_date']}**",
        f"- Rejected from processed output: **{report['invalid_records']['rejected_from_customer_level_output']}**",
        "",
        "## Date range",
        f"- Minimum: `{report['date_range']['min']}`",
        f"- Maximum: `{report['date_range']['max']}`",
        "",
        "## Transformations",
        *[f"- {item}" for item in report["transformations"]],
    ]
    (quality_dir / "online_retail_quality.md").write_text("\n".join(markdown) + "\n", encoding="utf-8")
    return report


def download_source(destination: Path, url: str = SOURCE_URL) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return destination
    with urllib.request.urlopen(url, timeout=60) as response, destination.open("wb") as handle:
        while chunk := response.read(1024 * 1024):
            handle.write(chunk)
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Local .xlsx or .csv source file")
    parser.add_argument("--download", action="store_true", help="Download the official UCI ZIP and extract the workbook")
    parser.add_argument("--output-dir", type=Path, default=Path("data"), help="Data artifact root")
    args = parser.parse_args()

    source = args.source
    archive: Path | None = None
    temporary_directory: TemporaryDirectory[str] | None = None
    if args.download:
        archive = download_source(args.output_dir / "raw" / "online-retail.zip")
        temporary_directory = TemporaryDirectory()
        with zipfile.ZipFile(archive) as package:
            workbook_name = next(name for name in package.namelist() if name.lower().endswith(".xlsx"))
            package.extract(workbook_name, temporary_directory.name)
            source = Path(temporary_directory.name) / workbook_name
    if source is None:
        parser.error("Provide --source PATH or use --download")

    report = ingest(source, args.output_dir, source_archive=archive if args.download else None)
    print(json.dumps({"status": report["overall_quality_status"], "rows": report["counts"]["rows_after_cleaning"], "customers": report["counts"]["customers_after_cleaning"]}, indent=2))
    if temporary_directory is not None:
        temporary_directory.cleanup()
    return 0


if __name__ == "__main__":
    sys.exit(main())
