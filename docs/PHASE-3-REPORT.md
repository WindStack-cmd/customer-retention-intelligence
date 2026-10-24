# PHASE 3 — FINAL DATABASE, INVOICE-ITEM, AND RECONCILIATION REPORT

## Status

**COMPLETE.** Phase 3 loaded the complete UCI Online Retail source and customer-linked analytical foundation into MySQL/TiDB, including all processed invoice items. The implementation preserves source provenance, missing-customer rows, cancellation and return semantics, deterministic source-row hashes, resumable checkpoints, and bounded independent database commits. Phase 4 was not started.

## Final database counts

| Entity                         | Expected |  Actual | Result |
| ------------------------------ | -------: | ------: | ------ |
| Normalized source rows         |  541,909 | 541,909 | PASS   |
| Processed customer-linked rows |  406,829 | 406,829 | PASS   |
| Customers                      |    4,372 |   4,372 | PASS   |
| Products                       |    3,684 |   3,684 | PASS   |
| Orders/invoices                |   22,190 |  22,190 | PASS   |
| Invoice items                  |  406,829 | 406,829 | PASS   |

The source and invoice-item physical checkpoint is `541,910` because the importer preserves the original normalized `_row_number`, where the CSV header precedes source row 1. The logical processed count is authoritative for invoice-item completion.

## Import and performance behavior

The importer uses one streaming iterator per source-stage or invoice-item-stage execution, deterministic SHA-256 source-row hashes, idempotent upserts, and bounded independent commits. Completed source dimensions are verified before customer, product, and order mappings are reused rather than rebuilt from the processed CSV. Invoice-item loading was validated with 500-row database batches and then completed using that configuration. No giant transaction or whole-file in-memory load was used.

The final invoice-item run resumed from checkpoint `446,220` and completed with 142 bounded chunks. The final chunk contained 129 rows, and the process exited normally with the importer reporting `406,829` processed item rows.

## Returns, cancellations, and exclusions

The normalized source contains 9,288 cancellation-marked rows and 10,624 negative-quantity rows. The processed customer-linked output and `invoice_items` contain 8,905 cancellation-marked and negative-quantity rows. The difference is expected because 135,080 source rows lack `CustomerID` and remain only in the source/staging layer; 383 cancellation/negative-quantity records are among those excluded customer-level rows. Legitimate negative quantities were retained in both source and processed analytical layers whenever a customer identifier was present.

There were 135,080 missing-`CustomerID` rows and 135,080 rows excluded from the customer-linked processed output. The source layer retains them without fabricating customer identities. There were 2 negative-unit-price rows and 2,515 zero-unit-price rows; both findings remain documented as data-quality conditions rather than being silently corrected.

## Revenue reconciliation

All monetary values below are GBP and use the Phase 2 line-value definition `Quantity × UnitPrice`. This is a **gross line-value proxy**, not recognized net revenue, profit, margin, or cash collection.

| Metric                                      |         Value |
| ------------------------------------------- | ------------: |
| All-source gross line value                 | £9,747,747.93 |
| Processed customer-linked gross line value  | £8,300,065.81 |
| Excluded source-row difference              | £1,447,682.12 |
| Invoice-item database gross line value      | £8,300,065.81 |
| Invoice-item positive line value            | £8,911,407.90 |
| Invoice-item return/cancellation line value |  −£611,342.09 |
| Signed net line value after returns         | £8,300,065.81 |

The excluded difference equals the gross line value of rows without `CustomerID`, which remain in `retail_source_rows` but are not loaded into customer-linked `invoice_items`. The signed net line value is defined as the sum of all processed `lineRevenue` values, including negative return/cancellation values. It must not be described as validated accounting net revenue.

## Integrity and lineage

The final checks found no duplicate `sourceRowHash` groups in either source rows or invoice items. There were no orphan order references, product references, or provenance references. Every invoice item had a source-row mapping, and all 406,829 processed rows were covered. The run used processing ID `30001` and quality run ID `30001`.

The single provenance record preserves the UCI source workbook SHA-256 `43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d`, archive SHA-256 `f5385cbb54bbebf7196389109c6b0621faab0c304e3702548165e71c84aede8b`, and transformation version `phase2-stdlib-v1`.

## Data-quality materialization

The quality run status remains **WARNING**, correctly reflecting the underlying source conditions. Five quality issues were materialized: missing customer identifiers, exact duplicate source rows, negative quantities, negative unit prices, and zero unit prices. The exact duplicate rows and repeated invoice/customer identifiers are preserved because they occur at line-item or customer activity grain and are not evidence that the rows should be deleted.

## Verification

The final verification suite includes data fixture tests, Vitest, TypeScript, ESLint, scoped formatting, Drizzle migration consistency, production build, health endpoint, request-ID behavior, and the existing dashboard/tRPC regression path. Phase 3 does not replace the dashboard's clearly labeled synthetic/demo metrics, and no Phase 4 functionality was started.

## Remaining blockers

There are no Phase 3 implementation blockers. The dataset remains historical and source-specific, the quality status remains WARNING, and the derived monetary values are line-value proxies rather than accounting revenue. Future work should define analytical treatment of returns, cancellations, negative prices, and prospective churn labels before building models or connecting real metrics to the dashboard.
