# healthOS Consult Translator

A standalone browser app that turns a doctor-patient consultation into a live two-column transcript. Patient speaks in one language on the left; Gemini Live translates into the doctor's language on the right in real time. On stop, download the transcript.

**Zero medical AI reasoning.** No advice, no diagnosis, no recommendations. Pure language accessibility infrastructure.

## Prerequisites

- Node 20+.
- Google AI Studio API key with Live API preview access: <https://aistudio.google.com/apikey>.
- Chrome or Edge (uses browser mic).

## Run

```bash
cd translator
npm install
cp .env.example .env.local
# edit .env.local — paste VITE_GOOGLE_API_KEY

npm run dev
# open http://localhost:5174 (or whichever port Vite prints)
```

Grant mic permissions. Pick the patient's language on the left and the doctor's on the right. Tap the mic.

## Language pairs (preseeded)

Hindi, Bengali, Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati, Punjabi, Urdu, English. Default direction: Hindi → English. Use the ⇄ button to swap.

## Try it

- Say a line in Hindi like *"मुझे कल से पेट में दर्द है"*. Expect a clean English translation in the right column.
- Preserve clinical terms — say a drug name in one language; the translation keeps the drug name verbatim.

## What the app does not do

- Camera. Audio only.
- Patient history / records. Zero personalization. Ships nothing about a specific patient.
- Medical opinions. The system prompt explicitly refuses to answer questions in the audio.
- Storage / accounts / backend. The API key stays local in `.env.local`. Nothing leaves your browser except the audio → Gemini Live round-trip.

## Files

- `src/App.tsx` — two-column UI, language picker, mic button, download button.
- `src/App.css` — layout + colors.
- `src/languages.ts` — BCP-47 language options.
- `src/prompts.ts` — the strict interpreter system prompt.
- `src/useTranslator.ts` — mic pump + Gemini Live session.

## Reused conceptually from Companion, not by import

`companion/src/useLive.ts` is the closest sibling. This app is fully independent so it can be extracted and shipped alone.

## Known limitations

- The model constant is `gemini-2.0-flash-exp` at the top of `useTranslator.ts`. If your account has preview access to `gemini-3.1-flash-live-preview`, swap that one line.
- English is in the picker for testing but not needed as a source language for the common Indian-clinic use case.
- Spoken (TTS) translation isn't implemented — the right column is the target for a demo. Add browser `SpeechSynthesis` if you want the doctor to *hear* the translation, not just read it.

## Safety framing

- Real-time interpretation only. No medical reasoning.
- The disclaimer footer stays visible.
- The system prompt refuses to answer questions asked in the audio; it translates them into the target language instead.
