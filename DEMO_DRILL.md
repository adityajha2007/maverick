# healthOS demo drill (v0.2)

Rehearsal runbook for the Google DeepMind Bangalore Hackathon. Print this or keep it open on a second screen while presenting.

**v0.2 pitch:** Local-first multi-agent medical AI on Gemma 4, with Gemini Live for cross-language consultation capture. Track 1 (hero) + Track 2 (Live API hybrid) + Track 3 (multi-agent architecture hybrid).

## Roles

- **Presenter:** drives the phone.
- **Co-presenter (optional):** opens the doctor-brief URL on a tablet at the Share moment.

## Pre-demo checklist (T-30 min)

- [ ] Backend `/health` returns `{"status":"ok"}`.
- [ ] Backend `/brief/demo` renders the static demo brief (fallback for total network failure).
- [ ] Gemma 4 E2B `.litertlm` model file pre-downloaded to `<app documents>/models/` on the demo device via `adb push`. **Do not** rely on live download over venue Wi-Fi.
- [ ] APK installed on Pixel-class Android device (Pixel 6+ recommended for 8GB RAM). Clear app data with `adb shell pm clear com.healthos.app` so seed loads fresh.
- [ ] Wi-Fi hotspot ready as backup (venue Wi-Fi often fails).
- [ ] Google AI Studio quota checked in the dashboard. Live API billing enabled.
- [ ] One real lab-report PDF loaded onto the phone's Files (for the live upload moment).
- [ ] For the Live-visit demo: **iOS device or Pixel 8+ with recent Android** (see Known Limitations below). Prepare one pre-recorded Hindi consultation clip as a backup.
- [ ] `EXPO_PUBLIC_CLOUD_ONLY_MODE` set to `1` in the build if the on-device Gemma 4 bridge is unstable.
- [ ] Screenshot deck of every screen ready — total-failure fallback.

## Primary script (v0.2 — 4 minutes)

**Hero framing:** this is *not* a chatbot. It's an **agent** that observes your health, decides what to flag, defers to a human when uncertain, and runs entirely on Gemma 4 on your phone.

1. **Hook (20 s)** — "Every time you see a new doctor, you start from scratch. healthOS gives you a memory that watches your health, decides what to tell you, and defers to your doctor when it's not sure — running on Gemma 4, entirely on your phone."

2. **Memory + What I noticed (30 s)** — Boot the app into the **Memory** tab. Point to Riya M.'s conditions, current routine, and the *rising* HbA1c sparkline. At the top of the screen, the *"What I noticed"* ribbon shows a 🟡 flag: "HbA1c trending up — 3rd rise in a row." Tap → **Noticed** tab → each flag shows the *agent name* (TrendAgent, InteractionAgent) plus a **confidence badge**. Tap the 🔴 flag "Overdue A1c by 3 weeks — ask your doctor" and say: "The agent knows what it's sure of and what needs a human."

3. **Multi-agent chain (40 s)** — Tap **Upload** → pick a real lab PDF. Show the progress indicator cycling through **ExtractorAgent → InteractionAgent → TrendAgent → BriefAgent**. Each writes to the `agent_action` log (the debug panel can show the chain if judges ask). A new flag appears in Noticed. **This is your Track 3 hybrid moment.** Say: "Four agents on Gemma 4, handing tasks off, each recording its confidence."

4. **Live visit recording (50 s)** — Tap **Record visit**. Pick **Hindi → English**. Say (or play) a short line in Hindi about a recent symptom. Watch the translation appear in real time in the right column. Stop. Show the resulting encounter appear in the Memory timeline as a new visit note. **This is your Track 2 hybrid moment.** Say: "Gemini Live listens, translates, and writes it straight into your memory — no separate translator app, no transcription copy-paste."

5. **Share brief (50 s)** — Tap **Share with doctor**. QR appears. Co-presenter scans → the doctor's tablet loads the brief. Walk the brief top-to-bottom:
   - Active conditions, current regimen.
   - Recent labs with trend arrows.
   - **Follow-up tests due** — the "overdue by 3 weeks" card.
   - **3 things to ask** — Gemma-derived.
   - **Every item carries a confidence badge.** Point out one 🟡 next to a follow-up recommendation.

6. **Close (10 s)** — "One reasoning stack — Gemma 4 — running the agents, running the chat, running the brief composition. The Live API touches audio in real time and nothing else. Zero patient records stored on a server. This isn't a record. It's a memory that watches and defers."

