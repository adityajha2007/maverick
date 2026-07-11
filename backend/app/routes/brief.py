from __future__ import annotations
import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pydantic import BaseModel

from app.config import settings
from app.gemma.client import get_gemma_client
from app.gemma.prompts.follow_ups import build_follow_ups_prompt
from app.gemma.prompts.watch_list import build_watch_list_prompt
from app.redis_client import get_redis

router = APIRouter()

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "render"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(),
)
_BRIEF_TTL = 86_400  # 24h


class BriefFactsIn(BaseModel):
    patient: dict
    conditions: list[dict]
    medications: list[dict]
    recent_labs: list[dict]
    encounters: list[dict]
    watch_list: list[str] = []
    follow_ups: list[dict] = []


class BriefResponse(BaseModel):
    url: str
    expires_at: str


def _derive_watch_list(facts_json: str) -> list[str]:
    client = get_gemma_client()
    raw = client.generate(build_watch_list_prompt(facts_json), model="gemma-3-4b-it")
    try:
        return json.loads(raw)["items"][:3]
    except Exception:
        return []


def _derive_follow_ups(facts_json: str) -> list[dict]:
    client = get_gemma_client()
    raw = client.generate(build_follow_ups_prompt(facts_json), model="gemma-3-4b-it")
    try:
        return json.loads(raw)["items"]
    except Exception:
        return []


@router.post("/brief", response_model=BriefResponse)
def post_brief(body: BriefFactsIn) -> BriefResponse:
    facts_json = body.model_dump_json()
    facts = body.model_dump()

    # Fill derived cards if caller didn't provide them.
    if not facts["watch_list"]:
        facts["watch_list"] = _derive_watch_list(facts_json)
    if not facts["follow_ups"]:
        facts["follow_ups"] = _derive_follow_ups(facts_json)

    html = _env.get_template("brief.html.jinja").render(**facts)

    token = secrets.token_urlsafe(24)  # ~32 chars
    key = f"brief:{token}"
    get_redis().setex(key, _BRIEF_TTL, html)

    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=_BRIEF_TTL)).isoformat()
    return BriefResponse(url=f"{settings.backend_base_url}/brief/{token}", expires_at=expires_at)


@router.get("/brief/demo", response_class=HTMLResponse)
def get_demo_brief() -> HTMLResponse:
    demo_facts = {
        "patient": {"name": "Riya M.", "age": 42, "sex": "F"},
        "conditions": [{"name": "Type 2 Diabetes", "diagnosed_at": "2022-06-01"},
                       {"name": "Hypertension", "diagnosed_at": "2020-11-01"}],
        "medications": [
            {"name": "Metformin", "dose": "500mg", "active": True,
             "frequency": "twice daily", "timing": "morning, evening", "with_food": True},
            {"name": "Losartan", "dose": "50mg", "active": True,
             "frequency": "once daily", "timing": "morning", "with_food": False},
        ],
        "recent_labs": [
            {"test_name": "HbA1c", "value": 7.4, "unit": "%", "taken_at": "2026-05-01", "trend": "up"},
            {"test_name": "LDL", "value": 122, "unit": "mg/dL", "taken_at": "2026-05-01", "trend": "flat"},
        ],
        "encounters": [{"date": "2026-05-01", "provider": "Dr. Kim", "kind": "visit",
                        "summary": "Diabetes follow-up; discussed adherence."}],
        "watch_list": [
            "Adherence to metformin — HbA1c rose 0.4 pts since Jan.",
            "Any evening episodes of low blood sugar?",
            "Ankle swelling since starting Losartan?",
        ],
        "follow_ups": [
            {"test": "HbA1c", "reason": "q3mo diabetic monitoring", "due_date": "2026-07-15"},
        ],
    }
    html = _env.get_template("brief.html.jinja").render(**demo_facts)
    return HTMLResponse(html)


@router.get("/brief/{token}", response_class=HTMLResponse)
def get_brief(token: str) -> HTMLResponse:
    html = get_redis().get(f"brief:{token}")
    if not html:
        raise HTTPException(status_code=404, detail="Brief expired or not found.")
    return HTMLResponse(html)
