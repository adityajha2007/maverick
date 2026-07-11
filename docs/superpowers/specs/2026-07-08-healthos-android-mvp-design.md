# healthOS Android MVP — Design Spec

**Date:** 2026-07-08
**Timeline:** 3–7 days (extended hackathon, Gemma-sponsored)
**Hero moment:** the 30-second doctor pre-consult brief, delivered as a shareable web link generated from a patient's Android app.

---

## 1. Product summary

healthOS is an Android app that turns fragmented medical records into a lifelong, patient-owned health memory. Data lives on the device. A patient can:

1. See their history as a chronological "memory" timeline.
2. Chat with their memory to ask questions in natural language.
3. Upload a real lab-report PDF and watch it extract into structured facts.
4. Generate a one-page brief and share it with a doctor via QR/short URL — the doctor opens it in a browser.

The brief is the hero. It renders active conditions, current medication regimen, recent labs with trend arrows, follow-up tests due, and three AI-generated questions for the doctor to ask.

## 2. Scope decisions

| Area | Decision |
| --- | --- |
| Platform | Android app via Expo / React Native |
| Doctor surface | Shareable web-link brief (view-only HTML), no separate frontend |
| LLM | Gemma only (hard requirement). Hybrid: on-device Gemma 3n for chat; cloud Gemma 3 (12B multimodal) for extraction |
| Fallback | Single `GemmaClient` interface with runtime flag; cloud-Gemma fallback for chat if on-device bridge fails |
| Storage | Local-first. `op-sqlite` on device is the source of truth. Backend is stateless compute |
| Backend | FastAPI, three routes: `/extract`, `/chat`, `/brief` (+ `GET /brief/{token}`). No patient DB |
| Data sources — live pipeline | Lab-report PDFs only |
| Data sources — seeded | Prescriptions, doctor notes, wearable trends — pre-populated into SQLite at build time |
| Auth | None (v1). Phone is the identity; share links use unguessable 32-char tokens with 24h TTL |
| Onboarding | None. App boots straight into the seeded synthetic patient |
| Chat recall | Cram all facts into prompt (no FTS5 or embeddings). Synthetic patient fits comfortably in <8KB |
| Extras | Feature A: medication routine understanding (schema fields + Today's Routine card). Feature B: suggested follow-up tests (Gemma-derived at brief render time) |

## 3. System architecture

```text
┌────────────────────────────────────────────────────────────────┐
│  ANDROID APP  (Expo / React Native)                            │
│                                                                │
│  Screens:                                                      │
│    • Timeline (home)   • Chat   • Upload   • Share             │
│                                                                │
│  Services:                                                     │
│    • GemmaClient (interface)                                   │
│        ├── OnDeviceGemma   (react-native-llm-mediapipe)        │
│        └── CloudGemma      (fetch → backend)                   │
│    • LocalStore   (op-sqlite; seed.sql at first boot)          │
│    • Ingestion   (only ingestLabPdf.ts is live)                │
│    • Chat        (buildContext.ts — dumps all facts)           │
│    • Share       (BriefBuilder.ts + POST /brief)               │
└──────────────┬─────────────────────────────────────────────────┘
               │ HTTPS  (extraction, chat fallback, brief share)
               ▼
┌────────────────────────────────────────────────────────────────┐
│  BACKEND (FastAPI on Fly.io — STATELESS)                       │
│                                                                │
│  POST /extract         PDF/image → cloud Gemma → structured    │
│                        facts. Tempfile deleted after.          │
│  POST /chat            Prompt → cloud Gemma → response.        │
│                        Fallback path when on-device fails.     │
│  POST /brief           Facts JSON → renders HTML → stores in   │
│                        Redis with 32-char token, 24h TTL.      │
│  GET  /brief/{token}   Serves rendered HTML (doctor view).     │
│  GET  /brief/demo      Static demo brief (live-demo backup).   │
└──────────────┬─────────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────┐
│  EXTERNAL                                                      │
│  • Google AI Studio  — Gemma 3 (12B) multimodal for extract    │
│                        and chat fallback                       │
│  • Upstash Redis     — brief-URL storage w/ TTL                │
│  • Hugging Face      — Gemma 3n E2B .task file for on-device   │
└────────────────────────────────────────────────────────────────┘
```

## 4. Components

### 4.1 Frontend (Expo/RN)

**Screens** (`app/` — Expo Router)

- `app/index.tsx` — redirects to `/timeline` (no onboarding)
- `app/(tabs)/timeline.tsx` — chronological view of all facts. Sections: *Today's Routine*, *Reminders (follow-up tests due)*, *Recent labs (with sparklines)*, *Encounters*
- `app/(tabs)/chat.tsx` — on-device Gemma; 3 example-prompt chips + free-text input; streaming bubble UI with citation chips
- `app/(tabs)/upload.tsx` — file picker → lab PDF only in v1
- `app/share.tsx` — one-tap → `BriefBuilder` → `POST /brief` → QR + copyable URL + "expires in 24h"

**Services** (`src/services/`)

- `gemma/GemmaClient.ts` — interface `{ generate({prompt, images?}): Promise<{text, tokens}> }`
- `gemma/OnDeviceGemma.ts` — wraps `react-native-llm-mediapipe`; text-only; loads Gemma 3n .task file from device storage
- `gemma/CloudGemma.ts` — POSTs to `/chat` or `/extract`; supports multimodal
- `gemma/index.ts` — capability check + runtime flag (`CLOUD_ONLY_MODE` build-time override wins)
- `store/db.ts` — `op-sqlite` connection; migrations table; loads `assets/seed/synthetic_patient.sql` on first launch
- `store/repos/index.ts` — thin query module: `getAllFacts()`, `getMedications()`, `getRecentLabs(days)`, `getEncounters()`, `getRoutine()`
- `ingestion/ingestLabPdf.ts` — the only live ingestion path. Reads file bytes, POSTs to `/extract`, parses response, writes rows.
- `chat/buildContext.ts` — assembles compact JSON of all facts (<8KB constraint) plus system prompt
- `share/BriefBuilder.ts` — assembles the facts payload plus two Gemma-derived cards (watch-list, follow-up tests) and POSTs to `/brief`

**UI kit** — Tamagui or NativeWind (choose during scaffolding, do not defer). `react-native-svg` for timeline + sparklines. No chart library.

### 4.2 Backend (FastAPI)

- `app/main.py` — FastAPI app, CORS (allow app origin only), health check
- `app/routes/extract.py` — multipart file + `source_type`; currently only `lab_pdf` supported. Calls `gemma/prompts/lab_pdf.py`. Deletes tempfile in finally block.
- `app/routes/chat.py` — prompt + optional facts payload → cloud Gemma → text response. Rate-limited by IP (10/min).
- `app/routes/brief.py` — `POST /brief` renders `render/brief.html.jinja` with facts, stores in Redis under 32-char urlsafe token, TTL 86400. `GET /brief/{token}` serves HTML. `GET /brief/demo` serves a static demo brief.
- `app/gemma/client.py` — wraps Google AI Studio SDK (`google-generativeai`), enforces JSON mode where requested, retries once on 5xx.
- `app/gemma/prompts/` — one file per prompt:
  - `lab_pdf.py` — extraction prompt + expected schema
  - `chat.py` — chat system prompt (fallback path)
  - `watch_list.py` — "3 things to ask" derivation
  - `follow_ups.py` — Feature B, tests due within 4 weeks
- `app/render/brief.html.jinja` — one-screen, print-friendly doctor brief

### 4.3 Storage — local SQLite schema

```sql
CREATE TABLE patient (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  dob          TEXT NOT NULL,   -- ISO date
  sex          TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE encounter (
  id           INTEGER PRIMARY KEY,
  patient_id   INTEGER NOT NULL REFERENCES patient(id),
  date         TEXT NOT NULL,
  provider     TEXT,
  kind         TEXT NOT NULL,   -- 'visit' | 'lab' | 'discharge' | 'imaging'
  summary      TEXT
);

CREATE TABLE medication (
  id                        INTEGER PRIMARY KEY,
  patient_id                INTEGER NOT NULL REFERENCES patient(id),
  name                      TEXT NOT NULL,
  dose                      TEXT NOT NULL,
  start_date                TEXT NOT NULL,
  end_date                  TEXT,
  prescribed_at_encounter_id INTEGER REFERENCES encounter(id),
  frequency                 TEXT,             -- Feature A
  timing                    TEXT,             -- Feature A
  with_food                 INTEGER,          -- Feature A (0/1)
  duration_days             INTEGER,          -- Feature A
  patient_notes             TEXT,             -- Feature A
  source_type               TEXT NOT NULL,
  source_ref                TEXT NOT NULL
);

CREATE TABLE lab_result (
  id           INTEGER PRIMARY KEY,
  patient_id   INTEGER NOT NULL REFERENCES patient(id),
  test_name    TEXT NOT NULL,
  value        REAL NOT NULL,
  unit         TEXT NOT NULL,
  ref_low      REAL,
  ref_high     REAL,
  taken_at     TEXT NOT NULL,
  source_type  TEXT NOT NULL,
  source_ref   TEXT NOT NULL
);

CREATE TABLE condition (
  id             INTEGER PRIMARY KEY,
  patient_id     INTEGER NOT NULL REFERENCES patient(id),
  name           TEXT NOT NULL,
  diagnosed_at   TEXT NOT NULL,
  status         TEXT NOT NULL   -- 'active' | 'resolved'
);

CREATE TABLE wearable_daily (
  patient_id   INTEGER NOT NULL REFERENCES patient(id),
  date         TEXT NOT NULL,
  resting_hr   INTEGER,
  sleep_hours  REAL,
  steps        INTEGER,
  hrv_ms       INTEGER,
  PRIMARY KEY (patient_id, date)
);

CREATE TABLE note_chunk (
  id           INTEGER PRIMARY KEY,
  patient_id   INTEGER NOT NULL REFERENCES patient(id),
  source_type  TEXT NOT NULL,
  source_ref   TEXT NOT NULL,
  text         TEXT NOT NULL,
  taken_at     TEXT NOT NULL
);
```

Every extracted/seeded row carries `source_type` (e.g., `lab_pdf`, `seed`) and `source_ref` (SHA-256 of the origin file, or `"seed"`). This powers citations in chat and the brief.

### 4.4 External integrations

- **Google AI Studio** — Gemma 3 12B multimodal via `google-generativeai` SDK. Free tier is sufficient for hackathon volume.
- **Upstash Redis** — brief-URL keystore, 24h TTL. Free tier.
- **Hugging Face** — Gemma 3n E2B `.task` file, downloaded at first launch to `FileSystem.documentDirectory`.

## 5. Data flow

### 5.1 App boot

1. `db.ts` checks `migrations` table. If empty, runs `schema.sql` then loads `assets/seed/synthetic_patient.sql`.
2. `GemmaClient.init()` checks for Gemma 3n `.task` file. If missing, downloads from Hugging Face (~1.5 GB, progress UI). On init or download failure, sets `useCloudGemma = true`.
3. Navigate to timeline.

### 5.2 Live lab-PDF upload

1. User picks `lab.pdf` on the Upload tab.
2. App POSTs multipart `{file, source_type: "lab_pdf"}` to `/extract`.
3. Backend saves tempfile, calls `gemma/prompts/lab_pdf.py`, gets back structured JSON.
4. Backend deletes tempfile, returns `{labs: [...]}`.
5. App inserts one `encounter` (kind='lab') and one `lab_result` row per value, with `source_ref = sha256(pdf bytes)`.
6. Timeline auto-updates; new rows briefly highlighted.

### 5.3 Chat turn

1. User types question or taps an example chip.
2. `buildContext.ts` calls `repos.getAllFacts()` and serialises to compact JSON (~4–8 KB).
3. Full prompt = system + facts + user question.
4. `GemmaClient.generate(prompt)` — on-device by default, cloud on fallback.
5. UI streams tokens into a bubble; citations rendered as source chips.

### 5.4 Share brief

1. User taps Share on the timeline.
2. `BriefBuilder.buildFacts()` collects:
   - Active meds with dose + routine.
   - Recent labs (last 90 days) with trend arrows.
   - Active conditions.
   - Last 5 encounter summaries.
   - Watch list — extra Gemma call: "list 3 things a doctor should ask this patient."
   - Follow-up tests due — extra Gemma call (Feature B): "list tests due within 4 weeks."
3. POST `/brief` with the assembled facts JSON.
4. Backend: `token = urlsafe_random(32)`; `html = jinja.render(brief.html.jinja, facts)`; `redis.setex("brief:{token}", 86400, html)`; return `{url, expires_at}`.
5. App shows QR + copyable URL + expiry notice.
6. Doctor scans → `GET /brief/{token}` → single-screen HTML brief.

### 5.5 Invariants across all flows

- Every SQLite write includes `source_type` and `source_ref`.
- Every Gemma call goes through `GemmaClient.generate` — never a direct SDK/bridge call.
- Backend never persists anything beyond the 24h brief TTL and the tempfile-during-extraction window.

## 6. Error handling & fallbacks

| Failure | Behaviour |
| --- | --- |
| Gemma bridge init fails | Catch in `GemmaClient.init()`, set `useCloudGemma = true`, all chat calls route to `/chat`. Never blocks the app. |
| Model download fails | Retry 3× with backoff; on final failure switch to cloud. User sees a subtle "using cloud mode" chip in the chat header. |
| Extract fails on lab PDF | Retry once with a simplified prompt. On second failure, toast "couldn't read this PDF" — seeded data unaffected. |
| Brief POST fails | Retry button in UI; facts JSON cached locally. Final fallback: `/brief/demo` static URL always works. |
| On-device OOM | Same as init fail — flip to cloud transparently. |

**Non-negotiable invariant:** every screen renders *something* even if all Gemma calls fail. The timeline, meds, and labs are readable from local SQLite alone.

## 7. Testing & demo drill

**Backend tests** (`pytest`):

- `test_extract.py` — `/extract` given a fixture PDF returns the expected schema.
- `test_brief.py` — `/brief` accepts a valid payload, returns a token; `/brief/{token}` returns HTML.
- `test_chat.py` — `/chat` proxies to Gemma and returns text.

**Frontend tests** (`jest-expo`):

- `GemmaClient.test.ts` — selection logic given various capability + flag combinations.
- `BriefBuilder.test.ts` — shape of assembled facts JSON.
- `buildContext.test.ts` — payload size stays <8 KB with the seeded patient.

Skip: React component tests, Gemma-prompt unit tests (iterate in Playground instead).

**Demo drill:**

- Real Pixel-class Android device primary; emulator backup.
- Day-before: dry-run the full flow 3× on the demo device.
- Screenshot every screen; slides ready as a total-failure fallback.
- `CLOUD_ONLY_MODE` build flag: flip if the on-device bridge is unstable on demo morning.

## 8. The one design deliverable outside code

`assets/seed/synthetic_patient.sql` — a believable diabetic + hypertensive patient with ~3 years of history:

- Conditions: T2DM, hypertension, hyperlipidemia.
- Meds with full routine fields populated.
- ~15 lab results across HbA1c, fasting glucose, LDL, HDL, creatinine — with a visible trend to hook the "trending" narrative.
- ~10 encounter summaries.
- ~5 doctor notes.
- Deliberately-overdue tests so Feature B has something to flag.

The pitch quality is proportional to this file's plausibility. Treat it as a design artefact, not seed data.

## 9. Out of scope (v1)

- Real auth, multi-patient support, cloud sync of local DB.
- Wearable ingestion pipeline (seeded only).
- Prescription-image OCR (paste text only, or seeded).
- Note ingestion pipeline (seeded only).
- FTS5 or vector recall on chat (dump-all-facts strategy).
- iOS build.
- Real clinical validation (this is a hackathon prototype, not a medical device).
