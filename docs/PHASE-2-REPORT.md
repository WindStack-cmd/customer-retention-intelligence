# PHASE 2 — DATA INGESTION & DATA QUALITY REPORT

## Status

**COMPLETE**

Phase 2 implemented a reproducible ingestion and data-quality foundation around one legitimate public source: the UCI Machine Learning Repository Online Retail dataset. The pipeline downloaded and processed the official archive, preserved source provenance, generated normalized/staging and processed outputs, produced machine-readable and human-readable quality reports, and added fixture-based automated tests.

No ML model, churn prediction model, feature-engineering layer, retention recommendation engine, GenAI, final retention database schema, or major frontend redesign was implemented.

## Dataset selected

**UCI Machine Learning Repository — Online Retail, dataset 352.**

The primary source page is <https://archive.ics.uci.edu/dataset/352/online+retail>, with canonical DOI <https://doi.org/10.24432/C5BW33> and official archive URL <https://archive.ics.uci.edu/static/public/352/online+retail.zip>. UCI identifies the license as **CC BY 4.0**, so attribution is required for reuse. The source is an Excel workbook named `Online Retail.xlsx` inside the official ZIP archive.

UCI documents 541,909 transaction line-item rows, eight fields, GBP pricing, and a period from 2010-12-01 through 2011-12-09. The pipeline derived 4,372 distinct non-null customer identifiers from the actual source. This count is a pipeline result, not a published UCI metadata field.

The source was selected because it provides stable public provenance, a DOI, free reuse with attribution, dated transaction activity, customer identifiers, invoice cancellation markers, quantities, prices, and a manageable local footprint. It supports RFM, repeat-purchase, cohort, and inactivity analysis without pretending that an original churn label exists.

IBM Telco Customer Churn was not selected as the primary dataset because it is a fictional cross-sectional snapshot without event timestamps or repeated activity, and its dataset-specific redistribution rights are not clearly separated from its repository code license. Olist Brazilian E-Commerce was not selected as the primary source because its CC BY-NC-SA 4.0 license is noncommercial/share-alike, its relational reconciliation is more complex, and its source page does not explicitly identify a currency code. The full comparison and rationale are recorded in `docs/PHASE-2-DATASET.md`.

## Source and provenance

The downloaded archive was stored under `data/raw/online-retail.zip` and is ignored by Git. The archive SHA-256 is:

```text
f5385cbb54bbebf7196389109c6b0621faab0c304e3702548165e71c84aede8b
```

The extracted workbook SHA-256 is:

```text
43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d
```

The raw archive was not edited. The pipeline records source URL, retrieval timestamp, archive filename and checksum, workbook filename and checksum, format, currency, row and column counts, transformations, and quality findings. Raw, staging, and processed data are excluded from Git because they are generated/external artifacts; source documentation, pipeline code, and quality reports remain reviewable.

## Dataset statistics from the actual ingestion

| Metric                                             |                      Result |
| -------------------------------------------------- | --------------------------: |
| Source rows before cleaning                        |                     541,909 |
| Rows in processed output                           |                     406,829 |
| Rows rejected from processed customer-level output |                     135,080 |
| Distinct customers before cleaning                 |                       4,372 |
| Distinct customers after cleaning                  |                       4,372 |
| Observed columns                                   |                           8 |
| Exact duplicate rows                               |                       5,268 |
| Missing `CustomerID` rows                          |          135,080 (24.9267%) |
| Invalid numeric rows                               |                           0 |
| Invalid date rows                                  |                           0 |
| Future dates                                       |                           0 |
| Negative quantity rows                             |                      10,624 |
| Negative unit-price rows                           |                           2 |
| Zero unit-price rows                               |                       2,515 |
| Minimum source date                                |         2010-12-01 08:26:00 |
| Maximum source date                                |         2011-12-09 12:50:00 |
| Quantity range                                     |           -80,995 to 80,995 |
| Unit-price range                                   | -11,062.06 to 38,970.00 GBP |

The overall source quality status is **WARNING**, not FAIL. The warning is driven by missing customer identifiers, duplicate line-level values, cancellations/returns, negative prices, and zero prices. These findings are reported explicitly and are not silently deleted or converted into fabricated business values.

## Files created

- `data/README.md`
- `data/quality/online_retail_quality.json`
- `data/quality/online_retail_quality.md`
- `docs/PHASE-2-DATASET.md`
- `docs/PHASE-2-REPORT.md`
- `pipelines/README.md`
- `pipelines/ingest_online_retail.py`
- `pipelines/test_ingest_online_retail.py`

Generated `data/raw/`, `data/staging/`, and `data/processed/` artifacts exist locally for reproducibility but are ignored by Git because they are external or generated data.

## Files modified

- `.gitignore` — added `data/staging/` to the existing raw/processed data safety boundary.
- `DEVELOPMENT.md` — documented Phase 2 commands, artifact handling, and current product-layer limitation.
- `package.json` — added `data:test` and `data:ingest` scripts.

## Files removed

None.

## Pipeline architecture

```text
Official UCI ZIP or local .xlsx/.csv source
  ↓
Workbook/CSV reader
  ↓
Expected-column validation
  ↓
String and type normalization
  ↓
Missing-value and duplicate analysis
  ↓
Numeric/date/business-rule checks
  ↓
Normalized staging CSV with flags and line revenue
  ↓
Processed CSV excluding rows without CustomerID or valid numeric/date fields
  ↓
Machine-readable JSON + human-readable Markdown quality reports
```

The implementation uses only Python's standard library. It supports a local source path for offline reruns and a `--download` option for the official UCI archive. Re-running from the same archive produces deterministic normalized and processed data outputs; the fixture suite verifies this behavior independently of the network.

