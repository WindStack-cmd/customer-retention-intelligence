# Phase 0 — Project Planning

**Project:** Pulseboard — Customer Retention & Revenue Intelligence
**Repository:** `customer-retention-web-v2`
**Planning status:** Complete
**Scope rule:** Phase 0 only; no Phase 1 implementation started.

## Current Baseline

The repository is a WebDev full-stack project initialized from the React 19 + Vite + Tailwind 4 + Express 4 + tRPC 11 + Drizzle + MySQL/TiDB + Manus OAuth template. The active preview is healthy and the current checkpoint is the Phase 1 dashboard prototype delivered before this planning pass.

The implemented product surface is an executive retention overview named **Pulseboard**. It includes a dark B2B analytics design system, responsive navigation, KPI cards, a risk trajectory visualization, segment prioritization, a searchable and filterable priority-customer table, and a customer detail drawer with recommended next-best actions. The overview is served through a typed public tRPC procedure and currently reads from a shared TypeScript demo contract.

The current data contract is explicitly labeled **SIMULATED** and describes itself as a synthetic demo layer based on the public Telco Customer Churn schema. It is useful for validating the product interaction model, but it is not yet a data pipeline, a trained model, or a production analytics source.

## Existing Components

| Area                      | Existing implementation                                                                                                   | Assessment                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Frontend                  | React 19, Vite, Tailwind 4, shadcn-style UI primitives, Lucide icons, responsive dashboard in `client/src/pages/Home.tsx` | Working prototype; needs route decomposition for the full product                             |
| Application shell         | `client/src/App.tsx`, theme context, error boundary, dashboard components                                                 | Working foundation                                                                            |
| Backend                   | Express server with tRPC router in `server/routers.ts`                                                                    | Working foundation; only auth and demo overview procedures exist                              |
| Authentication            | Manus OAuth template, user context, logout flow                                                                           | Available; RBAC policy and workspace roles are not yet designed                               |
| Database                  | Drizzle schema with only the template `users` table                                                                       | Database runtime is available; retention domain schema is not implemented                     |
| Data contract             | `shared/retentionData.ts`                                                                                                 | Synthetic and clearly labeled; must be replaced or supplemented by persisted, calculated data |
| Tests                     | `server/auth.logout.test.ts`, `server/retention.overview.test.ts`                                                         | Basic unit coverage; no data, ML, API, security, or leakage suites yet                        |
| Migrations                | Template migration present; no retention-domain migration                                                                 | Database phase is not started                                                                 |
| MLOps                     | None                                                                                                                      | Planned only                                                                                  |
| GenAI analyst             | None                                                                                                                      | Planned only                                                                                  |
| CI/CD and deployment docs | Template scripts and managed WebDev runtime                                                                               | Reproducible build exists; production workflow and hardening are not yet documented           |

## Architecture Decisions

### 1. Start with a modular monolith

The first production-demo implementation will remain a modular monolith: a single web application, a single API process, and a relational database. Domain boundaries will be explicit in code (`ingestion`, `analytics`, `modeling`, `retention`, `monitoring`, and `assistant`) without introducing distributed services prematurely. This keeps local development and deployment tractable while preserving a path to extraction if scale requires it.

### 2. Separate source data, derived data, predictions, and actions

The data model will distinguish raw or normalized customer facts from feature snapshots, model predictions, explanations, revenue calculations, recommendations, interventions, and audit events. A prediction must be traceable to a model version, scoring timestamp, feature snapshot, and prediction horizon.

### 3. Preserve temporal correctness

Feature computation and evaluation will use an explicit `asOf` or prediction timestamp. Training and evaluation will prefer time-based splits. Any feature that uses information after the scoring timestamp will be treated as leakage and rejected by tests or validation checks.

### 4. Make data provenance visible in the product

The UI will distinguish public, licensed, synthetic, and user-imported data. Metrics will display their calculation source or run metadata where practical. Synthetic data is acceptable for the demo phase but must never be represented as observed production behavior.

### 5. Use a baseline-first ML strategy

