# Pulseboard Architecture

## Scope and truth boundary

This document distinguishes what exists in the repository today from what is planned. A planned component is not considered implemented because the dashboard contains a navigation label or a placeholder action.

## Implemented now

```text
Browser
  ↓
React 19 + Vite + Tailwind UI
  ↓
tRPC client
  ↓
Express server
  ├── Manus OAuth routes and session context
  ├── `/health` availability endpoint
  ├── request ID and structured request logging
  └── `/api/trpc` application router
        ├── auth.me / auth.logout
        └── retention.overview
              ↓
        typed synthetic demo contract

Drizzle configuration
  ↓
MySQL/TiDB connection helper
  ↓
users table only
```

The current `retention.overview` procedure is public and returns the explicitly labeled synthetic demo overview. It does not query customer records, run a model, or calculate production metrics.

## Planned architecture

```text
Public/licensed dataset or user-owned events
  ↓
Data ingestion
  ↓
Schema, quality, provenance, and business-rule validation
  ↓
Normalized relational database
  ↓
Temporal feature engineering
  ↓
Churn model + calibration + model registry
  ↓
Explainability layer
  ↓
CLV + revenue-at-risk + saveability calculations
  ↓
Economically constrained retention engine
  ↓
Authenticated API and audit layer
  ↓
Enterprise frontend
  ↓
Grounded, read-only GenAI analyst
```

## Planned domain boundaries

- **Ingestion:** source adapters, raw-file metadata, validation results, and normalized loads.
- **Analytics:** customer-level aggregates, feature snapshots, segment calculations, CLV, and financial metrics.
- **Modeling:** labels, training runs, model versions, predictions, calibration, drift, and performance metrics.
- **Explainability:** global importance, customer-level factors, explanation validation, and provenance.
- **Retention:** recommendations, expected benefit/cost, interventions, outcomes, and next-best actions.
- **Monitoring:** data quality, model health, pipeline runs, audit events, and system health.
- **Assistant:** read-only analytics tools, SQL validation, citations, and assistant audit events.

## Key architectural rules

1. **Temporal correctness:** every feature and prediction has an `asOf` timestamp and prediction horizon.
2. **Provenance:** metrics identify their source, run, or data status; synthetic data is never presented as observed production data.
3. **Separation of concerns:** raw facts, derived features, predictions, explanations, recommendations, and actions are persisted separately.
4. **Baseline first:** logistic regression is the first model candidate; more complex models must justify their complexity through validated business metrics.
5. **Read-only assistant:** GenAI can query approved analytics tools only; arbitrary writes and unvalidated SQL are prohibited.
6. **Managed runtime safety:** no assumption is made that a request process can host permanent workers, GPU workloads, or a local model server.

## Phase boundary

Phase 1 establishes operational and documentation foundations only. Real ingestion begins in Phase 2, the final domain schema in Phase 3, and modeling in Phase 5. The dashboard should remain stable while those capabilities are added behind typed, testable services.