## Validation rules

The pipeline validates the expected eight columns and reports missing or unexpected columns, empty sources, row and column counts, field-level null counts and percentages, exact duplicate rows, duplicate invoice identifiers, duplicate customer identifiers, numeric parseability, date parseability, future dates, customer identifier presence, and source date ranges. It also reports negative quantities, negative prices, zero prices, and cancellation markers as business-rule findings.

Duplicate invoice and customer identifiers are expected at line-item/customer grain and are reported rather than deleted. Missing customer identifiers are excluded from the processed customer-level output but retained in normalized staging and the quality report. Invalid numeric/date rows follow the same documented exclusion boundary.

## Cleaning rules

| Rule                                                                   | Reason                                                          |                                                      Before |                                       After | Impact                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------: | ------------------------------------------: | ------------------------------------------ |
| Trim and normalize expected string columns                             | Make source values stable for validation and downstream parsing |                                             All source rows |                     541,909 normalized rows | No row removal                             |
| Parse `Quantity`, `UnitPrice`, and `InvoiceDate`                       | Establish typed validity flags                                  |                                         541,909 source rows | 0 invalid numeric rows; 0 invalid date rows | No row removal for actual source           |
| Derive `line_revenue_gbp = Quantity × UnitPrice`                       | Make revenue derivation explicit and reproducible               |                                    No source revenue column |      Added to staging and processed outputs | Does not claim to be net revenue           |
| Exclude rows without `CustomerID` from processed customer-level output | Customer-level analysis requires an identifier                  |                                       135,080 rows affected |                       406,829 rows retained | All affected rows remain in staging/report |
| Retain cancellation and negative-quantity rows with flags              | Returns/cancellations require a later business definition       | 10,624 negative-quantity rows; cancellation markers present |                   Rows retained and flagged | No silent deletion                         |
| Report negative/zero prices rather than fabricate corrections          | Values may reflect source-specific semantics                    |                2 negative-price rows; 2,515 zero-price rows |                  Rows retained and reported | Requires later feature policy              |

## Data-quality outputs

The machine-readable report is `data/quality/online_retail_quality.json`, and the human-readable report is `data/quality/online_retail_quality.md`. Both contain source metadata, timestamps, checksums, before/after row counts, customer counts, duplicate findings, missing values, invalid records, date range, numerical ranges, transformation summary, and the overall `WARNING` status.

## Churn boundary

The UCI dataset has **no original churn label**. Phase 2 does not create one. In a later feature/modeling phase, churn may be derived as a prospective behavioral proxy: an eligible customer purchases before an observation cutoff and makes no qualifying purchase during a documented future horizon, with censoring and cancellation/return treatment made explicit. That target must not be described as an observed UCI churn label.

## Tests

`pnpm data:test` passed three fixture tests covering valid/invalid mixed ingestion, missing required columns, numeric/date validity, duplicate detection, rejected-row accounting, and deterministic processed-output behavior. Tests do not download the external dataset.

## Build, lint, and type-check results

| Check                 | Result                     |
| --------------------- | -------------------------- |
| Data fixture tests    | PASS — 3 tests             |
| Formatting            | PASS — `pnpm format:check` |
| TypeScript            | PASS — `pnpm typecheck`    |
| ESLint                | PASS — `pnpm lint`         |
| Existing Vitest suite | PASS — 3 files / 5 tests   |
| Production build      | PASS — `pnpm build`        |

The build emitted the existing Vite chunk-size warning; it did not fail and no frontend redesign was made.

## Dashboard regression result

**PASS.** The existing Pulseboard dashboard still renders at the managed preview URL with its Overview navigation, KPI cards, risk trajectory, risk-by-segment panel, and synthetic-data behavior intact. The `retention.overview` tRPC procedure returned HTTP 200 and retained `SIMULATED` provenance. No Phase 2 source values were inserted into the dashboard, so no fake real-data metrics were introduced.

The health endpoint returned `status: ok`, `demoMode: true`, and an `x-request-id` response header after the data work. The application remained running throughout verification.

## Security and Git checks

No tracked `.env`, key, certificate, API-token, or database-credential files were found. No obvious secret-like patterns were found in tracked source. The external archive, staging CSV, and processed CSV are ignored by Git. Only source code, documentation, quality reports, and intended configuration changes appear in the working tree.

## Known limitations

The UCI source is historical, represents one UK non-store retailer, and does not include marketing exposure, intervention outcomes, demographics, or an original churn label. Missing customer identifiers remove about 24.93% of rows from the customer-level processed output. Negative quantities, negative prices, zero prices, cancellations, and duplicate line-level values require explicit feature-engineering decisions later. The derived line revenue is a gross line-value proxy, not a validated net revenue or profit measure. The existing dashboard does not consume the Phase 2 artifacts.

## Remaining blockers

There are no Phase 2 implementation blockers. The earlier Phase 1 `.env.example` platform limitation remains documented but did not prevent this local, non-secret data pipeline. The data license requires attribution, and any commercial or production use must respect UCI's CC BY 4.0 terms and separately govern future operational data.

## Exact recommendation for Phase 3

Proceed to **Phase 3 — Database** only after reviewing and accepting the `WARNING` findings. Design a relational retention-domain schema that preserves source grain and provenance: source runs, invoices, line items, customers, data-quality findings, and normalized monetary/activity facts. Add constraints and indexes for customer/invoice relationships, keep the synthetic dashboard contract separate, and create an idempotent load path from the Phase 2 processed output. Do not add ML or GenAI in Phase 3.
