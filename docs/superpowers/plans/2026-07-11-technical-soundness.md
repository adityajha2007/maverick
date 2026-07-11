# Technical Soundness Pass — Plan Only

## Context

The build ships end-to-end and passes tests, but a code review would flag a real list of weaknesses that are cheap to fix and materially reduce demo-day risk: silent error swallowing, no retry discipline, no reconnect logic on WebSockets, a big TS baseline of pre-existing errors, no linting, prompts that can drift without any version tracking, and untested Live-API state machines. This plan enumerates the fixes in order of demo-day impact per hour of work — you decide which tier to build. Nothing here changes what the app *does*; it changes how *reliably* it does it.

**Split into three tiers by ROI. Tier 1 is what a code reviewer would call "must-have before shipping." Tier 2 is polish. Tier 3 is nice-to-have.**

---

## Tier 1 — Reliability during demo (~2 hours)

### 1. Orchestrator retry with exponential backoff + per-agent timeout budget

**Where:** `app/src/services/agents/Orchestrator.ts`.

Currently `Orchestrator.execute` calls each agent once and catches errors into `defer` confidence. Real problems:

- No retry on transient failure (network flake, malformed JSON on first pass).
- No timeout — a hung `client.generate` call blocks the entire chain indefinitely.
- No structured error events — the UI can't distinguish "agent failed once, retrying" from "agent failed permanently".

Change: wrap each agent's `.run()` in a retry loop with 1 retry, 500 ms backoff, and a hard 30-second timeout budget. Emit progress events on retry so `upload.tsx` can render them. If retry exhausts, insert a `deferral` row (already the pattern) and mark the pipeline `defer`.

**Effort:** ~40 min.

**Why demo-critical:** Gemma responses occasionally parse as invalid JSON on first pass; a retry catches ~80% of those. Without it, a single glitchy call kills the demo's most-visible feature.

### 2. Live API auto-reconnect + heartbeat

**Where:** `companion/src/useLive.ts` and `translator/src/useTranslator.ts`.

Current: if the WebSocket to Gemini Live drops (Wi-Fi hiccup, backend rate limit), the app silently stops responding. The mic button still says "recording" but nothing happens.

Change:
- Add `onclose` handler that detects unexpected close (code !== 1000) and attempts up to 3 reconnects with 1s / 2s / 4s backoff.
- Set an UI status: `● live`, `⟳ reconnecting…`, `⚠ disconnected`.
- On successful reconnect, resume the audio pump.

**Effort:** ~30 min per app (60 min total).

**Why demo-critical:** venue Wi-Fi drops. Without reconnect, your Live-API demo goes silent and you look broken.

### 3. Model-registry fallback with user-visible status

**Where:** `app/src/services/gemma/OnDeviceGemma.ts` + a tiny status badge in `app/app/(tabs)/_layout.tsx` or memory screen header.

Current: if Gemma 4 fails to load, we silently fall back to Gemma 3n. Neither the user nor a judge can tell which model is actually running.

Change:
- Track the currently-active model key in a module-level ref.
- Expose `getActiveModel(): "gemma4" | "gemma3n" | "cloud"` from `GemmaClient`.
- Add a small badge in the Memory tab header: **On-device: Gemma 4 · 2.6 GB** (or **Gemma 3n · fallback**, or **Cloud · fallback**).

**Effort:** ~30 min.

**Why demo-critical:** judges will ask "which model is running?" — right now the honest answer is "we don't know without reading logs." A visible badge is professional and defensible.

### 4. Prompt versioning + agent_action version tags

**Where:** every prompt file (`app/src/services/chat/buildContext.ts`, `app/src/services/agents/*.ts`, `backend/app/gemma/prompts/*.py`, `companion/src/prompts.ts`, `translator/src/prompts.ts`).

Currently prompts are edited inline; a prompt regression would be silent. Change:
- Add a `PROMPT_VERSION` constant at the top of each prompt file (start at `1.0.0`).
- The Orchestrator's `agent_action` insert records the prompt version alongside the output.
- Any time you edit a prompt, bump the version.

**Effort:** ~20 min total (mostly copy-pasting the constant into ~10 files).

**Why demo-critical:** the reposition edits we just did changed every prompt in the codebase. If tomorrow the extractor breaks, the `agent_action` table tells you *which prompt version* produced the last successful and last failing call. Debugging without this is guesswork.

### 5. Backend request-scoped timeouts

**Where:** `backend/app/gemma/client.py` + `backend/app/routes/extract.py`.

`client.generate_content` has no explicit timeout. Under load or during a Gemini outage, `/extract` can hang for minutes. Wrap all Gemma calls with `asyncio.wait_for(..., timeout=60)`. If it times out, return a proper 504 with structured error.

**Effort:** ~20 min.

---

## Tier 2 — Engineering polish (~2 hours)

### 6. Baseline TS error cleanup

**Where:** the ~64 pre-existing errors under `npx tsc --noEmit`.

Two categories:
- **Jest globals in `__tests__/*.test.ts`** — add `"types": ["jest", "node"]` to a scoped `tsconfig.jest.json` referenced from `package.json`'s jest config. Resolves ~30 errors.
- **`global.css` import in `_layout.tsx`** — add a `global.d.ts` declaring `declare module "*.css"`. Resolves the remaining errors.

**Effort:** ~20 min.

