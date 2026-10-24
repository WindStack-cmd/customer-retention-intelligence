# Phase 11 — Grounded GenAI Analyst

## Status

**Complete.** The application now exposes an authenticated, read-only grounded analyst backed by the configured built-in LLM provider. It reuses the existing Phase 9 analytics read layer and Phase 10 dashboard design. No Phase 12 work was started.

## What genuinely works

- Protected tRPC procedure: `analyst.ask`.
- Bounded business questions about customer risk, churn reasons, priority customers, revenue at risk, CLV, segments, and existing retention recommendations.
- Read-only context from the real database-backed analytics layer:
  - Executive metrics and completed-run metadata.
  - Up to 20 ranked customer records.
  - Up to 10 recommendations.
  - One requested customer detail record when a numeric customer ID is present.
  - Up to 3 bounded customer detail records for general churn-reason/SHAP questions.
- Structured JSON output with an answer and source labels.
- Response provenance including cutoff, recommendation run, model run, explanation run, value run, and feature version.
- Dashboard analyst panel using the existing `AIChatBox` component, with suggested questions, loading state, safe error state, and read-only labeling.
- One live end-to-end query completed successfully against the real database and configured provider using `gpt-5-mini`.

The verified live response returned `REAL_DATABASE_RECORDS`, scope `customers`, cutoff `2011-11-09T23:59:59Z`, real run IDs, dataset provenance, and actual priority/customer/SHAP/revenue-at-risk values.

## Security and grounding controls

- Procedure is protected by the existing authenticated tRPC boundary.
- Input is normalized, limited to 500 characters, and validated against supported business topics.
- Prompt-injection patterns such as instruction overrides, system-prompt extraction, SQL/write requests, jailbreak language, and tool-call requests are rejected.
- The model receives only a serialized, bounded, approved read-only context. It is explicitly instructed to treat the question and data values as untrusted data and never as instructions.
- No unrestricted SQL, arbitrary database access, write operation, external search, or user-selected tool execution is exposed.
- Provider responses must match a strict JSON schema; empty, malformed, or provider-failure responses become a safe `SERVICE_UNAVAILABLE` error rather than a fabricated answer.
- Missing model provenance produces a `PRECONDITION_FAILED` response.
- The system prompt explicitly forbids causation claims, experimental uplift claims, guaranteed savings, and unsupported metrics.

## Provider/configuration

The project’s configured `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` were available. The live model catalog was checked before implementation, and `gpt-5-mini` was selected as the bounded low-cost workhorse. The provider credential remains platform-injected; no credential was added to source code or committed files. `ANALYST_MODEL` can override the default model only through server configuration.

If the provider credential is absent in another environment, the procedure fails closed with: `The grounded analyst provider is not configured. No AI answer was generated.`

## Tests and verification

Passed:

- Focused analyst security/grounding suite: **6/6**.
- Full Vitest regression suite: **40/40 passed**.
- TypeScript typecheck.
- ESLint.
- Prettier formatting.
- Drizzle validation.
- Production build.
- Application health check.
- One live provider/database analyst query.

The production build emits the existing Vite warning about large client chunks caused by the retained `streamdown`/syntax-highlighting bundle; the build itself completes successfully.

Focused tests cover unauthenticated access, unsupported requests, prompt injection, bounded context, real-record/provenance output, missing provenance, and provider failure behavior.

## Limitations

- The analyst is intentionally read-only and bounded; it does not execute arbitrary SQL or perform actions.
- Answers depend on the latest completed Phase 8 recommendation run and its underlying Phase 4–7 artifacts.
- The provider response is grounded by prompt and strict output validation; it is not a causal model and does not prove intervention effectiveness.
- No conversation history is persisted between page reloads.
- No streaming response was added because the existing server helper exposes non-streaming completion calls.
