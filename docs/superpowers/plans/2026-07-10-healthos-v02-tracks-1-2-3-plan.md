# healthOS v0.2 — Tracks 1 + 2 + 3 Plan

> **v0.2 addendum** to the v0.1 design and plan. Read `docs/superpowers/specs/2026-07-08-healthos-android-mvp-design.md` and `docs/superpowers/plans/2026-07-08-healthos-android-mvp-plan.md` first for the shipped baseline.

## Context

The Google DeepMind Bangalore Hackathon has five tracks + a Grand Prize. Our shipped v0.1 (18/18 tasks, 12/12 backend tests, 11/11 app tests) is 60% aligned with **Track 1 (Local-First Agents on Gemma)** but currently reads as a "chatbot on local memory" — precisely what the track's bar disqualifies. v0.2 realigns:

- **Hero:** Track 1 hero submission. On-device Gemma 4 does the extraction *and* the reasoning. No cloud round-trip on the primary path. Multi-agent sense-decide-act-check loop with human-deferral surfaces.
- **Hybrid:** Track 2 (Gemini Live API) integration via a "Record visit" flow — patient records a doctor consultation, Live API transcribes + translates in real time, output is written into the patient's memory as a structured encounter.
- **Hybrid:** Multi-agent architectural style running *locally* on Gemma 4 (not iAPI/Antigravity — that would break Track 1's local-first pitch). We get Grand Prize consideration for architectural depth without competing for Track 3's specific prize.

**Locked scope calls (2026-07-10):**
- Cloud Gemma path becomes fallback-only; primary reasoning + multimodal extraction moves on-device.
- Backend keeps `/chat` as fallback and adds a Live API WebSocket proxy. `/extract` stays but is deprecated in the app's primary path.
- New app surfaces: "What I noticed today" (agent observations), "I need your input" (low-confidence deferral queue), "Record visit" (Live API translation).
- Every message + brief item carries a confidence badge (🟢 grounded / 🟡 uncertain / 🔴 defer to human).

## Architecture delta

```text
BEFORE (v0.1)                            AFTER (v0.2)
──────────────                            ──────────────
Screens: Timeline, Chat, Upload,          Screens: Memory (was Timeline),
         Share                                     Chat, Upload, RecordVisit (new),
                                                   Noticed (new — flags), Share,
                                                   Inbox (new — deferral queue)

Single GemmaClient interface              Same interface — but 3 impls:
  ├── OnDeviceGemma (Gemma 3n)              ├── OnDeviceGemma (Gemma 4 E2B, text)
  └── CloudGemma (backend /chat)            ├── OnDeviceGemmaMM (Gemma 4 E4B, multimodal)
                                            └── CloudGemma (backend /chat, fallback only)

Single-agent chat                         Multi-agent Orchestrator + specialists:
                                            ├── ExtractorAgent  (uses E4B, docs → facts)
                                            ├── InteractionAgent (uses E2B, med safety)
                                            ├── TrendAgent      (uses E2B, longitudinal)
                                            └── BriefAgent      (uses E2B, doctor brief)

Backend: /extract, /chat, /brief          Backend: /chat (fallback), /brief (unchanged),
                                                    /live-ws (Live API proxy, new).
                                                    /extract retained but not primary.
```

## New file structure delta

Additions (all inside `app/src/`):

```text
app/src/
├── services/
│   ├── gemma/
│   │   ├── OnDeviceGemmaMM.ts        NEW — Gemma 4 E4B multimodal (image + text)
│   │   └── modelRegistry.ts          NEW — .task file paths, download URLs, capability probes
│   ├── agents/                       NEW dir
│   │   ├── Orchestrator.ts           NEW — routes tasks to specialists
│   │   ├── Agent.ts                  NEW — base interface every specialist implements
│   │   ├── ExtractorAgent.ts         NEW
│   │   ├── InteractionAgent.ts       NEW
│   │   ├── TrendAgent.ts             NEW
│   │   ├── BriefAgent.ts             NEW
│   │   └── types.ts                  NEW — AgentTask, AgentResult, ConfidenceLevel
│   ├── live/                         NEW dir
│   │   ├── LiveSession.ts            NEW — WebSocket client to backend /live-ws
│   │   └── LiveTranscript.ts         NEW — streaming transcript aggregator
│   └── store/repos.ts                MODIFIED — add flag+agent_action tables
├── ui/
│   ├── ConfidenceBadge.tsx           NEW — 🟢/🟡/🔴 pill
│   ├── FlagCard.tsx                  NEW — used on Noticed screen
│   └── LiveTranscriptView.tsx        NEW — used on RecordVisit
└── types.ts                          MODIFIED — add AgentTask/Result, Flag, DeferralItem

app/app/
├── (tabs)/
│   ├── memory.tsx                    RENAMED from timeline.tsx (contents ~same)
│   ├── noticed.tsx                   NEW tab
│   └── inbox.tsx                     NEW tab
├── record-visit.tsx                  NEW screen
└── share.tsx                         MODIFIED — brief items get confidence badges
```

Backend additions:

```text
backend/app/
├── routes/live.py                    NEW — /live-ws WebSocket proxy for Live API
└── gemma/live_client.py              NEW — thin wrapper for google.genai Live API
```

Schema additions (see Phase 3):

```sql
CREATE TABLE flag (id, patient_id, kind, subject, reasoning, confidence, agent, status, created_at);
CREATE TABLE deferral (id, patient_id, kind, question, context, resolved_answer, created_at);
CREATE TABLE agent_action (id, task_id, agent, action, output_json, confidence, took_ms, created_at);
```

---

## Phase 1: Gemma 4 on-device upgrade

**Goal:** replace Gemma 3n with Gemma 4. Add multimodal (E4B) for on-device extraction.

**Files touched:** `app/src/services/gemma/OnDeviceGemma.ts`, `app/src/services/gemma/OnDeviceGemmaMM.ts` (new), `app/src/services/gemma/modelRegistry.ts` (new), `app/src/services/gemma/GemmaClient.ts` (extended interface), `app/src/services/ingestion/ingestLabPdf.ts` (routes to on-device), `app/app/_layout.tsx` (register both candidates).

### Task 1.1 — modelRegistry + capability probe

Create `app/src/services/gemma/modelRegistry.ts` with entries for the two model families:

```ts
export const MODELS = {
  gemma4_e2b_text: {
    taskFileName: "gemma-3n-E2B-it-int4.task",  // NOTE: HF may use gemma-4 naming when GA
    downloadUrl: "https://huggingface.co/google/gemma-4-E2B-it-litert/resolve/main/gemma-4-E2B-it-int4.task",
    approxSizeBytes: 1_500_000_000,
    modality: "text" as const,
  },
  gemma4_e4b_mm: {
    taskFileName: "gemma-4-E4B-it-mm-int4.task",
    downloadUrl: "https://huggingface.co/google/gemma-4-E4B-it-litert-multimodal/resolve/main/gemma-4-E4B-it-mm-int4.task",
    approxSizeBytes: 4_000_000_000,
    modality: "multimodal" as const,
  },
};

export async function isModelAvailable(key: keyof typeof MODELS): Promise<boolean> { /* check FS */ }
export async function ensureModelDownloaded(key: keyof typeof MODELS, onProgress: (p: number) => void): Promise<string> { /* download resumable */ }
```

**Validation:** unit test that URL formation, filesize check, and progress callback fire correctly (mock `FileSystem`).

### Task 1.2 — `OnDeviceGemma.ts` swap to Gemma 4 E2B

Replace the hard-coded model constants at the top of `OnDeviceGemma.ts` to read from `MODELS.gemma4_e2b_text`. Otherwise unchanged (still text-only, same `NativeModules.LlmInferenceModule` path). Update the Task 11 comment about "gemma-3n-E2B-it-int4.task" to point at Gemma 4.

### Task 1.3 — `OnDeviceGemmaMM.ts` (new)

Same shape as `OnDeviceGemma.ts` but accepts images in the request. React-native-llm-mediapipe supports multimodal in v0.6+ (verify with `npm view react-native-llm-mediapipe versions`). If not available, use `NativeModules.LlmInferenceModule.createModelWithImages`. Interface:

```ts
export class OnDeviceGemmaMM {
  async generate(req: GenerateRequest): Promise<GenerateResponse> { /* accepts req.images */ }
}
export async function probeMMAvailable(): Promise<boolean> { /* checks E4B .task exists */ }
```

**Validation:** manual smoke via `LiveTranscriptView` after Phase 4, or via a temporary debug button in Upload if you want to test earlier.

### Task 1.4 — `GemmaClient.ts` interface extension

`getGemmaClient()` becomes `getGemmaClient(modality?: "text" | "multimodal")` — defaults to text. Multimodal returns the E4B implementation if available, else cloud fallback. Register both on-device candidates from `_layout.tsx`.

### Task 1.5 — `ingestLabPdf.ts` routes on-device

Currently POSTs the PDF to backend `/extract`. Change to:

```ts
const client = await getGemmaClient("multimodal");
const raw = await client.generate({
  prompt: LAB_PDF_PROMPT,             // reuse the backend prompt file's text
  images: [{ mimeType: "application/pdf", base64: bytes }],
  jsonMode: true,
});
const data = JSON.parse(raw.text);
// existing write path
```

Backend `/extract` stays for fallback (`CLOUD_ONLY_MODE=1` or when E4B isn't downloaded).

**Note on Gemma 4 availability:** if Gemma 4 hasn't been released by hackathon time, gracefully degrade to Gemma 3n. Add a runtime check in `modelRegistry` that tries Gemma 4 URLs first, falls back to 3n. Same code path either way.

---

## Phase 2: Multi-agent orchestrator (local)

**Goal:** every non-trivial reasoning task is decomposed and delegated. Judges must be able to see agents handing off, not one prompt doing everything.

### Task 2.1 — Base `Agent` interface + `types.ts`

```ts
// agents/types.ts
export type ConfidenceLevel = "grounded" | "uncertain" | "defer";

export interface AgentTask {
  kind: "extract" | "interaction_check" | "trend_analysis" | "brief_compose";
  input: Record<string, any>;
  patientId: number;
}

export interface AgentResult {
  agent: string;
  output: any;
  confidence: ConfidenceLevel;
  reasoning: string;              // must be non-empty; used in FlagCard/Chat
  handoff?: { toKind: AgentTask["kind"]; input: Record<string, any> };
}

// agents/Agent.ts
export interface Agent {
  name: string;
  handles: AgentTask["kind"];
  run(task: AgentTask): Promise<AgentResult>;
}
```

### Task 2.2 — `Orchestrator.ts`

```ts
class Orchestrator {
  private agents: Map<AgentTask["kind"], Agent>;
  register(agent: Agent) { this.agents.set(agent.handles, agent); }

  async execute(task: AgentTask): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    let current: AgentTask | undefined = task;
    while (current) {
      const agent = this.agents.get(current.kind);
      if (!agent) throw new Error(`no agent for ${current.kind}`);
      const started = Date.now();
      const result = await agent.run(current);
      results.push(result);
      // Log to agent_action table (see schema below).
      await logAgentAction({ task_id, agent: agent.name, action: current.kind,
                             output_json: JSON.stringify(result), confidence: result.confidence,
                             took_ms: Date.now() - started });
      current = result.handoff && { kind: result.handoff.toKind, input: result.handoff.input, patientId: task.patientId };
    }
    return results;
  }
}
```

Handoffs are the mechanism judges see: an `ExtractorAgent` produces meds, which triggers a handoff to `InteractionAgent`, which produces flags, which triggers a handoff to `BriefAgent`. The `agent_action` table records the chain.

### Task 2.3 — `ExtractorAgent`

Takes `input: { fileUri, sourceType }`. Calls on-device multimodal Gemma with the lab-PDF prompt. Returns `output: { encounter, labs[] }`. Confidence: `grounded` if JSON parses and every field is populated, `uncertain` if any missing, `defer` if JSON parse fails. If `defer`, its `handoff` is `undefined` (no downstream work) and it creates a `deferral` row so the user's Inbox surfaces the "please type these values manually" ask.

### Task 2.4 — `InteractionAgent`

Takes `input: { newMeds: Medication[] }`. Loads active meds from repo, builds a prompt asking Gemma to identify pairwise interactions with severity. Returns `output: { interactions: [{med1, med2, severity, reason}] }`. Each interaction with `severity >= "moderate"` becomes a `flag` row (surfaces on Noticed screen). Confidence: `grounded` for high-severity known pairs, `uncertain` for "possibly interacts", `defer` for anything the model qualifies with "consult pharmacist".

### Task 2.5 — `TrendAgent`

Takes `input: { testName }` OR runs unprompted on all labs. For each test with ≥ 3 datapoints, asks Gemma to characterize the trend and clinical significance. Emits `flag` rows for statistically-and-clinically-notable trends. Confidence: `grounded` for monotonic trends with clear clinical thresholds (HbA1c crossing 7.0), `uncertain` for noisy/borderline, `defer` for anything the model calls "concerning, discuss with doctor".

### Task 2.6 — `BriefAgent`

Takes `input: { includeFlags: boolean }`. Loads all facts + active flags + open deferrals. Composes the same `BriefFacts` shape (Task 17 v0.1) but now every item carries a confidence + reasoning. Handoffs: none (terminal in the chain). Confidence per item: propagates from source flag/agent.

### Task 2.7 — Trigger points

- Upload flow → Orchestrator with `extract` task; extracted meds triggers `interaction_check`; then `trend_analysis`; then `brief_compose` writes to flags table.
- Share flow → Orchestrator with `brief_compose` task; renders + posts to backend.
- Chat flow: NOT orchestrated (kept simple). Chat is still the "ask a question" surface; orchestration is the "act autonomously" surface.

---

## Phase 3: New agentic UI surfaces + schema

### Task 3.1 — schema additions

Add to `schema.sql` and `SEED_SQL` in `db.ts`:

```sql
CREATE TABLE IF NOT EXISTS flag (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patient(id),
  kind TEXT NOT NULL,          -- 'interaction' | 'trend' | 'adherence' | 'overdue_test'
  subject TEXT NOT NULL,       -- human-readable subject
  reasoning TEXT NOT NULL,
  confidence TEXT NOT NULL,    -- 'grounded' | 'uncertain' | 'defer'
  agent TEXT NOT NULL,
  status TEXT NOT NULL,        -- 'open' | 'ack' | 'dismissed'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS deferral (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patient(id),
  kind TEXT NOT NULL,          -- 'confirm_extraction' | 'confirm_interaction' | 'confirm_med'
  question TEXT NOT NULL,
  context TEXT,
  resolved_answer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS agent_action (
  id INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  output_json TEXT,
  confidence TEXT,
  took_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Seed 3-4 believable flags for the synthetic patient so the "What I noticed" screen has content on first boot (rising HbA1c flag, overdue A1c flag, one medium-severity interaction flag).

### Task 3.2 — `ConfidenceBadge.tsx`

Small pill component. Green = "grounded", yellow = "uncertain", red = "defer to doctor". Renders inline in ChatBubble, FlagCard, and each brief item on Share.

### Task 3.3 — `noticed.tsx` (new tab)

Reads open flags, renders each as a `FlagCard` sorted by severity (defer > uncertain > grounded × recency). Each card shows subject + reasoning + agent name + confidence badge. Tap → mark ack. Long-press → dismiss with reason.

### Task 3.4 — `inbox.tsx` (new tab)

Reads open deferrals, renders "I need your input" cards. Each has the question + a text/input surface for the answer. Answering writes back to the deferral row and (per deferral kind) either updates the underlying fact or fires a follow-up orchestrator task.

### Task 3.5 — Tab layout + rename

`app/app/(tabs)/_layout.tsx`: rename timeline → memory, add noticed + inbox tabs. Four tabs total: Memory, Noticed, Chat, Inbox. Upload and Share become buttons on Memory (not tabs).

### Task 3.6 — Update Timeline → Memory

Rename `timeline.tsx` → `memory.tsx`. Add a prominent "What I noticed" ribbon at top showing the top 2 open flags (link to Noticed tab). Keep the rest of Timeline's UI.

### Task 3.7 — Chat carries confidence

Every chat response now carries a confidence badge. Chat prompt asks Gemma to end its answer with a JSON metadata line: `{"confidence": "grounded|uncertain|defer", "reasoning": "..."}`. Client parses and renders badge. If parse fails, defaults to "uncertain".

---

## Phase 4: Live API record-a-visit

**Goal:** patient hits "Record visit", picks the doctor's language + their own, records for up to 5 minutes. Live API returns real-time transcript in both languages. On stop, we save the encounter + notes.

### Task 4.1 — Backend `/live-ws` WebSocket proxy

`backend/app/routes/live.py`:

```python
from fastapi import WebSocket, APIRouter
from google import genai  # google-genai SDK for Live API

router = APIRouter()

@router.websocket("/live-ws")
async def live_ws(client: WebSocket):
    await client.accept()
    config = await client.receive_json()  # {sourceLang, targetLang}
    genai_client = genai.Client(api_key=settings.google_api_key)
    async with genai_client.aio.live.connect(model="gemini-live-2.5-flash-preview",
                                             config={"response_modalities": ["TEXT"],
                                                      "system_instruction": build_translate_prompt(config)}) as session:
        async def audio_pump():
            while True:
                msg = await client.receive_bytes()
                await session.send_realtime_input(audio={"data": msg, "mime_type": "audio/pcm;rate=16000"})
        async def text_pump():
            async for chunk in session.receive():
                if chunk.text: await client.send_json({"text": chunk.text, "kind": "translated"})
                if chunk.server_content and chunk.server_content.input_transcription:
                    await client.send_json({"text": chunk.server_content.input_transcription.text, "kind": "raw"})
        await asyncio.gather(audio_pump(), text_pump())
```

The proxy is necessary because the Live API requires an API key (can't ship in the app bundle). Traffic is patient audio → backend → Live API → back to app. Backend does not persist any of it.

### Task 4.2 — `LiveSession.ts` client

```ts
export class LiveSession {
  constructor(private ws: WebSocket) {}
  static async connect(config: {sourceLang: string, targetLang: string}): Promise<LiveSession> { /* ws to BACKEND_URL + /live-ws */ }
  sendAudioChunk(pcmBytes: Uint8Array): void { this.ws.send(pcmBytes); }
  onTranscript(cb: (t: {text: string, kind: "raw"|"translated"}) => void): void { /* ws.onmessage */ }
  close(): void { this.ws.close(); }
}
```

### Task 4.3 — `record-visit.tsx` screen

Uses `expo-av` to capture mic audio, streams 16kHz PCM chunks to the LiveSession. Two-column layout: left column shows raw transcript (patient's language), right column shows translated transcript (doctor's language). Language-pair picker at top (defaults: `hi-IN` → `en-US`).

On stop: save one `encounter` row (`kind='visit'`, provider = user-typed name, date = now, summary = first 200 chars of translated transcript). Save the full transcript as a `note_chunk` (`source_type='live_visit'`, `source_ref = uuid`).

### Task 4.4 — Wire orchestrator to visit save

After saving, fire `Orchestrator.execute({kind: "trend_analysis"})` and `{kind: "brief_compose"}` so new flags get generated from any structured facts the doctor mentioned that Gemma can extract from the notes.

### Task 4.5 — Failure mode: offline

If `/live-ws` fails (no internet on the phone), the record-visit screen shows "Live translation unavailable. Recording audio to `note_chunk` for later processing." Audio bytes saved to file, transcription queued for when connection restores.

---

## Phase 5: Pitch reframe + demo drill v2

### Task 5.1 — Update `DEMO_DRILL.md` for v0.2

New hero moment: **"What I noticed today."** The demo opens on Memory screen with a "What I noticed" ribbon showing "🟡 HbA1c trending up — 3rd rise in a row" and "🔴 Overdue A1c by 3 weeks — recommend scheduling." Tap → Noticed screen → each flag has the agent name (TrendAgent, InteractionAgent) + reasoning + confidence.

New 4-minute script:

1. **Hook (20 s)** — "This isn't a chatbot. It's an *agent* that watches your health and tells you what to do about it — running entirely on Gemma 4 on your phone."
2. **Memory + What I noticed (30 s)** — Tap the top flag. Show reasoning grounded in labs. Point out the agent name (TrendAgent) and confidence badge.
3. **Multi-agent chain (40 s)** — Tap Upload → pick a new prescription PDF. Show progress: "ExtractorAgent → InteractionAgent → TrendAgent → BriefAgent." Each writes to the log. New flag appears on Noticed. This visualisation is the Track 3 hybrid credit.
4. **Live visit recording (50 s)** — Tap RecordVisit. Pick Hindi → English. Speak a short line in Hindi. Watch translation appear in real time. Stop. Show the resulting encounter appear in Memory. This is Track 2 hybrid credit.
5. **Share brief (50 s)** — Tap Share. QR appears. Doctor scans → brief opens. Point out the confidence badges on each brief item — "the agent knows what it's sure of and what it isn't."
6. **Close (10 s)** — "Runs offline on Gemma 4. Cloud only touches audio during the visit. Zero patient records stored on the server. Ever."

### Task 5.2 — Failure playbooks (extended)

- **E4B model download fails** → falls back to Gemma 3n on-device (already in `modelRegistry` as fallback). Pitch becomes "we're prepared for Gemma 4; running Gemma 3n today for demo reliability."
- **Multi-agent chain fails midway** → each agent's completed action is already written to `agent_action`; UI shows the completed steps + a "recovering" indicator. Orchestrator retries the failed step once, then defers with a deferral row.
- **Live API disconnects mid-visit** → local audio buffer preserved; transcript resumes on reconnect. If no reconnect, audio saved for later batch transcription.
- **Everything cloud fails** → set `EXPO_PUBLIC_CLOUD_ONLY_MODE=0` (the on-device flag) AND `EXPO_PUBLIC_DISABLE_LIVE=1`. Chat + agents run on-device; record-visit screen is disabled with a friendly "requires internet" message. Memory + Noticed + Share still work.

### Task 5.3 — README + SETUP updates

Extend `SETUP.md` with:
- v0.2 architecture diagram (redo the ASCII with Orchestrator + agents box).
- Gemma 4 model download instructions and expected sizes.
- Live API setup: same GOOGLE_API_KEY as before but note Live API needs its billing enabled (usually included in AI Studio free tier).
- New troubleshooting entries (each failure mode above).

---

## Estimated effort

| Phase | Description | Hours |
|---|---|---|
| 1 | Gemma 4 on-device + multimodal | 6-10 |
| 2 | Multi-agent orchestrator + 4 specialists | 6-10 |
| 3 | UI surfaces (Noticed, Inbox, badges, Memory rename) | 4-6 |
| 4 | Live API record-a-visit | 8-12 |
| 5 | Pitch reframe + failure playbooks + SETUP update | 2-3 |
| **Total** | | **26-41 h** |

## Ordering + priorities

Execute in phase order. **Do not** start Phase 4 (Live API) until Phase 1 + 2 + 3 are demoable end-to-end — Live API is the flashy addition, but it's not the hero. If time runs out mid-Phase-4, the app still tells a strong Track 1 + Grand Prize story without it (just skip the Live API demo beat in the script).

## Global constraints (bind all phases)

- Every Gemma call still goes through `GemmaClient.generate(...)`. Agents are consumers of that interface — they do not call MediaPipe / SDK directly.
- Every write to patient-data tables still includes `source_type` + `source_ref`.
- Backend still persists nothing patient-related outside the 24 h brief TTL and Live API session lifetime.
- Confidence badges are required on every agent output, chat response, and brief item.
- On-device is the primary path for anything except audio (Live API is cloud by nature).
