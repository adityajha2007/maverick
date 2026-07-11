from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types as gen_types
import asyncio
import json

from app.config import settings

router = APIRouter()


def _system_instruction(source_lang: str, target_lang: str, patient_context: str | None) -> str:
    base = (
        f"You are a real-time medical interpreter for a doctor-patient visit. "
        f"The patient is speaking {source_lang}. The doctor speaks {target_lang}. "
        f"For each utterance, output ONLY the translation into {target_lang}. "
        f"Do not add commentary, do not repeat the source, do not add pleasantries. "
        f"Preserve clinical terms (drug names, dosages, test names) verbatim."
    )

    if patient_context:
        base += (
            f"\n\nYou also have the patient's medical context below. "
            f"If the doctor prescribes a medication or mentions a treatment, check it against "
            f"the patient's current medications and conditions. If you detect a potential "
            f"drug interaction, allergy risk, or contraindication, emit a JSON line INSTEAD "
            f'of a translation: {{"kind":"alert","text":"<concise warning>"}}. '
            f"Only alert for genuine clinical risks, not routine prescriptions.\n\n"
            f"Patient context:\n{patient_context}"
        )

    return base


@router.websocket("/live-ws")
async def live_ws(client: WebSocket) -> None:
    await client.accept()
    try:
        cfg = await client.receive_json()
    except Exception:
        await client.close(code=1002, reason="config expected as first message")
        return

    source_lang = cfg.get("sourceLang", "hi-IN")
    target_lang = cfg.get("targetLang", "en-US")
    patient_context = cfg.get("patientContext")

    if not settings.google_api_key:
        await client.send_json({"kind": "error", "text": "GOOGLE_API_KEY not set — Gemini Live requires an API key."})
        await client.close()
        return

    system = _system_instruction(source_lang, target_lang, patient_context)

    genai_client = genai.Client(api_key=settings.google_api_key)
    live_cfg = gen_types.LiveConnectConfig(
        response_modalities=[gen_types.Modality.TEXT],
        system_instruction=system,
        input_audio_transcription=gen_types.AudioTranscriptionConfig(),
    )

    try:
        async with genai_client.aio.live.connect(
            model="gemini-3.5-live-translate-preview",
            config=live_cfg,
        ) as session:
            async def audio_pump() -> None:
                try:
                    while True:
                        chunk = await client.receive_bytes()
                        await session.send_realtime_input(
                            audio=gen_types.Blob(data=chunk, mime_type="audio/pcm;rate=16000")
                        )
                except WebSocketDisconnect:
                    pass

            async def text_pump() -> None:
                async for response in session.receive():
                    text = getattr(response, "text", None)
                    if text:
                        text = text.strip()
                        if text.startswith("{") and '"kind":"alert"' in text:
                            try:
                                alert_data = json.loads(text)
                                await client.send_json({"kind": "alert", "text": alert_data["text"]})
                                continue
                            except (json.JSONDecodeError, KeyError):
                                pass
                        await client.send_json({"kind": "translated", "text": text})

                    sc = getattr(response, "server_content", None)
                    if sc and getattr(sc, "input_transcription", None) and sc.input_transcription.text:
                        await client.send_json({"kind": "raw", "text": sc.input_transcription.text})

            await asyncio.gather(audio_pump(), text_pump())
    except Exception as e:
        await client.send_json({"kind": "error", "text": str(e)})
    finally:
        try:
            await client.close()
        except Exception:
            pass