**Why worth it:** a clean type-check is what a code reviewer opens first. Right now they'd see 64 errors and stop reading.

### 7. Unit tests for the retry logic + Live translator aggregator

**Where:** `app/__tests__/OrchestratorRetry.test.ts` (new) + `translator/__tests__/useTranslator.test.ts` (new — requires jest setup in translator).

Two small suites:
- Orchestrator retry: mock Gemma to fail twice then succeed. Verify retry fires, backoff timing is correct, `agent_action` records both attempts.
- Translator turn-splitter: given a stream of `turnComplete` events + text, verify `sourceTurns`/`targetTurns` arrays are correctly partitioned.

**Effort:** ~45 min.

### 8. Ruff for Python + oxlint enforcement for JS

**Where:** `backend/pyproject.toml` + `app/package.json` + `translator/package.json` + `companion/package.json`.

Add:
- `ruff>=0.4` to backend dev-deps + `ruff check` script.
- Verify `oxlint` (already in Vite scaffolds) has actual rules configured, not just the default empty set.

**Effort:** ~30 min including fixing whatever the first pass surfaces.

### 9. Structured error events in the UI layer

**Where:** `app/src/services/agents/types.ts` (add `AgentError` type) + `Orchestrator.ts` (emit them) + `upload.tsx` (render them).

Right now agent errors flow as generic `Error` objects. Introduce a small type:

```ts
export interface AgentError {
  agent: string;
  phase: "call" | "parse" | "validate";
  reason: string;
  attempt: number;
  retriable: boolean;
}
```

`Orchestrator` returns these as part of the result. UI shows the retry/failure narrative properly.

**Effort:** ~30 min.

### 10. Environment-variable validation at boot

**Where:** `backend/app/config.py` + all three frontends.

Currently a missing `GOOGLE_API_KEY` or `UPSTASH_REDIS_URL` fails at first use with a cryptic error. Add:
- Backend: `Settings` already uses pydantic — mark the required fields as `Field(...)` and let pydantic-settings raise at import time.
- Frontends: at the top of `main.tsx`, check that `import.meta.env.VITE_GOOGLE_API_KEY` exists and is not the placeholder — throw a clear error banner if not.

**Effort:** ~20 min.

---

## Tier 3 — Nice to have (~2-3 hours; skip unless flush with time)

### 11. Parallelize independent agent steps in the Orchestrator

`TrendAgent` and `InteractionAgent` don't depend on each other's output. Run them concurrently via `Promise.all`. Cuts pipeline latency ~40%. But: the handoff chain semantics change; needs care.

**Effort:** ~1 h. **Skip unless demo latency is a live problem.**

### 12. Docker + docker-compose for backend

Reproducible backend deploy. `Dockerfile` + `docker-compose.yml` with Redis, so a teammate can `docker compose up` and have `/health` return ok.

**Effort:** ~1 h. **Skip for hackathon — you have Fly.io / ngrok already documented.**

### 13. Prompt evaluation harness

A tiny script that runs each prompt against a fixture set and reports pass/fail. Would catch prompt regressions. Real production discipline, overkill for hackathon.

**Effort:** ~2 h. **Skip.**

### 14. Structured logging (JSON) on backend

Replace `print` statements with `structlog`. Ship logs to stdout in JSON for easy grep. Nice for a real production but hackathon logs live in one terminal.

**Effort:** ~45 min. **Skip.**

---

## Recommended if you have 2 hours: Tier 1 only

That's items **1, 2, 3, 4, 5** above. Retry + reconnect + fallback badge + prompt versions + backend timeout. Every one of these prevents a specific demo-day failure mode I've seen kill hackathon pitches.

## Recommended if you have 4 hours: Tier 1 + Tier 2

Add TS baseline cleanup, the two test suites, linting, structured error events, env-var validation. Now the code will pass a proper code review.

## Skip Tier 3 unless everything else is done.

---

## What this plan deliberately doesn't do

- **Doesn't add tests for every screen.** Hackathon has 5 days; comprehensive test coverage is 5 weeks.
- **Doesn't rewrite the multi-agent architecture.** It works. Retry + timeout make it robust.
- **Doesn't add observability infrastructure.** Sentry / OpenTelemetry / etc. — real production, not hackathon.
- **Doesn't touch the fine-tuning notebook.** Independent workstream.
- **Doesn't change positioning or prompts.** The retrieval-only positioning stays; this is orthogonal.

## Verification (after each item)

```bash
cd /Users/adityajha/GithubProjects/healthOS

# After Tier 1:
cd backend && source .venv/bin/activate && pytest -q && cd ..
cd app && npm test --silent && cd ..
cd translator && npm run build && cd ..

# Force each of the failure modes and confirm graceful behavior:
# - Orchestrator retry: mock Gemma to return invalid JSON, confirm retry fires.
# - Live reconnect: kill Wi-Fi mid-session, confirm status shows reconnecting.
# - Model fallback badge: rename gemma-4 file, confirm 3n loads with badge.
# - Prompt version: check that agent_action rows carry a version tag.
# - Backend timeout: patch Gemma to hang, confirm /extract returns 504 within 60s.
```

## Non-negotiable constraints

- No git commits without explicit ask (persists across sessions).
- All existing tests must stay green after each item lands.
- No new external dependencies for Tier 1. Tier 2 adds `ruff` only.
- Retrieval-only positioning is untouched — this plan is purely about robustness, not behavior.