The first churn model will be interpretable logistic regression with a documented churn definition and temporal validation. Tree-based candidates can be added only when they improve business-relevant metrics such as PR-AUC, Recall@Top-K, calibration, or expected saveable revenue. Model complexity will not be treated as a goal.

### 6. Recommendations must be economically constrained

A retention recommendation will include expected benefit, estimated intervention cost, confidence, and an explanation. The priority score should combine churn probability, customer value, saveability, urgency, and action economics rather than ranking customers by churn probability alone.

### 7. GenAI will be read-only and grounded

The future analyst will operate through approved server-side tools. It will generate validated read-only SQL or invoke curated analytics procedures, return source metadata, and write an audit event. It will not invent metrics, mutate business data, or execute arbitrary write queries.

### 8. Managed runtime constraints are part of the design

The WebDev project runs as a single managed web-server process. Long-running workers, local model servers, and persistent queues will not be assumed inside the request runtime. Scheduled or heavy jobs will be evaluated separately against the platform's supported scheduling or persistent-computing options before implementation.

## Technology Decisions

| Capability     | Decision                                                                                                        | Rationale                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| UI             | React 19 + TypeScript + Vite + Tailwind 4                                                                       | Already provisioned, fast iteration, strong type sharing                                                                     |
| UI primitives  | Existing shadcn-style components + Lucide                                                                       | Consistent accessibility and low custom CSS overhead                                                                         |
| API            | tRPC 11 over the existing Express server                                                                        | End-to-end contracts and low duplication between server and client                                                           |
| Persistence    | Drizzle ORM with MySQL/TiDB                                                                                     | Already provisioned by the full-stack scaffold; relational constraints fit the domain                                        |
| Auth           | Manus OAuth with server-side context                                                                            | Already provisioned; avoids custom credential handling                                                                       |
| Validation     | Zod at API boundaries; lightweight data-quality validators first                                                | Existing dependency and suitable for request/domain validation                                                               |
| Analytics      | SQL-first transformations with typed server helpers                                                             | Keeps business definitions auditable and avoids hiding logic in the UI                                                       |
| ML             | Python pipeline is the preferred future execution boundary; model artifacts and metrics persisted with metadata | Python ecosystem is appropriate for tabular churn modeling, but it should not be introduced until the data contract is ready |
| Explainability | SHAP or a documented coefficient-based explanation depending on selected model                                  | Explanation method must match the model and be validated against model behavior                                              |
| GenAI          | Built-in server-side LLM integration only after grounded analytics procedures exist                             | Prevents fabricated answers and keeps secrets server-side                                                                    |
| Observability  | Structured logs, run metadata, model metrics, data-quality metrics, and audit events                            | Required for the production-readiness gate                                                                                   |
| Testing        | Vitest for TypeScript/API logic plus targeted data/ML test suites when those layers exist                       | Matches the current repository and allows incremental coverage                                                               |

## Planned Domain Boundaries

```text
client/
  pages/                 Product views and route-level composition
  components/            Reusable presentation and interaction components
  lib/                   tRPC client and frontend utilities
server/
  routers/               Domain-specific tRPC routers
  services/              Retention, analytics, monitoring, and assistant services
  jobs/                  Bounded ingestion/scoring entry points, if supported
  _core/                 Framework plumbing; avoid unnecessary edits
drizzle/
  schema.ts              Relational domain schema
  migrations/            Generated migration history
shared/
  contracts/             Shared DTOs, enums, and data-source metadata
data/
  raw/                    Local development inputs only, never committed secrets
  processed/              Reproducible derived artifacts where appropriate
ml/
  features/              Feature definitions and leakage checks
  training/              Training/evaluation entry points
  artifacts/             Model metadata, not large binaries in git
docs/
  PHASE-0-PLAN.md        This planning record
  architecture/          ERD, ADRs, feature definitions, and runbooks
```

The directory boundaries above are the target architecture. Only the existing `docs/PHASE-0-PLAN.md` file was added in this phase; the remaining directories will be introduced in their respective phases.

