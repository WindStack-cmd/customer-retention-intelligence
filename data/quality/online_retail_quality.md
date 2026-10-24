# UCI Online Retail Data Quality Report

**Overall status:** `WARNING`
**Generated:** `2026-09-12T18:14:03.955673+00:00`

## Source
- Dataset: UCI Online Retail (dataset 352)
- URL: https://archive.ics.uci.edu/static/public/352/online+retail.zip
- File: `Online Retail.xlsx`
- SHA-256: `43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d`
- Currency: GBP

## Counts
- Rows before cleaning: **541909**
- Rows after cleaning: **406829**
- Customers before cleaning: **4372**
- Customers after cleaning: **4372**
- Exact duplicate rows: **5268**
- Missing CustomerID rows: **135080**
- Invalid numeric rows: **0**
- Invalid date rows: **0**
- Rejected from processed output: **135080**

## Date range
- Minimum: `2010-12-01 08:26:00`
- Maximum: `2011-12-09 12:50:00`

## Transformations
- Normalized expected columns and trimmed string values.
- Parsed numeric Quantity and UnitPrice values.
- Parsed InvoiceDate values and identified future dates.
- Added invoice cancellation flag from InvoiceNo leading C.
- Derived line_revenue_gbp as Quantity multiplied by UnitPrice.
- Excluded rows missing CustomerID or with invalid numeric/date fields from processed customer-level output; retained them in staging and quality counts.
- Retained cancellation and negative-quantity rows with flags; no silent deletion.
