# Pulseboard — Customer Retention & Revenue Intelligence

Pulseboard is a React/Vite dashboard backed by an Express/tRPC API, a MySQL/TiDB retention schema, and a reproducible UCI Online Retail analytics pipeline. The repository contains the implementation for ingestion, temporal features and labels, churn prediction, SHAP explanations, behavioral customer value, retention recommendations, protected analytics APIs, frontend integration, and a grounded read-only analyst.

## Current truth boundary

The source code and migrations are present, but this repository copy intentionally does not include secrets, `node_modules`, a database, the downloaded dataset, processed data, or ignored model/SHAP artifacts. Therefore a fresh checkout is not immediately populated with real customer records. The public `retention.overview` tRPC procedure remains a clearly labeled synthetic demo contract; the main dashboard uses authenticated real-record APIs and does not silently fall back to demo metrics.

The recovered Manus table exports are expected under the local-only `data/recovery/`
directory. They are not committed or included in the application package. The restore
utility preserves exported IDs and timestamps, skips only verified repeated rows, and
can be rerun safely after a failed table. It requires a reviewed development database.

Phase 12 now has a minimal versioned monitoring implementation in [scripts/monitoring.ts](./scripts/monitoring.ts) and [scripts/run_monitoring.ts](./scripts/run_monitoring.ts). It records feature missingness, numeric drift between the latest two feature cutoffs, and outcome performance only when predictions and binary labels are aligned. Unavailable performance is recorded as unavailable, never as a healthy score.

## Architecture

- `client/`: React 19 + Vite + Tailwind frontend.
- `server/`: Express server, tRPC routers, OAuth integration, database-backed analytics, and GenAI analyst.
- `drizzle/`: MySQL/TiDB schema and migrations.
- `pipelines/`: Python ingestion, model utilities, SHAP recovery, and tests.
- `scripts/`: TypeScript database import, feature, label, model, value, recommendation, verification, and monitoring jobs.
- `data/`: committed quality reports; downloaded/raw/processed data is ignored.

## Fast Windows PowerShell setup

From the repository root:

```powershell
Set-Location "C:\Users\DELL\Downloads\customer-retention-web-v2"
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` locally with real values. Never commit it. `DATABASE_URL`, OAuth configuration, and `JWT_SECRET` are required for the protected application. The Forge URL/key and `ANALYST_MODEL` are additionally required for GenAI. `DEMO_MODE=true` only describes the synthetic public contract; it does not create real database records.

For a local database-backed demonstration when the external OAuth provider is unavailable,
set `DEV_LOCAL_AUTH_ENABLED=true` and `VITE_DEV_LOCAL_AUTH_ENABLED=true` in `.env`.
This creates a development-only local admin session at the sign-in button. The server
requires `NODE_ENV=development` for this path and returns 404 otherwise; never enable it
in a production environment.

## Database and data pipeline

The database must be provisioned separately as MySQL or TiDB. No local database server is included.

```powershell
$env:DATABASE_URL = "<your MySQL/TiDB connection string>"
pnpm db:migrate              # MODIFIES DATABASE: apply committed migrations only after review
pnpm db:push                 # MODIFIES DATABASE: generate and apply schema changes; use only for intentional development changes
pnpm recovery:validate       # SAFE: validate recovered CSV headers, counts, and duplicate consistency
pnpm recovery:import         # MODIFIES DATABASE: restore recovered tables in foreign-key order
pnpm data:test               # SAFE: fixture tests, no network
pnpm data:ingest              # DOWNLOADS UCI data and writes data/raw, staging, processed
pnpm db:import                # MODIFIES DATABASE: imports processed data
pnpm feature:generate         # MODIFIES DATABASE: writes feature snapshots
pnpm label:generate           # MODIFIES DATABASE: writes aligned behavioral labels
pnpm model:train              # TRAINS MODEL, writes ignored artifacts and database rows
pnpm value:generate           # MODIFIES DATABASE: writes behavioral value results
pnpm recommendation:generate  # MODIFIES DATABASE: writes recommendations
pnpm monitoring:run           # MODIFIES DATABASE: records versioned monitoring results
```

Run the pipeline in that order. Do not run database or data commands against production without a backup and explicit review.

For recovered data, run `pnpm db:migrate` first so the Phase 6 and historical monitoring
compatibility tables exist, then run `pnpm recovery:validate` and
`pnpm recovery:import`. The restore command does not delete or overwrite existing
rows; it imports explicit IDs in bounded per-table batches and reports repeated
export rows. The recovered export contains top-level SHAP explanations, but no
`customer_explanation_features` CSV; customer-level SHAP feature lists therefore
remain unavailable until the original feature artifact is restored.

## Start the application

The development server hosts Express/tRPC and Vite together:

```powershell
Set-Location "C:\Users\DELL\Downloads\customer-retention-web-v2"
.\.venv\Scripts\Activate.ps1
pnpm dev
```

Open the URL printed by the server, normally `http://localhost:3000`. In a second terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

The health response reports process/configuration status and whether `DATABASE_URL` is configured. It is not a proof that the database contains imported analytics data.

For a production bundle after a successful build:

```powershell
pnpm build
$env:NODE_ENV = "production"
pnpm start
```

## Safe checks

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm monitoring:test
pnpm data:test
pnpm schema:validate
pnpm build                  # writes dist/
```

CI runs the same checks using [`.github/workflows/ci.yml`](./.github/workflows/ci.yml). No hosted CI result is implied by the presence of that workflow.

## External services and absent resources

- MySQL/TiDB and `DATABASE_URL` are required for real analytics.
- OAuth provider configuration is required for normal login. The explicitly gated
  development-only local authentication path above is available for local demonstrations.
- Forge-compatible LLM configuration is required for the analyst.
- The UCI archive must be downloaded by `pnpm data:ingest`.
- Model and SHAP artifacts must be regenerated by the documented pipeline; they are ignored and are not fabricated or committed.
- Deployment is intentionally outside this repository-side pass.
