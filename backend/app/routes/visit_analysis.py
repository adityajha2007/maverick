import json

from fastapi import APIRouter, HTTPException
from google import genai
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


class VisitAnalysisRequest(BaseModel):
    raw_transcript: str
    translated_transcript: str
    patient_context: str | None = None


class ActionItem(BaseModel):
    title: str
    description: str
    kind: str  # xray, lab_test, follow_up, medication, lifestyle, referral
    priority: str  # high, normal, low
    due_date: str | None = None


class VisitAnalysisResponse(BaseModel):
    summary: str
    action_items: list[ActionItem]
    medications_mentioned: list[dict] | None = None


ANALYSIS_PROMPT = """You are a medical visit analyzer. Analyze this doctor-patient conversation transcript and extract ALL actionable items the doctor recommended.

For each action item, classify it as one of: xray, lab_test, follow_up, medication, lifestyle, referral

Set priority: "high" for urgent tests/actions, "normal" for routine, "low" for optional.

If the doctor mentioned a timeframe (e.g. "come back in 2 weeks", "get this done within a week"), include a due_date in YYYY-MM-DD format relative to today.

Return ONLY valid JSON:
{
  "summary": "Brief 1-2 sentence summary of the visit",
  "action_items": [
    {
      "title": "Get X-ray of lower back",
      "description": "Doctor recommended lumbar X-ray to check compression",
      "kind": "xray",
      "priority": "high",
      "due_date": "YYYY-MM-DD or null"
    }
  ],
  "medications_mentioned": [
    {"drug": "...", "dose": "...", "frequency": "...", "timing": "..."}
  ]
}

If no action items found, return empty action_items array.
"""


@router.post("/analyze-visit", response_model=VisitAnalysisResponse)
async def analyze_visit(req: VisitAnalysisRequest) -> VisitAnalysisResponse:
    if not settings.google_api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not set")

    transcript_text = req.translated_transcript or req.raw_transcript
    if not transcript_text.strip():
        return VisitAnalysisResponse(summary="Empty transcript", action_items=[])

    prompt = ANALYSIS_PROMPT + f"\n\nToday's date: {__import__('datetime').date.today().isoformat()}\n"

    if req.patient_context:
        prompt += f"\nPatient context:\n{req.patient_context}\n"

    prompt += f"\nTranscript:\n{transcript_text}"

    client = genai.Client(api_key=settings.google_api_key)
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=prompt,
    )

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"Gemini returned non-JSON: {raw[:300]}")

    return VisitAnalysisResponse(**data)
