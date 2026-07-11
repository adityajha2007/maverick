# healthOS

An **AI Medical Memory** that lives on the patient's phone. Instead of storing documents like an EHR does, it stores relationships and longitudinal context in a per-patient Health Knowledge Graph — then lets an on-device multi-agent system observe, reason, and defer to a human when uncertain. Patients can chat with their memory in natural language, record a doctor visit in one language and share the translated brief in another, and hand a doctor a one-page summary via a shareable short URL and QR code.

Built for the **Google DeepMind Bangalore Hackathon** — targeting Track 1 (Local-First Agents on Gemma) with hybrid support for Track 2 (Gemini Live API) and Track 3 flavor (multi-agent orchestration).

## Status

- Backend: **14 pytest passing** (FastAPI + Gemma via `google-generativeai` + `google-genai` for Live API).
- App: **14 jest passing**, **0 TypeScript errors introduced** across all build phases (Expo SDK 57 + React Native + on-device Gemma 4 via MediaPipe LLM Inference).
- Runtime demo: **pending an Android device or emulator + Google AI Studio API key + Upstash Redis instance**. Every step is documented in `SETUP.md`.

## Read next

- **[`SETUP.md`](./SETUP.md)** — full onboarding guide. Prerequisites, backend + app setup, running end-to-end, testing, deployment sketches, troubleshooting. Includes §14 for the v0.2 architecture (multi-agent + Live API) and known runtime gaps.
- **[`DEMO_DRILL.md`](./DEMO_DRILL.md)** — demo-day pitch script (4-min primary + 3-min fallback) with pre-demo checklist and failure playbooks.
- **[`idea.md`](./idea.md)** — the original product pitch.
- **[`docs/superpowers/specs/2026-07-08-healthos-android-mvp-design.md`](./docs/superpowers/specs/2026-07-08-healthos-android-mvp-design.md)** — frozen design spec.
- **[`docs/superpowers/plans/2026-07-10-healthos-v02-tracks-1-2-3-plan.md`](./docs/superpowers/plans/2026-07-10-healthos-v02-tracks-1-2-3-plan.md)** — v0.2 evolution plan (Tracks 1+2+3).

## Quick start (three terminals)

Prerequisites: Python 3.11+, Node 20+, an Android device or emulator, a Google AI Studio API key, an Upstash Redis account. See `SETUP.md` for detail.

```bash
# Terminal A — backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # then fill GOOGLE_API_KEY + UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal B — Android emulator
emulator -avd Pixel_6_API_34 &

# Terminal C — Expo dev server
cd app
npm install --legacy-peer-deps
cp .env.example .env   # then set EXPO_PUBLIC_BACKEND_URL to your local backend
npx expo start --android
```

## Repo layout

```
healthOS/
├── README.md                   ← you are here
├── SETUP.md                    ← full onboarding + operations guide
├── DEMO_DRILL.md               ← demo-day pitch script
├── idea.md                     ← product pitch
│
├── backend/                    ← FastAPI service, Python 3.11+
│   ├── app/main.py             ← app + CORS + slowapi + router wiring
│   ├── app/routes/             ← /extract, /chat, /brief, /brief/{token}, /brief/demo, /live-ws
│   ├── app/gemma/              ← google-generativeai wrapper + prompts
│   ├── app/render/             ← doctor-brief Jinja template
│   └── tests/                  ← pytest suite (14 tests)
│
├── app/                        ← Expo SDK 57 / React Native
│   ├── app/                    ← Expo Router routes
│   │   ├── (tabs)/             ← memory · noticed · chat · inbox
│   │   ├── upload.tsx          ← top-level lab-PDF ingestion
│   │   ├── share.tsx           ← QR + shareable doctor brief
│   │   └── record-visit.tsx    ← Live API speech translation
│   ├── src/
│   │   ├── services/
│   │   │   ├── gemma/          ← GemmaClient interface + Cloud + OnDevice (Gemma 4)
│   │   │   ├── agents/         ← Orchestrator + 4 specialist agents (Track 3)
│   │   │   ├── live/           ← LiveSession + transcript aggregator (Track 2)
│   │   │   ├── store/          ← op-sqlite + repos + schema + seed
│   │   │   ├── ingestion/      ← ingestLabPdf.ts
│   │   │   ├── chat/           ← buildContext.ts (compact <8 KB payload)
│   │   │   └── share/          ← BriefBuilder.ts
│   │   └── ui/                 ← theme, Sparkline, FactRow, ChatBubble, ConfidenceBadge, FlagCard, LiveTranscriptView
│   ├── assets/seed/            ← synthetic_patient.sql (the design artifact)
│   └── __tests__/              ← jest suite (14 tests)
│
└── docs/superpowers/
    ├── specs/                  ← design spec
    └── plans/                  ← v0.1 + v0.2 implementation plans
```

## Track alignment

| Track | Focus | Fit |
|---|---|---|
| **Track 1 (hero)** | On-device Gemma 4 E2B chat + reasoning. Multi-agent sense-decide-act-check loop with human-deferral surfaces (Inbox, Noticed). Cloud is fallback only. | Full |
| Track 2 (hybrid) | Gemini Live API for real-time speech translation during a doctor visit. Backend `/live-ws` WebSocket proxy. | `record-visit.tsx` flow |
| Track 3 (hybrid) | Local multi-agent orchestrator with visible handoffs (Orchestrator → Extractor → Interaction → Trend → Brief), logged to `agent_action` table. Not iAPI/Antigravity — local architecture instead. | Architectural depth for Grand Prize |

## License

Prototype code for the Google DeepMind Bangalore Hackathon 2026. Not licensed for redistribution.
