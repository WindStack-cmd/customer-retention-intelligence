# Phase 2 Ingestion Pipeline

The Phase 2 pipeline uses only Python's standard library and targets the UCI Online Retail dataset. It supports the official ZIP archive or a local `.xlsx`/`.csv` source.

## Commands

From the repository root:

```bash
pnpm data:test
pnpm data:ingest
```

`data:test` runs small local fixtures and does not use the network. `data:ingest` downloads the official UCI ZIP only if `data/raw/online-retail.zip` is not already present, extracts the workbook to a temporary directory, and writes normalized and quality artifacts under `data/`.

The raw archive, staging CSV, and processed CSV are ignored by Git because they are generated/external data. The machine-readable JSON report, human-readable Markdown report, source documentation, and pipeline code are version-controlled.

## Pipeline

```text
Official UCI ZIP or local source
  ↓
Workbook/CSV reader
  ↓
Expected-column validation
  ↓
String and type normalization
  ↓
Missing-value and duplicate reporting
  ↓
Numeric/date/business-rule checks
  ↓
Staging CSV with flags and derived line revenue
  ↓
Processed CSV excluding rows without CustomerID or valid numeric/date fields
  ↓
JSON + Markdown quality reports
```

Cancellations and negative quantities are retained and flagged. They are not silently removed because returns and cancellations require an explicit business definition in later feature engineering. The pipeline does not create a churn label.
