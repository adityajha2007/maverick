import json

from fastapi import APIRouter, HTTPException
from google import genai
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


class ImageRequest(BaseModel):
    image_base64: str


class ParsedMedication(BaseModel):
    drug: str
    dose: str
    frequency: str
    duration: str | None = None
    timing: str | None = None


class PrescriptionResponse(BaseModel):
    medications: list[ParsedMedication]
    provider: str | None = None
    date: str | None = None
    notes: str | None = None


PARSE_PROMPT = """Analyze this medical prescription or medication image.
Extract ALL medications with their details.

Return ONLY valid JSON in this exact format:
{
  "medications": [
    {"drug": "...", "dose": "...", "frequency": "...", "duration": "...", "timing": "morning/evening/etc"}
  ],
  "provider": "doctor name if visible",
  "date": "YYYY-MM-DD if visible",
  "notes": "any other relevant medical notes"
}

If this is not a prescription/medication image, return:
{"medications": [], "notes": "Description of what was seen in the image"}
"""


@router.post("/parse-prescription", response_model=PrescriptionResponse)
async def parse_prescription(req: ImageRequest) -> PrescriptionResponse:
    if not settings.google_api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not set")

    client = genai.Client(api_key=settings.google_api_key)
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=[
            {
                "parts": [
                    {"text": PARSE_PROMPT},
                    {"inline_data": {"mime_type": "image/jpeg", "data": req.image_base64}},
                ]
            }
        ],
    )

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"Gemini returned non-JSON: {raw[:200]}")

    return PrescriptionResponse(**data)


class AnalyzeRequest(BaseModel):
    image_base64: str
    prompt: str = "Describe what you see in this medical image. If it shows a body part with pain or injury, describe the location, visible symptoms, and severity."


@router.post("/analyze-image")
async def analyze_image(req: AnalyzeRequest) -> dict:
    if not settings.google_api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not set")

    client = genai.Client(api_key=settings.google_api_key)
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=[
            {
                "parts": [
                    {"text": req.prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": req.image_base64}},
                ]
            }
        ],
    )

    return {"analysis": response.text.strip()}
