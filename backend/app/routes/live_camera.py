from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types as gen_types
import asyncio
import json

from app.config import settings

router = APIRouter()


def _camera_system_instruction(patient_context: str | None) -> str:
    base = (
        "You are a medical visit assistant with camera access. "
        "You can see prescriptions, medication bottles, and documents the doctor or patient holds up. "
        "When you see a prescription or medication label, extract: drug name, dosage, frequency, and duration. "
        "Output each extraction as a JSON line: "
        '{"kind":"rx","drug":"...","dose":"...","frequency":"...","duration":"..."}. '
        "When you hear the patient or doctor speak, note any hesitation, confusion, or emotional distress "
        "and flag it: "
        '{"kind":"tone","observation":"..."}. '
        "For normal conversation, output nothing — only act on visual or tonal signals."
    )

    if patient_context:
        base += (
            "\n\nYou also have the patient's medical context. "
            "Cross-reference any new prescription against current medications. "
            "If you detect a potential drug interaction, emit: "
            '{"kind":"alert","text":"<concise warning>"}.\n\n'
            f"Patient context:\n{patient_context}"
        )

    return base


@router.websocket("/live-camera-ws")
async def live_camera_ws(client: WebSocket) -> None:
    await client.accept()
    try:
        cfg = await client.receive_json()
    except Exception:
        await client.close(code=1002, reason="config expected as first message")
        return

    patient_context = cfg.get("patientContext")

    if not settings.google_api_key:
        await client.send_json({"kind": "error", "text": "GOOGLE_API_KEY not set."})
        await client.close()
        return

    system = _camera_system_instruction(patient_context)

    genai_client = genai.Client(api_key=settings.google_api_key)
    live_cfg = gen_types.LiveConnectConfig(
        response_modalities=[gen_types.Modality.TEXT],
        system_instruction=system,
        input_audio_transcription=gen_types.AudioTranscriptionConfig(),
    )

    try:
        async with genai_client.aio.live.connect(
            model="gemini-3.1-flash-live-preview",
            config=live_cfg,
        ) as session:
            async def input_pump() -> None:
                try:
                    while True:
                        msg = await client.receive()
                        if "bytes" in msg and msg["bytes"]:
                            data = msg["bytes"]
                            if len(data) > 10_000:
                                await session.send_realtime_input(
                                    media=gen_types.Blob(data=data, mime_type="image/jpeg")
                                )
                            else:
                                await session.send_realtime_input(
                                    audio=gen_types.Blob(data=data, mime_type="audio/pcm;rate=16000")
                                )
                        elif "text" in msg and msg["text"]:
                            pass
                except WebSocketDisconnect:
                    pass

            async def output_pump() -> None:
                async for response in session.receive():
                    text = getattr(response, "text", None)
                    if not text:
                        continue
                    text = text.strip()
                    if not text:
                        continue
                    if text.startswith("{"):
                        try:
                            parsed = json.loads(text)
                            kind = parsed.get("kind", "info")
                            await client.send_json(parsed)
                            continue
                        except (json.JSONDecodeError, KeyError):
                            pass
                    await client.send_json({"kind": "info", "text": text})

            await asyncio.gather(input_pump(), output_pump())
    except Exception as e:
        await client.send_json({"kind": "error", "text": str(e)})
    finally:
        try:
            await client.close()
        except Exception:
            pass