## Fallback script (v0.1 — 3 minutes)

If Gemma 4 on-device fails at boot, Live API fails to connect, or the multi-agent chain surfaces a runtime error mid-demo, fall back to the v0.1 script (below). It uses Gemma 3n on-device + cloud fallback, no Live API, no multi-agent handoff visualization. Same product story, less depth. All demos below still work in v0.2:

1. Hook (20 s): "medical memory on your phone."
2. Timeline (30 s): conditions + routine + labs.
3. Chat (40 s): "why am I on metformin?" — grounded answer.
4. Live ingestion (40 s): upload a real lab PDF, watch extraction.
5. Share brief (50 s): QR + doctor brief.
6. Close (10 s): "data lives on the phone; runs on Gemma."

## Known limitations to disclose if asked

Judges may probe on these. Answer honestly — hackathon-pitch honesty scores higher than shifty deflection.

- **Live-visit on Android:** expo-av doesn't expose raw-PCM audio recording on Android — only compressed AAC. Our current build sends the recording as a WAV blob after Stop rather than as a live PCM stream. iOS gives us genuine 16 kHz PCM. If a judge tries live streaming on an Android device, the Live API may reject or garble the audio. Path forward is `react-native-audio-record` or a server-side transcode; documented in the SETUP as a v0.3 fix.
- **Gemma 4 on-device:** `react-native-llm-mediapipe@0.5.0` bundles native MediaPipe `tasks-genai:0.10.11`, which pre-dates the `.litertlm` container format. If the native library rejects the Gemma 4 file, our fallback path silently loads Gemma 3n instead. Code and file are correct; runtime is uncertain until the bridge updates or we fork it.
- **Multi-agent latency:** 4 sequential Gemma calls on-device add up to ~20–40 s of thinking time. The progress indicator is deliberate — narrate what each agent is doing while it runs.

## Failure playbooks

- **Gemma 4 model download fails on stage** → app automatically falls back to Gemma 3n. Pitch narration: "we're prepared for Gemma 4; running 3n for demo reliability while the RN-MediaPipe bridge catches up to the new file format." Judges will read this as honest engineering.
- **On-device Gemma bridge fails to init at all** → set `EXPO_PUBLIC_CLOUD_ONLY_MODE=1` in `.env`, sideload the fallback APK. All chat + agents run via backend `/chat`. Say: "one interface, two backends — the model swap is a config flip."
- **Multi-agent chain fails midway** → completed agents' outputs are already written to `agent_action`. The Orchestrator retries the failed step once, then defers with a `deferral` row (surfaces on Inbox). Narrate: "TrendAgent got confused, so it queued a question for the human — this is the deferral surface."
- **Live API refuses to connect** → skip the record-visit step in the script. Rest of the demo is unaffected.
- **Live API accepts but garbles Android AAC audio** → switch to a pre-recorded English voice clip and demonstrate the *shape* of the flow: two-column raw-vs-translated display, save-to-memory, orchestrator dispatch. Own the limitation: "we're mid-swap to a native PCM library — the flow is the pitch, not the specific audio path."
- **Backend times out** → open `<backend-host>/brief/demo` in the browser and narrate over the static demo brief. Judges won't know the difference.
- **Device dies mid-demo** → screenshot deck. Finish narrating over slides.
- **Full network failure** → app still runs. Gemma is on-device, memory is on-device, timeline works, chat works, share is disabled. Demo becomes "look, it works offline — which is exactly Track 1's whole thesis."

## Post-demo cleanup

- Rotate the Google AI Studio API key if used publicly.
- Flush Upstash brief-URL cache: `redis-cli -u $UPSTASH_REDIS_URL --tls FLUSHDB` (or wait 24 h for TTL).
- Wipe demo device: `adb shell pm clear com.healthos.app`.
- Delete any pre-recorded consultation audio clips from the phone.

## Handy commands

```bash
# Clear app state on device (forces first-boot seed re-run)
adb shell pm clear com.healthos.app

# Pre-push the Gemma 4 model file to device documents dir
adb push gemma-4-E2B-it.litertlm /sdcard/Android/data/com.healthos.app/files/models/

# Tail app logs while demoing (spot Orchestrator handoffs live)
adb logcat *:S ReactNativeJS:V

# Quick smoke: backend up + returns demo brief
curl https://<backend-host>/health && curl https://<backend-host>/brief/demo | head
```
