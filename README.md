# Pulseboard

## Customer Retention & Revenue Intelligence Platform

Pulseboard turns customer transactions and model outputs into an evidence-led workspace for understanding churn risk, customer value, revenue exposure, and retention priorities.

[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![pnpm 10.4.1](https://img.shields.io/badge/pnpm-10.4.1-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=20232A)](https://react.dev/)
[![MySQL](https://img.shields.io/badge/Database-MySQL%20%2F%20TiDB-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)

> A production-inspired college project and portfolio application. Stored analytical results are presented as verified records; unavailable data and optional services are not represented as successful results.

## Contents

- [Overview](#overview)
- [Problem statement](#problem-statement)
- [Solution and key features](#solution-and-key-features)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Data and analytics](#data-and-analytics)
- [Project structure](#project-structure)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Usage guide](#usage-guide)
- [Testing and quality assurance](#testing-and-quality-assurance)
- [Security and data integrity](#security-and-data-integrity)
- [Current limitations](#current-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Overview

Pulseboard is a React dashboard backed by an Express/tRPC API and a MySQL/TiDB retention schema. It is intended for retention managers, customer-success teams, revenue operators, and analysts who need to move from a large customer list to a defensible set of priorities.

The application helps users:

- understand overall churn-risk and revenue exposure;
- inspect customer-level risk, value, and supporting records;
- prioritize customers using stored risk and recommendation outputs;
- review model, data-quality, provenance, and monitoring metadata; and
- ask a grounded business question when a compatible server-side AI provider is configured.

The dashboard is decision support. Risk scores and revenue-at-risk values are model-derived outputs, not guarantees of churn, recovery, profit, or intervention uplift.

## Problem statement

Repeat and recurring revenue can be reduced when valuable customers leave or become inactive. Transaction histories are difficult to interpret at scale, and treating every customer identically makes limited retention capacity less effective.

A useful retention workflow needs to connect:

1. customer and transaction facts;
2. temporally aligned behavioral features and labels;
3. churn-risk and customer-value outputs;
4. transparent provenance and data-quality signals; and
5. practical, prioritized retention recommendations.

Pulseboard implements that workflow around stored, inspectable records rather than claiming business impact that has not been measured.

## Solution and key features

### Executive retention and revenue overview

The authenticated dashboard summarizes scored customers, risk bands, customer value, and revenue exposure from the latest completed analytical runs.

### Customer-level investigation

The Customers area supports search, pagination, and risk filtering. Customer detail combines the customer record with its latest prediction, value result, recommendation, and available explanation data.

### Prioritization and retention actions

The Actions area lists stored retention recommendations grouped by verified priority. Recommendations are generated from persisted analytical records and do not claim that revenue is guaranteed to be saveable.

### Model and data context

The Data & Model area exposes available run metadata, cutoffs, feature versions, model provenance, data-quality information, and monitoring results. Monitoring records feature missingness, numeric drift, and outcome performance only when predictions and binary labels are aligned.

### Explanations

The database contains customer explanation records and explanation-run provenance. The recovered database currently contains no rows in `customer_explanation_features`, so per-feature SHAP attribution is not displayed as verified data.

### Grounded AI Analyst

The Analyst accepts scoped business questions about risk, priority customers, revenue at risk, CLV, segments, explanations, or recommendations. It builds a read-only context from approved database queries and sends that context to a configured Forge-compatible provider. The provider must be configured with `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY`; otherwise the application returns a clear configuration error and generates no answer.

The analyst is not a replacement for the database or model pipeline. It does not run arbitrary SQL, invent missing explanations, or turn model-derived values into guarantees.

### Stored results versus live computation

The dashboard reads completed stored runs. It does not retrain a model, regenerate SHAP values, or perform live inference during a normal page visit. The pipeline scripts can generate new records, but those commands modify local data and should be run deliberately.

## How it works

```text
UCI Online Retail source or approved recovered exports
              ↓
  Validation, provenance, and data-quality checks
              ↓
  Normalized MySQL/TiDB relational tables
              ↓
  Customer-level temporal features and behavior labels
              ↓
  Churn predictions and model-run metadata
              ↓
  Customer explanations, customer value, and revenue intelligence
              ↓
  Retention recommendations and monitoring records
              ↓
  Authenticated Express/tRPC APIs
              ↓
  React/Vite dashboard and optional grounded analyst
```

In the existing recovered local environment, the database contains restored customer, order, feature, label, prediction, explanation, value, recommendation, revenue-intelligence, and monitoring records. A fresh checkout does not include that database, raw dataset, recovery exports, secrets, or ignored model artifacts.

## Architecture

```text
Browser
  │
  ├─ React 19 + Vite + Tailwind UI
  │       └─ tRPC client
  │
  └────────────── Express server
                  ├─ Vite development middleware
                  ├─ OAuth routes and development-only local auth
                  ├─ /health
                  └─ /api/trpc
                      ├─ auth.me / auth.logout
                      ├─ analytics.executiveOverview
                      ├─ analytics.customers
                      ├─ analytics.customerDetail
                      ├─ analytics.recommendations
                      └─ analyst.ask
                              │
                              ├─ Drizzle ORM + mysql2
                              │       └─ MySQL / TiDB
                              │
                              └─ Optional Forge-compatible LLM provider

Python pipelines
  ├─ source ingestion and validation
  ├─ feature and label utilities
  ├─ churn-model utilities
  └─ SHAP recovery utilities and tests
```

The frontend and backend run in one development process through `pnpm dev`. The production build creates static frontend output and bundles the server entry point; `pnpm start` runs the production server.

## Technology stack

| Technology                                                 | Role                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| React 19                                                   | Dashboard UI                                              |
| Vite 7                                                     | Frontend development server and build                     |
| Tailwind CSS                                               | UI styling                                                |
| TypeScript 5.9                                             | Application and API type safety                           |
| Express 4                                                  | HTTP server and health/auth routes                        |
| tRPC 11                                                    | Typed application API                                     |
| Drizzle ORM 0.44                                           | MySQL/TiDB schema access and migrations                   |
| `mysql2`                                                   | Database driver                                           |
| Python 3.11 or 3.12                                        | Data and modeling utilities                               |
| Python standard library, NumPy, pandas, scikit-learn, SHAP | Pipeline and model tooling declared in `requirements.txt` |
| Vitest 2                                                   | TypeScript tests                                          |
| Python `unittest`                                          | Pipeline tests                                            |
| GitHub Actions                                             | CI checks on `main` and pull requests                     |
| pnpm 10.4.1                                                | JavaScript package management                             |

Dependency ranges and the authoritative pnpm declaration are in [package.json](./package.json). CI uses Node.js 22 and Python 3.12 in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Data and analytics

### Source and provenance

The ingestion pipeline targets the [UCI Online Retail dataset](https://archive.ics.uci.edu/dataset/352/online+retail). The source contains invoice-level retail activity, including invoice identifiers, dates, products, quantities, prices, customer identifiers, and countries. The pipeline validates required columns and records quality findings rather than silently converting invalid values into customer facts.

Rows without a usable `CustomerID`, or with invalid fields required for customer-level processing, remain part of staging and quality reporting but are excluded from customer-linked analytical snapshots.

### Analytical layers

| Layer                                      | Purpose                                                    |
| ------------------------------------------ | ---------------------------------------------------------- |
| Raw and staging records                    | Preserve source rows and validation context                |
| Customers, products, orders, invoice items | Normalize customer and transaction facts                   |
| Feature snapshots                          | Store customer behavior as of a cutoff                     |
| Behavior labels                            | Store temporally aligned outcomes                          |
| Churn predictions                          | Store risk outputs and model-run provenance                |
| Customer explanations                      | Store explanation summaries and explanation-run provenance |
| Customer value and revenue intelligence    | Store behavioral value and revenue-exposure outputs        |
| Retention recommendations                  | Store prioritized actions tied to analytical runs          |
| Monitoring records                         | Store data-quality, drift, and aligned outcome checks      |

The schema and migrations are in [drizzle/](./drizzle/). The TypeScript restoration utility is [scripts/restore_recovery.ts](./scripts/restore_recovery.ts).

### Data truth boundary

The public `retention.overview` procedure is an explicitly labeled synthetic demo contract retained for compatibility tests. The main dashboard uses authenticated database-backed analytics procedures and does not silently substitute demo metrics.

The recovered database contains customer explanation rows but currently has zero per-feature SHAP attribution rows in `customer_explanation_features`. Feature-level contributions must therefore be described as unavailable unless the explanation artifact is restored and validated.

## Project structure

```text
client/                  React pages, components, hooks, and API client
server/                  Express/tRPC routers, auth, analytics, analyst, and DB access
shared/                  Shared types and the synthetic compatibility contract
drizzle/                 MySQL/TiDB schema migrations
pipelines/               Python ingestion, modeling utilities, SHAP utilities, and tests
scripts/                 Import, generation, verification, monitoring, and schema scripts
data/                    Committed reports; raw, processed, and recovery data are local-only
patches/                 Package patches used by pnpm
docs/                    Phase reports, data model, and provenance documentation
.github/workflows/       GitHub Actions CI workflow
requirements.txt         Python dependencies
package.json             JavaScript scripts and dependency declarations
drizzle.config.ts        Drizzle configuration
vite.config.ts           Vite configuration
```

## Local setup

The commands below are Windows PowerShell examples. Run them from the repository root.

### Requirements

- Node.js 22
- Corepack with pnpm 10.4.1
- Python 3.11 or 3.12
- A MySQL 8-compatible or TiDB database
- A configured OAuth provider for normal authentication, or the explicitly gated local development auth path

### Install dependencies

```powershell
Set-Location "C:\Users\DELL\Downloads\customer-retention-web-v2"
corepack enable
corepack prepare pnpm@10.4.1 --activate
corepack pnpm install --frozen-lockfile

py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### Configure a fresh environment

Copy the safe template and fill it locally:

```powershell
Copy-Item .env.example .env
```

Set `DATABASE_URL` to a database you control, then apply committed migrations only after reviewing the target:

```powershell
corepack pnpm db:migrate
```

Migration does not download the UCI dataset or create analytical results. A fresh environment must use the documented ingestion/import and generation scripts in [package.json](./package.json), or restore approved local exports. Those commands modify data and should not be run against production without a backup and explicit review.

### Existing restored local environment

The recovered local environment already has its database and analytical records. Do not rerun migrations, recovery imports, or generation jobs unnecessarily. Recovery exports under `data/recovery/` are local-only and are not part of the public repository.

### Start the application

```powershell
Set-Location "C:\Users\DELL\Downloads\customer-retention-web-v2"
.\.venv\Scripts\Activate.ps1
corepack pnpm dev
```

Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/) when the server is ready. Verify the process with:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

The health endpoint reports process and configuration status, including whether `DATABASE_URL` is configured. It does not prove that analytical tables contain records.

For a production-style local run after building:

```powershell
corepack pnpm build
$env:NODE_ENV = "production"
corepack pnpm start
```

## Environment variables

Never commit `.env`. Use a secret manager or local environment for credentials.

| Variable                      | Required                          | Purpose                                                                                        |
| ----------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | Yes for real analytics            | MySQL/TiDB connection string                                                                   |
| `OAUTH_SERVER_URL`            | Yes for normal OAuth              | OAuth server base URL                                                                          |
| `VITE_OAUTH_PORTAL_URL`       | Yes for normal OAuth              | Browser login portal URL                                                                       |
| `VITE_APP_ID`                 | Yes for normal OAuth              | Public application identifier                                                                  |
| `JWT_SECRET`                  | Yes                               | Server-side session signing secret                                                             |
| `OWNER_OPEN_ID`               | Yes for the configured auth model | Owner identity used by authorization                                                           |
| `NODE_ENV`                    | Recommended                       | Runtime mode; local auth requires `development`                                                |
| `PORT`                        | Optional                          | HTTP port; local default is 3000                                                               |
| `APP_URL`                     | Optional                          | Application URL used by runtime configuration                                                  |
| `SERVICE_NAME`                | Optional                          | Service name for runtime metadata                                                              |
| `LOG_LEVEL`                   | Optional                          | Logger verbosity                                                                               |
| `DEMO_MODE`                   | Optional                          | Describes the public synthetic compatibility contract; it does not populate the real dashboard |
| `DEV_LOCAL_AUTH_ENABLED`      | Local development only            | Enables the server-side local admin path only when `NODE_ENV=development`                      |
| `VITE_DEV_LOCAL_AUTH_ENABLED` | Local development only            | Enables the matching browser sign-in path                                                      |
| `BUILT_IN_FORGE_API_URL`      | Analyst only                      | Base URL for a compatible server-side LLM provider                                             |
| `BUILT_IN_FORGE_API_KEY`      | Analyst only                      | Server-side provider key                                                                       |
| `ANALYST_MODEL`               | Optional                          | Provider model name; defaults to `gpt-5-mini`                                                  |
| `VITE_FRONTEND_FORGE_API_URL` | Optional                          | Frontend integration configuration                                                             |
| `VITE_FRONTEND_FORGE_API_KEY` | Optional                          | Frontend integration configuration; do not expose secrets here                                 |
| `VITE_ANALYTICS_ENDPOINT`     | Optional                          | Optional analytics endpoint                                                                    |
| `VITE_ANALYTICS_WEBSITE_ID`   | Optional                          | Optional analytics site identifier                                                             |

Safe analyst placeholders:

```env
BUILT_IN_FORGE_API_URL=https://<compatible-provider>/v1
BUILT_IN_FORGE_API_KEY=<server-side-provider-key>
ANALYST_MODEL=gpt-5-mini
```

The current local analyst remains unavailable when these values are empty or placeholders. The application reports a configuration error instead of fabricating an answer.

## Usage guide

1. Start the server and sign in through the configured OAuth provider. For a local demonstration only, use the development-only local auth flags described above.
2. Review **Overview** for current stored risk, customer-value, and revenue-intelligence summaries.
3. Use **Customers** to search and filter scored customers, then open a customer record for its available prediction, value, recommendation, and explanation data.
4. Use **Actions** to review prioritized retention recommendations.
5. Use **Data & model** to inspect cutoffs, run provenance, feature versions, quality information, and monitoring results.
6. Treat missing per-feature SHAP data as unavailable; do not infer individual feature contributions from a summary explanation.
7. Use **AI Analyst** only after configuring a compatible provider. Ask questions about the approved business scope and keep each question within 500 characters.

## Testing and quality assurance

Run the repository checks from the project root:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
corepack pnpm test
corepack pnpm monitoring:test
corepack pnpm data:test
corepack pnpm schema:validate
corepack pnpm build
```

`pnpm data:test` runs Python fixture tests with:

```powershell
python -m unittest discover -s pipelines -p "test_*.py" -v
```

The CI workflow in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) installs Node.js 22, Python 3.12, project dependencies, and the declared Python requirements before running the core checks. The presence of a workflow is not a claim that every hosted run has passed.

## Security and data integrity

- Keep `.env`, provider keys, database credentials, recovery exports, and ignored artifacts outside version control.
- Use a separate development database when importing or regenerating records.
- Review `DATABASE_URL` before running any migration, import, generation, or monitoring command.
- The development local-auth path requires both an explicit flag and `NODE_ENV=development`; it must never be treated as production authentication.
- Authenticated analytics procedures should be used for real dashboard data.
- Stored predictions, explanations, values, and recommendations are not live retraining or guaranteed outcomes.
- Missing SHAP feature rows and unavailable monitoring outcomes must remain explicitly unavailable.
- The grounded analyst receives approved read-only context and is instructed not to run arbitrary SQL or follow data values as instructions.

## Current limitations

- The Grounded AI Analyst requires a real compatible provider URL and server-side API key. Placeholder values intentionally produce a configuration error.
- The recovered database contains customer explanation records but no per-feature SHAP rows in `customer_explanation_features`.
- A fresh checkout has no database, downloaded dataset, recovery exports, ignored model artifacts, or populated analytical records.
- Normal login depends on an external OAuth provider. Development local authentication is for local demonstration only.
- The public `retention.overview` procedure remains a labeled synthetic compatibility contract; it is not the source of the main dashboard's real metrics.
- Deployment and production hosting configuration are outside this repository-side setup.
- Revenue-at-risk, CLV, churn probability, and recommendations are analytical outputs with stated provenance; they do not prove causation, recoverability, profit, or intervention uplift.

## Roadmap

### Implemented foundation

- React/Vite dashboard and Express/tRPC service
- MySQL/TiDB schema and versioned migrations
- UCI Online Retail ingestion and data-quality pipeline
- Temporal customer features and behavior labels
- Stored churn predictions and model-run metadata
- Customer value, revenue-intelligence, and retention recommendation records
- Authenticated analytics procedures
- Versioned monitoring records and CI checks
- Grounded analyst request validation and read-only context restrictions

### Planned improvements

- Restore and validate per-feature explanation artifacts so SHAP attribution can be shown at customer level.
- Configure and test the analyst against an approved provider in a controlled environment.
- Add measured intervention outcomes and calibration/retraining workflows where justified by new evidence.
- Complete production OAuth, secret management, observability, and deployment configuration.
- Expand integration and authorization coverage around the protected analytics APIs.

## Contributing

1. Create a focused branch from `main`.
2. Make a small, evidence-based change without committing secrets, databases, recovery data, or generated artifacts.
3. Run the relevant TypeScript, Python, schema, formatting, and build checks.
4. Review the diff and document any data or configuration assumptions.
5. Open a pull request describing the change, validation performed, and any remaining limitations.

## License

The project declares the MIT license in [package.json](./package.json). No separate `LICENSE` file is currently present in the repository.

## Closing

Pulseboard is designed to make retention work more disciplined: connect customer evidence to model outputs, expose provenance and limitations, and help teams focus action where risk and customer value justify attention.
