import json

from fastapi import APIRouter
from google import genai
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


class AgentAssistRequest(BaseModel):
    recent_transcript: str
    patient_context: str


class AgentAssistResponse(BaseModel):
    should_respond: bool
    response: str


ASSIST_PROMPT = """You are a patient's medical memory assistant listening to a live doctor-patient conversation.

When the doctor asks about the patient's medical history, medications, past symptoms, test results, allergies, or any information in the patient's records — provide a brief, accurate answer from their memory.

ONLY respond when:
1. The doctor clearly asked a question about patient history/records
2. The answer exists in the patient's medical memory below
3. Your response would genuinely help the patient recall and relay information

DO NOT respond to:
- General medical advice or diagnostic questions
- Questions about how the patient feels RIGHT NOW (only they know)
- Greetings, small talk, or instructions
- Questions already answered in the conversation

Patient's Medical Memory:
{context}

Recent conversation (translated to English):
{transcript}

Return ONLY valid JSON (no markdown):
{{"should_respond": true, "response": "brief helpful answer"}}
or
{{"should_respond": false, "response": ""}}
"""


@router.post("/agent-assist", response_model=AgentAssistResponse)
async def agent_assist(req: AgentAssistRequest) -> AgentAssistResponse:
    if not settings.google_api_key:
        return AgentAssistResponse(should_respond=False, response="")

    if not req.recent_transcript.strip():
        return AgentAssistResponse(should_respond=False, response="")

    prompt = ASSIST_PROMPT.format(
        context=req.patient_context,
        transcript=req.recent_transcript,
    )

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
        return AgentAssistResponse(**data)
    except (json.JSONDecodeError, TypeError):
        return AgentAssistResponse(should_respond=False, response="")