## 16-Phase Roadmap

| Phase      | Scope                                 | Exit criteria                                                                                                                                           |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0          | Project planning                      | Baseline, architecture, decisions, risks, and roadmap documented                                                                                        |
| 1          | Repository foundation                 | Environment/config conventions, logging, documentation skeleton, and clean reproducible checks                                                          |
| 2          | Dataset ingestion                     | Legitimate source selected, raw/normalized load, schema and quality report, provenance recorded                                                         |
| 3          | Database                              | Retention-domain tables, keys, indexes, constraints, migrations, and seed/load path                                                                     |
| 4          | Feature engineering                   | Versioned customer features with definitions, windows, temporal checks, and leakage tests                                                               |
| 5          | Churn modeling                        | Churn label, baseline/candidate comparison, temporal evaluation, calibration, model registry record                                                     |
| 6          | Explainability                        | Global and customer-level explanations validated against the selected model                                                                             |
| 7          | CLV + revenue intelligence            | CLV, revenue-at-risk, saveability, priority scoring, and segment financial views calculated from stored data                                            |
| 8          | Retention engine                      | Rule-based recommendations, intervention economics, action explanations, and outcome tracking                                                           |
| 9          | Backend                               | Auth/RBAC, customer/analytics/prediction/recommendation/monitoring APIs with validation and audit events                                                |
| 10         | Frontend                              | Executive dashboard plus customer risk, profile, revenue, segment, action, model, quality, and settings views                                           |
| 11         | GenAI analyst                         | Read-only tools, SQL validation, grounded answers, citations/metadata, and assistant audit logs                                                         |
| 12         | MLOps                                 | Model versioning, drift, data-quality, performance, and prediction monitoring                                                                           |
| 13         | Testing                               | Unit, integration, API, ML, security, temporal-leakage, and regression coverage                                                                         |
| 14         | CI/CD                                 | Automated format/lint, type checks, tests, build verification, and dependency/security checks                                                           |
| 15         | Deployment                            | Container/runtime docs, production configuration, health checks, and reproducible deployment procedure                                                  |
| Final gate | Production-readiness and polish audit | No blocking issues, no fake production metrics/predictions/AI, traceable calculations, tested major functionality, and docs aligned with implementation |

Each phase must follow **plan → implement → test → verify → document → report**. A phase may not be marked complete solely because its UI exists.

## Known Issues and Risks

1. The current overview values are synthetic demo values and must not be used as evidence of model performance or business impact.
2. There is no selected source dataset, ingestion contract, or data-quality report yet.
3. The database contains only the auth user table; no customer, event, feature, prediction, recommendation, or audit tables exist.
4. The current `retention.overview` procedure is public and returns a static contract; production analytics must be access-controlled and database-backed.
5. No churn label definition has been implemented, and no trained model is connected to the application.
6. The current dashboard contains planned affordances that display coming-soon feedback; these are intentionally not fake backend actions.
7. No RBAC policy, workspace isolation model, rate limits, or assistant query security design has been implemented.
8. The repository has no dedicated CI/CD workflow, data pipeline runner, ML artifact registry, or monitoring store.
9. The project currently has no root README; this Phase 0 plan is the first durable project-level planning document.

## Phase 0 Verification

- Existing WebDev project inspected at `/home/ubuntu/customer-retention-web-v2`.
- Active server verified as running at the managed preview URL.
- TypeScript and unit tests were already passing at the preceding checkpoint; current tests cover auth logout and the demo retention overview contract.
- Production build was already verified at the preceding checkpoint.
- Repository inventory confirms there are no retention-domain migrations, ML pipeline files, CI workflow, or production data artifacts.
- This phase added documentation only and did not begin Phase 1 implementation.

## Handoff

**Next phase:** Phase 1 — Repository Foundation.

Phase 1 should begin by establishing configuration conventions, structured logging, a root README, documentation structure, environment examples without secrets, and clean-environment verification. It should not yet claim that the platform has real ingestion, predictions, or grounded AI functionality.
