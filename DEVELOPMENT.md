# Development guide

## Supported local toolchain

- Windows PowerShell.
- Node.js 22.
- pnpm 10.4.1 (Corepack).
- Python 3.11 or 3.12 for the pinned scientific dependencies in `requirements.txt`.
- MySQL or TiDB for real analytics.

The repository does not contain a database, credentials, downloaded raw dataset, or saved model artifacts. Local Manus table exports, when supplied, belong under the ignored `data/recovery/` directory.

## Configuration

Copy `.env.example` to `.env` and fill it locally. The template contains names and placeholders only. Required application configuration is `DATABASE_URL`, OAuth settings, `VITE_APP_ID`, `JWT_SECRET`, and `OWNER_OPEN_ID`. The GenAI analyst additionally needs `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY`. Optional analytics and frontend Forge variables may remain empty.

For a local database-backed demonstration without an external OAuth provider, set both
`DEV_LOCAL_AUTH_ENABLED=true` and `VITE_DEV_LOCAL_AUTH_ENABLED=true`. This path is only
accepted in development mode, creates a clearly labeled local development user, and is
not available in production.

## Windows commands

Use `pnpm dev`, not a Unix-style `NODE_ENV=development ...` command. The server defaults to development mode when `NODE_ENV` is absent. Use `$env:NODE_ENV = "production"` before `pnpm start`.

The combined development server runs Express, tRPC, and Vite in one process. The preferred port is 3000; the server selects a nearby free port if necessary.

## Pipeline safety

`pnpm db:migrate`, `pnpm db:push`, `pnpm recovery:import`, `pnpm data:ingest`, `pnpm db:import`, feature/label generation, model training, recommendation generation, and `pnpm monitoring:run` modify local resources. Review `DATABASE_URL` and the target directories before running them. `pnpm recovery:validate`, `pnpm data:test`, TypeScript tests, lint, formatting checks, schema validation, and typechecking are safe read-only checks.

For recovered tables, run `pnpm db:migrate`, then `pnpm recovery:validate`, then `pnpm recovery:import`. The restore is per-table, preserves explicit exported IDs and timestamps, skips only identical repeated primary-key rows, and never deletes or overwrites existing rows. The recovery export contains 26,600 top-level explanations but no customer-level SHAP feature CSV, so the explanation feature list remains unavailable until that artifact is restored.

## Monitoring

Phase 12 is intentionally minimal. `scripts/monitoring.ts` contains deterministic calculations. `scripts/run_monitoring.ts` reads the latest feature cutoffs and aligned prediction/label rows, then persists versioned runs and metrics in `monitoring_runs` and `monitoring_metrics`. Missing labels or misaligned outcomes produce an `unavailable` performance metric. No metric is invented.

Database-backed API tests run only when both `DATABASE_URL` and `RUN_DATABASE_TESTS=true` are set. Phase 6 recovery tests are skipped when the ignored recovery artifact is absent; regenerate it only from an approved populated database and model artifact.
