# Phase 2 Dataset Selection — UCI Online Retail

## Selected primary dataset

**UCI Machine Learning Repository — Online Retail, dataset 352**

- **Source page:** <https://archive.ics.uci.edu/dataset/352/online+retail>
- **Canonical DOI:** <https://doi.org/10.24432/C5BW33>
- **Official archive:** <https://archive.ics.uci.edu/static/public/352/online+retail.zip>
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0), as stated by UCI. Any redistribution or derivative use must retain appropriate attribution.
- **Format:** Microsoft Excel workbook (`Online Retail.xlsx`) inside the official ZIP archive.
- **Published size:** 22.6 MB workbook according to the UCI page.
- **Published records:** 541,909 transaction line-item rows.
- **Customers:** UCI does not publish a distinct `CustomerID` count in the dataset metadata. The pipeline derives the count from non-null customer identifiers and records that result in its quality report.
- **Currency:** GBP/pounds sterling, based on UCI's description of `UnitPrice`.
- **Time range:** 2010-12-01 through 2011-12-09, as stated by UCI.

## Available fields

The source contains eight columns: `InvoiceNo`, `StockCode`, `Description`, `Quantity`, `InvoiceDate`, `UnitPrice`, `CustomerID`, and `Country`.

`InvoiceNo` identifies the invoice and uses a leading `C` to indicate a cancellation. `Quantity` and `UnitPrice` support a derived line revenue calculation. `InvoiceDate` provides dated activity. `CustomerID` supports customer-level aggregation, and `Country` provides geography.

## Why this dataset was selected

UCI Online Retail best balances public provenance, free reuse, dated transaction history, customer-level identifiers, and a manageable local footprint. It supports RFM, repeat-purchase, cohort, and inactivity analysis without pretending that an observed churn label exists. UCI also provides a stable page, DOI, published schema, date range, record count, and license statement.

IBM Telco Customer Churn was not selected as the primary source because it is a fictional cross-sectional snapshot with an explicit label but no event timestamps or repeat observations, and its dataset-specific reuse terms are not clearly separated from the repository's code license. Olist Brazilian E-Commerce was not selected as the primary source because its CC BY-NC-SA 4.0 license is noncommercial/share-alike, its relational joins are more complex, and its page does not explicitly identify the currency code. Both remain possible secondary benchmarks for later evaluation, subject to separate provenance review.

## Provenance and retrieval

The ingestion script downloads the official UCI ZIP archive only when explicitly requested. It records the retrieval URL, retrieval timestamp, downloaded archive name, SHA-256 checksum, source workbook name, source row/column counts, and all transformations in a machine-readable metadata report. The raw archive is ignored by Git because it is external data rather than source code. The raw source is never edited in place.

The pipeline is designed to be rerunnable. It can ingest either the official ZIP archive or a local workbook path, which makes tests independent of network access and allows a checksum-pinned rerun.

## Quality and cleaning boundary

Phase 2 validates the expected eight columns, workbook structure, nulls, duplicate rows, duplicate invoice IDs, numeric validity, date parsing, future dates, and customer-identifier integrity. It preserves suspicious rows in the quality report and writes rejected rows separately when a defensible rule requires exclusion from the processed output.

The initial defensible processing rule is to retain all source rows in the normalized staging output, add derived `line_revenue_gbp = Quantity × UnitPrice`, and exclude rows with missing `CustomerID`, invalid dates, non-numeric quantities/prices, or non-finite numeric values from the customer-level processed output. Cancellation and negative-quantity rows are retained and flagged rather than silently deleted; their business treatment is deferred to the feature-engineering phase.

## Churn boundary

The dataset does **not** contain an original churn label. Any future churn target will be derived later as a documented behavioral proxy, for example: an eligible customer makes qualifying purchases before an observation cutoff and makes no qualifying purchase during a subsequent horizon, with right-censoring handled explicitly. That derived label must never be described as an original UCI churn label.
