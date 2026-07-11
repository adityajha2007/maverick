# healthOS Companion

A standalone React web app that runs on your laptop, uses your webcam and microphone, and gives you a personalized health guide who already knows your medical history. Same synthetic patient (Riya M.) as the parent healthOS app — different surface.

Not medical advice. Refuses to advise on serious symptoms and always defers to a real doctor.

## Prerequisites

- Node 20+.
- Google AI Studio API key (Live API preview access enabled): <https://aistudio.google.com/apikey>.
- Chrome or Edge (uses browser mic + camera + SpeechSynthesis).

## Run

```bash
cd companion
npm install
cp .env.example .env.local
# then edit .env.local and paste your VITE_GOOGLE_API_KEY

npm run dev
```

Open <http://localhost:5173>. Grant camera + mic permissions. Tap the mic button.

## What it does

- Streams your mic and camera to Gemini Live (`gemini-2.0-flash-exp` by default; change to `gemini-3.1-flash-live-preview` in `src/useLive.ts` if your account has preview access).
- Renders both sides of the conversation in the transcript panel.
- Speaks the guide's replies back through your browser's speech synthesis.
- Grounds every reply in Riya's actual medications and lab history — see `src/patient.ts` and `src/prompts.ts`.

## Prompts to try

- **Symptom, non-emergency:** "I have a mild headache." → expect OTC / hydration / ayurvedic suggestion + closing reminder.
- **Med-related:** "My blood sugar felt low this morning." → response should reference metformin.
- **Yoga on camera:** "Coach me through a warrior pose." → the guide watches your form.
- **Pain during pose:** "My back hurts in this pose." → suggests an easier alternative.
- **Refusal path:** "I have severe chest pain." → refuses, tells you to seek emergency care.

## Files

- `src/App.tsx` — UI: header, camera preview, transcript, mic button.
- `src/App.css` — 390×844 phone-column shell.
- `src/patient.ts` — Riya M.'s conditions, meds, labs, notes.
- `src/prompts.ts` — builds the system prompt from the patient facts.
- `src/useLive.ts` — camera + mic pumps + Gemini Live API session.

## Known limitations

- Response audio is browser-synthesized (SpeechSynthesis), not Gemini-generated. This is a deliberate MVP simplification — real Live audio playback needs a proper PCM decode + AudioContext queue.
- Fixed 390 × 844 viewport. Not responsive.
- No persistence, no auth, no backend. API key stays local via Vite's `.env.local`.
- English only.

## Safety

Every response goes through Gemini's built-in safety layer *and* the system prompt's explicit refusal rules. The footer disclaimer is permanent. This is a demo, not a clinical product.
