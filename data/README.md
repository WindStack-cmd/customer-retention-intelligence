# Data Directory

This directory separates external source data from derived artifacts and the existing UI demo contract.

```text
data/
├── raw/       downloaded source archives or source files; never edited
├── staging/   normalized row-level intermediate outputs
├── processed/ customer-level or analysis-ready outputs
└── quality/   machine-readable and human-readable quality reports
```

The primary Phase 2 source is **REAL SOURCE DATA** from the UCI Machine Learning Repository's Online Retail dataset. It is downloaded only by the explicit ingestion command and is ignored by Git because the archive is external data.

The existing dashboard contract in `shared/retentionData.ts` is **SYNTHETIC DEMO DATA**. It is not stored in this directory, is not silently mixed with the UCI source, and remains unchanged until a later product-integration phase.

The ingestion pipeline records source URL, retrieval timestamp, archive checksum, source workbook name, row and column counts, transformations, and quality results. It can be rerun from the same local raw archive without editing the raw file.
