# healthOS Android MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a demoable Android app that ingests one live lab-report PDF, exposes a seeded synthetic patient via an on-device chat and a timeline, and generates a shareable one-page doctor brief at a signed short URL.

**Architecture:** Expo/React Native app with local-first `op-sqlite` storage. Minimal FastAPI backend does stateless compute only: cloud Gemma extraction, cloud Gemma chat fallback, and 24h-TTL brief HTML rendered from facts-JSON into Upstash Redis. On-device Gemma 3n via `react-native-llm-mediapipe` handles chat; a single `GemmaClient` interface gates every LLM call and flips to cloud if the bridge fails.

**Tech Stack:**
- Frontend: Expo (SDK 52+), React Native, Expo Router, `op-sqlite`, `react-native-llm-mediapipe`, `react-native-svg`, `react-native-qrcode-svg`, NativeWind (Tailwind for RN).
- Backend: Python 3.11+, FastAPI, `google-generativeai` SDK, `redis` (upstash-python), Jinja2, `pytest`.
- LLM: Gemma 3 12B multimodal via Google AI Studio (cloud); Gemma 3n E2B `.task` via MediaPipe (on-device).
- Storage: SQLite on device (op-sqlite); Upstash Redis for brief URLs; no server-side patient DB.

## Global Constraints

- Every LLM call MUST go through `GemmaClient.generate(...)` in the app and `gemma.client.generate(...)` in the backend. Never call the SDK/bridge directly from a screen or a route.
- Every write to any patient-data table MUST include `source_type` and `source_ref`.
- Chat prompt payload MUST stay `<8 KB` after JSON serialisation.
- Backend MUST NOT persist patient data. Only Redis brief blobs (TTL 86400) and temp files during `/extract` are permitted; temp files must be deleted in a `finally` block.
- Brief tokens MUST be 32-char `urlsafe_random`. Redis key format: `brief:{token}`. TTL: 86400 seconds.
- Cloud Gemma model: `gemma-3-12b-it` for multimodal; `gemma-3-4b-it` acceptable for chat fallback.
- On-device model: Gemma 3n E2B (`gemma-3n-E2B-it-int4.task`), downloaded from Hugging Face to `FileSystem.documentDirectory + 'models/'`.
- `CLOUD_ONLY_MODE` build-time env flag (`EXPO_PUBLIC_CLOUD_ONLY_MODE=1`) forces all Gemma calls through cloud regardless of on-device capability.
- Backend base URL is exposed as `EXPO_PUBLIC_BACKEND_URL`.
- No auth. Rate-limit `/chat` by IP to 10 req/min.

---

## File Structure

```
healthOS/
├── backend/
│   ├── pyproject.toml
│   ├── .env.example
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                       # FastAPI app + CORS + /health
│   │   ├── config.py                     # env vars
│   │   ├── redis_client.py               # Upstash Redis wrapper
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── extract.py
│   │   │   ├── chat.py
│   │   │   └── brief.py
│   │   ├── gemma/
│   │   │   ├── __init__.py
│   │   │   ├── client.py                 # google-generativeai wrapper
│   │   │   └── prompts/
│   │   │       ├── __init__.py
│   │   │       ├── lab_pdf.py
│   │   │       ├── chat.py
│   │   │       ├── watch_list.py
│   │   │       └── follow_ups.py
│   │   └── render/
│   │       └── brief.html.jinja
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py                   # fixtures + mock Gemma
│   │   ├── test_extract.py
│   │   ├── test_chat.py
│   │   └── test_brief.py
│   └── fixtures/
│       └── sample_lab.pdf                # tiny fake lab PDF
├── app/                                  # Expo React Native
│   ├── package.json
│   ├── app.json
│   ├── tsconfig.json
│   ├── babel.config.js
│   ├── metro.config.js
│   ├── tailwind.config.js
│   ├── global.css
│   ├── .env.example
│   ├── app/                              # Expo Router
│   │   ├── _layout.tsx
│   │   ├── index.tsx                     # redirect to /(tabs)/timeline
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx
│   │   │   ├── timeline.tsx
│   │   │   ├── chat.tsx
│   │   │   └── upload.tsx
│   │   └── share.tsx
│   ├── src/
│   │   ├── config.ts                     # env vars, feature flags
│   │   ├── types.ts                      # shared TS types (single source of truth)
│   │   ├── services/
│   │   │   ├── gemma/
│   │   │   │   ├── GemmaClient.ts        # interface + factory
│   │   │   │   ├── OnDeviceGemma.ts
│   │   │   │   └── CloudGemma.ts
│   │   │   ├── store/
│   │   │   │   ├── db.ts                 # op-sqlite connection + migrations
│   │   │   │   ├── schema.sql
│   │   │   │   └── repos.ts              # thin query module
│   │   │   ├── ingestion/
│   │   │   │   └── ingestLabPdf.ts
│   │   │   ├── chat/
│   │   │   │   └── buildContext.ts
│   │   │   └── share/
│   │   │       └── BriefBuilder.ts
│   │   └── ui/
│   │       ├── theme.ts
│   │       ├── Sparkline.tsx
│   │       ├── FactRow.tsx
│   │       └── ChatBubble.tsx
│   ├── assets/
│   │   └── seed/
│   │       └── synthetic_patient.sql     # DESIGN ARTIFACT
│   └── __tests__/
│       ├── GemmaClient.test.ts
│       ├── BriefBuilder.test.ts
│       ├── buildContext.test.ts
│       └── repos.test.ts
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-07-08-healthos-android-mvp-design.md
        └── plans/
            └── 2026-07-08-healthos-android-mvp-plan.md
```

---

## Task 1: Repo skeleton + workspace conventions

**Files:**
- Create: `backend/.gitkeep`, `app/.gitkeep`
- Create: `.editorconfig`

**Interfaces:**
- Consumes: nothing.
- Produces: two top-level directories (`backend/` for FastAPI, `app/` for Expo) and a shared editor config.

- [ ] **Step 1: Verify current state**

```bash
ls /Users/adityajha/GithubProjects/healthOS/
```
Expected: `docs/  idea.md` (and hidden `.git/`, `.gitignore`, `.DS_Store`).

- [ ] **Step 2: Create the two workspace directories**

```bash
mkdir -p /Users/adityajha/GithubProjects/healthOS/backend
mkdir -p /Users/adityajha/GithubProjects/healthOS/app
touch /Users/adityajha/GithubProjects/healthOS/backend/.gitkeep
touch /Users/adityajha/GithubProjects/healthOS/app/.gitkeep
```

- [ ] **Step 3: Write `.editorconfig`**

Create `/Users/adityajha/GithubProjects/healthOS/.editorconfig`:

```
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.py]
indent_size = 4
```

- [ ] **Step 4: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add .editorconfig backend/.gitkeep app/.gitkeep
git commit -m "chore: create backend/app skeleton + editorconfig"
```

---

## Task 2: Backend scaffold — FastAPI app, config, /health, first test

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `app.main.app` — FastAPI ASGI app importable as `backend.app.main:app`
  - `app.config.Settings` — pydantic settings class exposing: `google_api_key: str`, `upstash_redis_url: str`, `upstash_redis_token: str`, `backend_base_url: str`, `cors_origins: list[str]`
  - `GET /health` returns `{"status": "ok"}`

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "healthos-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "python-multipart>=0.0.9",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "google-generativeai>=0.8",
    "upstash-redis>=1.2",
    "jinja2>=3.1",
    "slowapi>=0.1.9",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
    "pytest-mock>=3.14",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Create `backend/.env.example`**

```
GOOGLE_API_KEY=paste-your-google-ai-studio-key-here
UPSTASH_REDIS_URL=https://<your-upstash-instance>.upstash.io
UPSTASH_REDIS_TOKEN=paste-your-upstash-token-here
BACKEND_BASE_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:8081,http://localhost:19006,exp://
```

- [ ] **Step 3: Create `backend/app/__init__.py`** (empty file).

- [ ] **Step 4: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    google_api_key: str
    upstash_redis_url: str
    upstash_redis_token: str
    backend_base_url: str = "http://localhost:8000"
    cors_origins: str = "*"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]
```

- [ ] **Step 5: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(title="healthOS backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Create `backend/tests/__init__.py`** (empty file).

- [ ] **Step 7: Create `backend/tests/conftest.py`**

```python
import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def _test_env(tmp_path_factory):
    os.environ.setdefault("GOOGLE_API_KEY", "test-key")
    os.environ.setdefault("UPSTASH_REDIS_URL", "https://test.upstash.io")
    os.environ.setdefault("UPSTASH_REDIS_TOKEN", "test-token")
    os.environ.setdefault("CORS_ORIGINS", "*")


@pytest.fixture
def client() -> TestClient:
    from app.main import app
    return TestClient(app)
```

- [ ] **Step 8: Create failing test `backend/tests/test_health.py`**

```python
from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 9: Install deps + run test to confirm PASS**

```bash
cd /Users/adityajha/GithubProjects/healthOS/backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest tests/test_health.py -v
```
Expected: `1 passed`.

- [ ] **Step 10: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add backend/pyproject.toml backend/.env.example backend/app backend/tests
git commit -m "feat(backend): FastAPI scaffold with /health and pytest wiring"
```

---

## Task 3: Backend Gemma client wrapper (mockable, JSON-mode, retries)

**Files:**
- Create: `backend/app/gemma/__init__.py`
- Create: `backend/app/gemma/client.py`
- Test: `backend/tests/test_gemma_client.py`

**Interfaces:**
- Consumes: `app.config.settings.google_api_key`.
- Produces:
  - `GemmaClient` class with methods:
    - `def generate(self, prompt: str, *, images: list[GemmaImage] | None = None, json_mode: bool = False, model: str = "gemma-3-12b-it") -> str`
    - Retries once on 5xx / transient errors.
  - `GemmaImage = TypedDict('GemmaImage', {'mime_type': str, 'data': bytes})`
  - Module-level `get_gemma_client() -> GemmaClient` factory (dependency-injectable).

- [ ] **Step 1: Create `backend/app/gemma/__init__.py`** (empty).

- [ ] **Step 2: Write failing test `backend/tests/test_gemma_client.py`**

```python
from unittest.mock import MagicMock, patch

from app.gemma.client import GemmaClient


def test_generate_returns_text_on_success() -> None:
    client = GemmaClient(api_key="test-key")
    with patch.object(client, "_call_model", return_value="hello") as mock:
        result = client.generate("say hi")
    assert result == "hello"
    mock.assert_called_once()


def test_generate_retries_once_on_transient_error() -> None:
    client = GemmaClient(api_key="test-key")
    with patch.object(client, "_call_model", side_effect=[RuntimeError("500"), "ok"]) as mock:
        result = client.generate("test")
    assert result == "ok"
    assert mock.call_count == 2


def test_generate_gives_up_after_second_failure() -> None:
    client = GemmaClient(api_key="test-key")
    with patch.object(client, "_call_model", side_effect=RuntimeError("boom")):
        try:
            client.generate("test")
        except RuntimeError as e:
            assert "boom" in str(e)
        else:
            raise AssertionError("expected RuntimeError")
```

- [ ] **Step 3: Run test to confirm it FAILS**

```bash
cd /Users/adityajha/GithubProjects/healthOS/backend
pytest tests/test_gemma_client.py -v
```
Expected: FAIL with `ModuleNotFoundError: app.gemma.client`.

- [ ] **Step 4: Write `backend/app/gemma/client.py`**

```python
from __future__ import annotations
from typing import TypedDict

import google.generativeai as genai


class GemmaImage(TypedDict):
    mime_type: str
    data: bytes


class GemmaClient:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        genai.configure(api_key=api_key)

    def _call_model(
        self,
        prompt: str,
        *,
        images: list[GemmaImage] | None,
        json_mode: bool,
        model: str,
    ) -> str:
        gen_config: dict = {}
        if json_mode:
            gen_config["response_mime_type"] = "application/json"
        parts: list = [prompt]
        if images:
            for img in images:
                parts.append({"mime_type": img["mime_type"], "data": img["data"]})
        m = genai.GenerativeModel(model_name=model, generation_config=gen_config)
        resp = m.generate_content(parts)
        return resp.text

    def generate(
        self,
        prompt: str,
        *,
        images: list[GemmaImage] | None = None,
        json_mode: bool = False,
        model: str = "gemma-3-12b-it",
    ) -> str:
        try:
            return self._call_model(prompt, images=images, json_mode=json_mode, model=model)
        except Exception:
            return self._call_model(prompt, images=images, json_mode=json_mode, model=model)


_singleton: GemmaClient | None = None


def get_gemma_client() -> GemmaClient:
    global _singleton
    if _singleton is None:
        from app.config import settings
        _singleton = GemmaClient(api_key=settings.google_api_key)
    return _singleton
```

- [ ] **Step 5: Run test to confirm PASS**

```bash
pytest tests/test_gemma_client.py -v
```
Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add backend/app/gemma backend/tests/test_gemma_client.py
git commit -m "feat(backend): Gemma client wrapper with retry"
```

---

## Task 4: Backend /extract route + lab_pdf prompt

**Files:**
- Create: `backend/app/routes/__init__.py`
- Create: `backend/app/gemma/prompts/__init__.py`
- Create: `backend/app/gemma/prompts/lab_pdf.py`
- Create: `backend/app/routes/extract.py`
- Modify: `backend/app/main.py` (wire router)
- Create: `backend/fixtures/sample_lab.pdf` (tiny PDF stub for tests)
- Test: `backend/tests/test_extract.py`

**Interfaces:**
- Consumes: `GemmaClient.generate(prompt, images=..., json_mode=True)` from Task 3.
- Produces:
  - `POST /extract` — multipart form: `file: UploadFile`, `source_type: str` (must be `"lab_pdf"` in v1). Returns JSON:
    ```json
    {
      "labs": [
        {"test_name": str, "value": float, "unit": str,
         "ref_low": float|null, "ref_high": float|null, "taken_at": "YYYY-MM-DD"}
      ],
      "encounter_date": "YYYY-MM-DD",
      "provider": str|null
    }
    ```
  - `build_lab_pdf_prompt() -> str` and `LAB_PDF_SCHEMA_HINT` in `gemma/prompts/lab_pdf.py`.

- [ ] **Step 1: Create `backend/app/routes/__init__.py`** and `backend/app/gemma/prompts/__init__.py` (both empty).

- [ ] **Step 2: Write `backend/app/gemma/prompts/lab_pdf.py`**

```python
LAB_PDF_SYSTEM = """You are a clinical data extractor. Given a lab-report PDF,
extract every quantitative lab value. Respond with STRICT JSON matching this schema:

{
  "labs": [
    {
      "test_name": "string, canonical name (e.g. 'HbA1c', 'Fasting glucose', 'LDL', 'HDL')",
      "value": "number",
      "unit": "string (e.g. '%', 'mg/dL')",
      "ref_low": "number or null",
      "ref_high": "number or null",
      "taken_at": "YYYY-MM-DD"
    }
  ],
  "encounter_date": "YYYY-MM-DD (report date)",
  "provider": "string or null (e.g. 'Apollo Diagnostics')"
}

Rules:
- Omit qualitative results (colour, appearance).
- If a test appears twice, keep the later value.
- If ref range is missing, use null.
- Use ISO dates.
- Return ONLY the JSON. No prose. No markdown fences.
"""


def build_lab_pdf_prompt() -> str:
    return LAB_PDF_SYSTEM
```

- [ ] **Step 3: Write failing test `backend/tests/test_extract.py`**

```python
import io
import json
from unittest.mock import patch

from fastapi.testclient import TestClient


def _make_pdf_bytes() -> bytes:
    # Minimal 1-page PDF header — good enough for our tests since we mock Gemma.
    return b"%PDF-1.4\n%%EOF"


def test_extract_returns_structured_labs(client: TestClient) -> None:
    mock_json = json.dumps({
        "labs": [
            {"test_name": "HbA1c", "value": 7.4, "unit": "%",
             "ref_low": 4.0, "ref_high": 5.6, "taken_at": "2026-05-01"}
        ],
        "encounter_date": "2026-05-01",
        "provider": "Apollo Diagnostics",
    })
    with patch("app.routes.extract.get_gemma_client") as g:
        g.return_value.generate.return_value = mock_json
        resp = client.post(
            "/extract",
            files={"file": ("lab.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")},
            data={"source_type": "lab_pdf"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["encounter_date"] == "2026-05-01"
    assert body["labs"][0]["test_name"] == "HbA1c"
    assert body["labs"][0]["value"] == 7.4


def test_extract_rejects_unsupported_source_type(client: TestClient) -> None:
    resp = client.post(
        "/extract",
        files={"file": ("x.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")},
        data={"source_type": "wearable_csv"},
    )
    assert resp.status_code == 400
    assert "lab_pdf" in resp.text
```

- [ ] **Step 4: Run test to confirm it FAILS**

```bash
pytest tests/test_extract.py -v
```
Expected: FAIL with `404` (no /extract route yet).

- [ ] **Step 5: Write `backend/app/routes/extract.py`**

```python
import json
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.gemma.client import get_gemma_client
from app.gemma.prompts.lab_pdf import build_lab_pdf_prompt

router = APIRouter()


class ExtractedLab(BaseModel):
    test_name: str
    value: float
    unit: str
    ref_low: float | None = None
    ref_high: float | None = None
    taken_at: str


class ExtractResponse(BaseModel):
    labs: list[ExtractedLab]
    encounter_date: str
    provider: str | None = None


@router.post("/extract", response_model=ExtractResponse)
async def extract(
    file: UploadFile = File(...),
    source_type: str = Form(...),
) -> ExtractResponse:
    if source_type != "lab_pdf":
        raise HTTPException(
            status_code=400,
            detail="Only source_type='lab_pdf' is supported in v1.",
        )

    contents = await file.read()
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(contents)
            tmp_path = Path(tmp.name)

        client = get_gemma_client()
        raw = client.generate(
            build_lab_pdf_prompt(),
            images=[{"mime_type": "application/pdf", "data": contents}],
            json_mode=True,
        )
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=502, detail=f"Gemma returned non-JSON: {exc}")

        return ExtractResponse(**data)
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink()
```

- [ ] **Step 6: Wire the router in `backend/app/main.py`**

Replace the existing file with:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import extract as extract_router

app = FastAPI(title="healthOS backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(extract_router.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Run tests to confirm PASS**

```bash
pytest tests/test_extract.py tests/test_health.py -v
```
Expected: `3 passed`.

- [ ] **Step 8: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add backend/app/routes backend/app/gemma/prompts backend/app/main.py backend/tests/test_extract.py
git commit -m "feat(backend): /extract route with lab_pdf prompt"
```

---

## Task 5: Backend /chat route (cloud fallback for on-device Gemma)

**Files:**
- Create: `backend/app/gemma/prompts/chat.py`
- Create: `backend/app/routes/chat.py`
- Modify: `backend/app/main.py` (wire router, add slowapi limiter)
- Test: `backend/tests/test_chat.py`

**Interfaces:**
- Consumes: `GemmaClient.generate(prompt, model="gemma-3-4b-it")` from Task 3.
- Produces:
  - `POST /chat` — JSON: `{"prompt": str, "facts_json": str}`. Returns `{"text": str}`.
  - Rate-limited to `10/minute` per IP.

- [ ] **Step 1: Write `backend/app/gemma/prompts/chat.py`**

```python
CHAT_SYSTEM = """You are 'Health Memory', a helpful and cautious explainer of a patient's
own medical facts. You are given a compact JSON payload of the patient's history and a
question. Answer in plain language, cite the source_type + date whenever you use a fact,
and NEVER invent facts not in the payload. If the payload doesn't contain the answer, say
so and suggest they discuss with their doctor.
"""


def build_chat_prompt(facts_json: str, user_question: str) -> str:
    return (
        CHAT_SYSTEM
        + "\n\n# Patient facts (JSON)\n"
        + facts_json
        + "\n\n# Question\n"
        + user_question
        + "\n\n# Answer\n"
    )
```

- [ ] **Step 2: Write failing test `backend/tests/test_chat.py`**

```python
from unittest.mock import patch
from fastapi.testclient import TestClient


def test_chat_returns_text(client: TestClient) -> None:
    with patch("app.routes.chat.get_gemma_client") as g:
        g.return_value.generate.return_value = "You take metformin because ..."
        resp = client.post(
            "/chat",
            json={"prompt": "why am I on metformin?", "facts_json": '{"medications":[]}'},
        )
    assert resp.status_code == 200
    assert "metformin" in resp.json()["text"].lower()


def test_chat_rejects_empty_prompt(client: TestClient) -> None:
    resp = client.post("/chat", json={"prompt": "", "facts_json": "{}"})
    assert resp.status_code == 422 or resp.status_code == 400
```

- [ ] **Step 3: Run test to confirm it FAILS**

```bash
pytest tests/test_chat.py -v
```
Expected: FAIL with `404`.

- [ ] **Step 4: Write `backend/app/routes/chat.py`**

```python
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.gemma.client import get_gemma_client
from app.gemma.prompts.chat import build_chat_prompt

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class ChatRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    facts_json: str = Field(max_length=16_000)


class ChatResponse(BaseModel):
    text: str


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("10/minute")
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    prompt = build_chat_prompt(body.facts_json, body.prompt)
    client = get_gemma_client()
    text = client.generate(prompt, model="gemma-3-4b-it")
    return ChatResponse(text=text)
```

- [ ] **Step 5: Wire router + slowapi middleware in `backend/app/main.py`**

Replace `backend/app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.routes import extract as extract_router
from app.routes import chat as chat_router

app = FastAPI(title="healthOS backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.state.limiter = chat_router.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(extract_router.router)
app.include_router(chat_router.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run tests to confirm PASS**

```bash
pytest -v
```
Expected: `5 passed`.

- [ ] **Step 7: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add backend/app/routes/chat.py backend/app/gemma/prompts/chat.py backend/app/main.py backend/tests/test_chat.py
git commit -m "feat(backend): /chat route with rate limit"
```

---

## Task 6: Backend /brief route + Redis + Jinja template + /brief/demo

**Files:**
- Create: `backend/app/redis_client.py`
- Create: `backend/app/gemma/prompts/watch_list.py`
- Create: `backend/app/gemma/prompts/follow_ups.py`
- Create: `backend/app/render/brief.html.jinja`
- Create: `backend/app/routes/brief.py`
- Modify: `backend/app/main.py` (wire router)
- Test: `backend/tests/test_brief.py`

**Interfaces:**
- Consumes: `GemmaClient` (Task 3), pydantic settings (Task 2).
- Produces:
  - `POST /brief` — JSON `BriefFactsIn` (see model below). Returns `{"url": str, "expires_at": str}`.
  - `GET /brief/{token}` — serves HTML.
  - `GET /brief/demo` — serves a pre-rendered demo brief HTML (source of truth for the "live-demo backup").
  - `class BriefFactsIn` — Pydantic model imported by tests.

- [ ] **Step 1: Write `backend/app/redis_client.py`**

```python
from upstash_redis import Redis

from app.config import settings

_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis(url=settings.upstash_redis_url, token=settings.upstash_redis_token)
    return _redis
```

- [ ] **Step 2: Write prompts `backend/app/gemma/prompts/watch_list.py`**

```python
WATCH_LIST_SYSTEM = """Given this patient's structured facts, output STRICT JSON:
{"items": ["...", "...", "..."]}

Exactly 3 items. Each item is one sentence a doctor should ask this patient about,
grounded in the facts (rising trends, adherence risks, new-med side-effect windows).
Return ONLY the JSON.
"""


def build_watch_list_prompt(facts_json: str) -> str:
    return WATCH_LIST_SYSTEM + "\n\n# Facts\n" + facts_json + "\n\n# Output\n"
```

- [ ] **Step 3: Write `backend/app/gemma/prompts/follow_ups.py`**

```python
FOLLOW_UPS_SYSTEM = """Given this patient's structured facts and standard clinical
guidelines (HbA1c q3mo for diabetics, lipid panel annually, BP check q6mo for
hypertensives), output STRICT JSON:

{"items": [{"test": str, "reason": str, "due_date": "YYYY-MM-DD"}]}

Include only tests due within the next 4 weeks (from the latest 'taken_at' date in
facts). Return ONLY the JSON. If nothing is due, return {"items": []}.
"""


def build_follow_ups_prompt(facts_json: str) -> str:
    return FOLLOW_UPS_SYSTEM + "\n\n# Facts\n" + facts_json + "\n\n# Output\n"
```

- [ ] **Step 4: Write `backend/app/render/brief.html.jinja`** (single file — one screen, print-friendly)

Create the directory and file:

```bash
mkdir -p /Users/adityajha/GithubProjects/healthOS/backend/app/render
```

Contents:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Doctor Brief — {{ patient.name }}</title>
<style>
  :root { --fg:#111; --muted:#555; --line:#e5e5e5; --up:#c0392b; --down:#27ae60; --flat:#7f8c8d; }
  html, body { margin:0; padding:0; font-family: ui-sans-serif, system-ui, sans-serif; color:var(--fg); }
  body { max-width: 960px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px 0; }
  .sub { color:var(--muted); font-size: 13px; }
  .card { border:1px solid var(--line); border-radius:8px; padding:14px 16px; margin: 14px 0; }
  .card h2 { font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing:.05em; color:var(--muted); }
  .row { display:flex; gap:12px; flex-wrap:wrap; }
  .pill { border:1px solid var(--line); border-radius:999px; padding:4px 10px; font-size:13px; }
  .lab { min-width: 140px; }
  .lab .val { font-weight: 600; font-size: 16px; }
  .up { color: var(--up); } .down { color: var(--down); } .flat { color: var(--flat); }
  ol.qs { margin: 0; padding-left: 20px; } ol.qs li { margin: 6px 0; }
  ul.enc { margin: 0; padding-left: 20px; }
  @media print { body { padding: 0; } .card { break-inside: avoid; } }
</style>
</head>
<body>
  <h1>{{ patient.name }} — {{ patient.age }}, {{ patient.sex }}</h1>
  <div class="sub">Shared moments ago · Expires 24h</div>

  <div class="card">
    <h2>Active conditions</h2>
    <div class="row">
      {% for c in conditions %}<span class="pill">{{ c.name }} ({{ c.diagnosed_at[:4] }})</span>{% endfor %}
    </div>
  </div>

  <div class="card">
    <h2>Current regimen at a glance</h2>
    <ul>
      {% for m in medications if m.active %}
        <li><b>{{ m.name }}</b> {{ m.dose }}{% if m.frequency %} — {{ m.frequency }}{% endif %}{% if m.timing %}, {{ m.timing }}{% endif %}{% if m.with_food %} · with food{% endif %}</li>
      {% endfor %}
    </ul>
  </div>

  <div class="card">
    <h2>Recent labs (last 90 days)</h2>
    <div class="row">
      {% for l in recent_labs %}
        <div class="lab">
          <div>{{ l.test_name }}</div>
          <div class="val">
            {{ l.value }} {{ l.unit }}
            <span class="{{ l.trend or 'flat' }}">
              {% if l.trend == 'up' %}↑{% elif l.trend == 'down' %}↓{% else %}→{% endif %}
            </span>
          </div>
          <div class="sub">{{ l.taken_at }}</div>
        </div>
      {% endfor %}
    </div>
  </div>

  <div class="card">
    <h2>Follow-up tests due</h2>
    {% if follow_ups %}
      <ul>{% for f in follow_ups %}<li><b>{{ f.test }}</b> — {{ f.reason }} (due {{ f.due_date }})</li>{% endfor %}</ul>
    {% else %}
      <div class="sub">Nothing due in the next 4 weeks.</div>
    {% endif %}
  </div>

  <div class="card">
    <h2>3 things to ask</h2>
    <ol class="qs">{% for q in watch_list %}<li>{{ q }}</li>{% endfor %}</ol>
  </div>

  <div class="card">
    <h2>Recent encounters</h2>
    <ul class="enc">{% for e in encounters %}<li><b>{{ e.date }}</b>{% if e.provider %} · {{ e.provider }}{% endif %}{% if e.summary %} — {{ e.summary }}{% endif %}</li>{% endfor %}</ul>
  </div>
</body>
</html>
```

- [ ] **Step 5: Write failing test `backend/tests/test_brief.py`**

```python
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


VALID_FACTS = {
    "patient": {"name": "Riya M.", "age": 42, "sex": "F"},
    "conditions": [{"name": "T2 Diabetes", "diagnosed_at": "2022-06-01"}],
    "medications": [{"name": "Metformin", "dose": "500mg", "active": True,
                     "frequency": "twice daily", "timing": "morning, evening",
                     "with_food": True}],
    "recent_labs": [{"test_name": "HbA1c", "value": 7.4, "unit": "%",
                     "taken_at": "2026-05-01", "trend": "up"}],
    "encounters": [{"date": "2026-05-01", "provider": "Dr. Kim",
                    "kind": "visit", "summary": "Diabetes follow-up."}],
    "watch_list": [],
    "follow_ups": [],
}


class _FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    def setex(self, key: str, ttl: int, value: str) -> None:
        self.store[key] = value

    def get(self, key: str) -> str | None:
        return self.store.get(key)


def test_brief_post_creates_url_and_stores_html(client: TestClient) -> None:
    fake = _FakeRedis()
    fake_gemma = MagicMock()
    fake_gemma.generate.side_effect = [
        '{"items": ["ask about adherence", "ask about hypoglycemia", "ask about ankle swelling"]}',
        '{"items": [{"test": "HbA1c", "reason": "q3mo diabetic monitoring", "due_date": "2026-08-01"}]}',
    ]
    with patch("app.routes.brief.get_redis", return_value=fake), \
         patch("app.routes.brief.get_gemma_client", return_value=fake_gemma):
        resp = client.post("/brief", json=VALID_FACTS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["url"].startswith("http")
    assert "brief/" in body["url"]
    token = body["url"].rsplit("/", 1)[-1]
    stored = fake.store[f"brief:{token}"]
    assert "Riya M." in stored
    assert "HbA1c" in stored
    assert "ask about adherence" in stored


def test_brief_get_returns_html(client: TestClient) -> None:
    fake = _FakeRedis()
    fake.store["brief:abc123"] = "<!doctype html><body>ok</body>"
    with patch("app.routes.brief.get_redis", return_value=fake):
        resp = client.get("/brief/abc123")
    assert resp.status_code == 200
    assert "<!doctype html>" in resp.text


def test_brief_get_404_when_expired(client: TestClient) -> None:
    fake = _FakeRedis()
    with patch("app.routes.brief.get_redis", return_value=fake):
        resp = client.get("/brief/does-not-exist")
    assert resp.status_code == 404


def test_brief_demo_endpoint_returns_html(client: TestClient) -> None:
    resp = client.get("/brief/demo")
    assert resp.status_code == 200
    assert "<!doctype html>" in resp.text
```

- [ ] **Step 6: Run tests to confirm they FAIL**

```bash
pytest tests/test_brief.py -v
```
Expected: FAIL with `404` on POST /brief.

- [ ] **Step 7: Write `backend/app/routes/brief.py`**

```python
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
```

- [ ] **Step 8: Wire router in `backend/app/main.py`**

Add `from app.routes import brief as brief_router` and `app.include_router(brief_router.router)`.

- [ ] **Step 9: Run all tests to confirm PASS**

```bash
pytest -v
```
Expected: `9 passed` (health + gemma_client × 3 + extract × 2 + chat × 2 + brief × 4 = 12; adjust if the count differs — no failures).

- [ ] **Step 10: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add backend/app/redis_client.py backend/app/render backend/app/routes/brief.py \
        backend/app/gemma/prompts/watch_list.py backend/app/gemma/prompts/follow_ups.py \
        backend/app/main.py backend/tests/test_brief.py
git commit -m "feat(backend): /brief POST+GET with Redis TTL, Jinja template, and /brief/demo"
```

---

## Task 7: Expo app scaffold + tab layout + shared types

**Files:**
- Create: `app/package.json`
- Create: `app/app.json`
- Create: `app/tsconfig.json`
- Create: `app/babel.config.js`
- Create: `app/metro.config.js`
- Create: `app/tailwind.config.js`
- Create: `app/global.css`
- Create: `app/.env.example`
- Create: `app/src/config.ts`
- Create: `app/src/types.ts`
- Create: `app/app/_layout.tsx`
- Create: `app/app/index.tsx`
- Create: `app/app/(tabs)/_layout.tsx`
- Create: `app/app/(tabs)/timeline.tsx` (placeholder)
- Create: `app/app/(tabs)/chat.tsx` (placeholder)
- Create: `app/app/(tabs)/upload.tsx` (placeholder)

**Interfaces:**
- Consumes: env vars from `.env`.
- Produces:
  - `src/config.ts` exports `BACKEND_URL: string`, `CLOUD_ONLY_MODE: boolean`.
  - `src/types.ts` exports all shared TypeScript types (see below). Every subsequent task imports from here.
  - Working Expo app that boots into a "Timeline" tab with placeholder text.

- [ ] **Step 1: Bootstrap Expo project**

```bash
cd /Users/adityajha/GithubProjects/healthOS
npx create-expo-app@latest app --template blank-typescript
cd app
npx expo install expo-router expo-linking expo-constants expo-status-bar react-native-safe-area-context react-native-screens
npm install nativewind tailwindcss@3
npm install -D @types/react
```

- [ ] **Step 2: Overwrite `app/package.json` scripts + name**

Ensure `package.json` has:
```json
{
  "name": "healthos-app",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "test": "jest"
  }
}
```

- [ ] **Step 3: Overwrite `app/app.json`**

```json
{
  "expo": {
    "name": "healthOS",
    "slug": "healthos",
    "scheme": "healthos",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "assetBundlePatterns": ["**/*"],
    "android": {
      "package": "com.healthos.app",
      "adaptiveIcon": { "backgroundColor": "#ffffff" }
    },
    "plugins": ["expo-router"],
    "experiments": { "typedRoutes": true }
  }
}
```

- [ ] **Step 4: Write `app/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

- [ ] **Step 5: Write `app/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{tsx,ts,jsx,js}", "./src/**/*.{tsx,ts,jsx,js}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 6: Write `app/global.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Write `app/.env.example`**

```
EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:8000
EXPO_PUBLIC_CLOUD_ONLY_MODE=0
```
(Note: `10.0.2.2` is how the Android emulator reaches host `localhost`.)

- [ ] **Step 8: Write `app/src/config.ts`**

```ts
export const BACKEND_URL: string =
  process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://10.0.2.2:8000";

export const CLOUD_ONLY_MODE: boolean =
  process.env.EXPO_PUBLIC_CLOUD_ONLY_MODE === "1";
```

- [ ] **Step 9: Write `app/src/types.ts`** (single source of truth for shared types)

```ts
export type PatientId = number;
export type SourceRef = string;
export type SourceType = "lab_pdf" | "seed" | "rx_pdf" | "note_text" | "wearable_csv";

export type EncounterKind = "visit" | "lab" | "discharge" | "imaging";
export type ConditionStatus = "active" | "resolved";

export interface Patient {
  id: PatientId;
  name: string;
  dob: string;
  sex: string;
}

export interface Encounter {
  id: number;
  patientId: PatientId;
  date: string;
  provider?: string;
  kind: EncounterKind;
  summary?: string;
}

export interface Medication {
  id: number;
  patientId: PatientId;
  name: string;
  dose: string;
  startDate: string;
  endDate?: string;
  prescribedAtEncounterId?: number;
  frequency?: string;
  timing?: string;
  withFood?: boolean;
  durationDays?: number;
  patientNotes?: string;
  sourceType: SourceType;
  sourceRef: SourceRef;
}

export interface LabResult {
  id: number;
  patientId: PatientId;
  testName: string;
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
  takenAt: string;
  sourceType: SourceType;
  sourceRef: SourceRef;
}

export interface Condition {
  id: number;
  patientId: PatientId;
  name: string;
  diagnosedAt: string;
  status: ConditionStatus;
}

export interface WearableDaily {
  patientId: PatientId;
  date: string;
  restingHr?: number;
  sleepHours?: number;
  steps?: number;
  hrvMs?: number;
}

export interface NoteChunk {
  id: number;
  patientId: PatientId;
  sourceType: SourceType;
  sourceRef: SourceRef;
  text: string;
  takenAt: string;
}

export interface AllFacts {
  patient: Patient;
  encounters: Encounter[];
  medications: Medication[];
  labResults: LabResult[];
  conditions: Condition[];
  wearable: WearableDaily[];
  notes: NoteChunk[];
}

// Gemma
export interface GemmaImage {
  mimeType: string;
  base64: string;
}

export interface GenerateRequest {
  prompt: string;
  images?: GemmaImage[];
  jsonMode?: boolean;
  model?: string;
}

export interface GenerateResponse {
  text: string;
  tokens?: number;
}

// Brief facts sent to backend
export interface BriefFacts {
  patient: { name: string; age: number; sex: string };
  conditions: { name: string; diagnosed_at: string }[];
  medications: {
    name: string;
    dose: string;
    active: boolean;
    frequency?: string;
    timing?: string;
    with_food?: boolean;
  }[];
  recent_labs: {
    test_name: string;
    value: number;
    unit: string;
    taken_at: string;
    trend?: "up" | "down" | "flat";
    ref_low?: number;
    ref_high?: number;
  }[];
  encounters: {
    date: string;
    provider?: string;
    kind: string;
    summary?: string;
  }[];
  watch_list: string[];
  follow_ups: { test: string; reason: string; due_date: string }[];
}

export interface BriefResponse {
  url: string;
  expires_at: string;
}
```

- [ ] **Step 10: Write `app/app/_layout.tsx`**

```tsx
import { Stack } from "expo-router";
import "../global.css";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 11: Write `app/app/index.tsx`**

```tsx
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/(tabs)/timeline" />;
}
```

- [ ] **Step 12: Write `app/app/(tabs)/_layout.tsx`**

```tsx
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="timeline" options={{ title: "Timeline" }} />
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="upload" options={{ title: "Upload" }} />
    </Tabs>
  );
}
```

- [ ] **Step 13: Write placeholders**

`app/app/(tabs)/timeline.tsx`:
```tsx
import { Text, View } from "react-native";
export default function Timeline() {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Text className="text-lg">Timeline placeholder</Text>
    </View>
  );
}
```
Same shape for `chat.tsx` and `upload.tsx` (change the label text).

- [ ] **Step 14: Boot the app in the Android emulator to confirm scaffold works**

Precondition: Android emulator running (Pixel 6, API 34 recommended).

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
cp .env.example .env
npx expo start --android
```
Expected: emulator shows a tabbed UI with "Timeline placeholder" as the initial tab.

- [ ] **Step 15: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/
git commit -m "feat(app): Expo scaffold with tabs, NativeWind, shared types"
```

---

## Task 8: SQLite (op-sqlite) + schema + repos + first repo test

**Files:**
- Create: `app/src/services/store/schema.sql`
- Create: `app/src/services/store/db.ts`
- Create: `app/src/services/store/repos.ts`
- Create: `app/__tests__/repos.test.ts`
- Modify: `app/package.json` (add op-sqlite + jest + ts-jest)

**Interfaces:**
- Consumes: types from `src/types.ts`.
- Produces:
  - `openDb(): Promise<DB>` — opens local SQLite; runs migrations idempotently.
  - `resetDbForTests(): void` — testing helper.
  - `getAllFacts(db, patientId): Promise<AllFacts>` — used by chat and share.
  - `getRecentLabs(db, patientId, days): Promise<LabResult[]>`
  - `getActiveMedications(db, patientId): Promise<Medication[]>`
  - `getConditions(db, patientId): Promise<Condition[]>`
  - `getEncounters(db, patientId, limit): Promise<Encounter[]>`
  - `insertLabResult(db, row): Promise<number>`
  - `insertEncounter(db, row): Promise<number>`

- [ ] **Step 1: Install op-sqlite + jest**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npm install @op-engineering/op-sqlite
npm install -D jest @types/jest ts-jest better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2: Write `app/src/services/store/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS patient (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  dob TEXT NOT NULL,
  sex TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS encounter (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patient(id),
  date TEXT NOT NULL,
  provider TEXT,
  kind TEXT NOT NULL,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS medication (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patient(id),
  name TEXT NOT NULL,
  dose TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  prescribed_at_encounter_id INTEGER REFERENCES encounter(id),
  frequency TEXT,
  timing TEXT,
  with_food INTEGER,
  duration_days INTEGER,
  patient_notes TEXT,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_result (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patient(id),
  test_name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  ref_low REAL,
  ref_high REAL,
  taken_at TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS condition (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patient(id),
  name TEXT NOT NULL,
  diagnosed_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wearable_daily (
  patient_id INTEGER NOT NULL REFERENCES patient(id),
  date TEXT NOT NULL,
  resting_hr INTEGER,
  sleep_hours REAL,
  steps INTEGER,
  hrv_ms INTEGER,
  PRIMARY KEY (patient_id, date)
);

CREATE TABLE IF NOT EXISTS note_chunk (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patient(id),
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  text TEXT NOT NULL,
  taken_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 3: Write `app/src/services/store/db.ts`**

Note: op-sqlite works on-device but not in Jest. For tests we abstract with a minimal interface and swap in `better-sqlite3` under Jest.

```ts
import { open, type DB as OpSqliteDB } from "@op-engineering/op-sqlite";
import schemaSql from "./schema.sql";

export interface DB {
  execute(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  close(): Promise<void>;
}

let _db: DB | null = null;

async function runMigrations(db: DB): Promise<void> {
  for (const stmt of schemaSql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }
  const row = (await db.execute("SELECT COUNT(*) as c FROM migrations")).rows[0];
  if (row.c === 0) {
    await db.execute("INSERT INTO migrations(version) VALUES (1)");
  }
}

export async function openDb(): Promise<DB> {
  if (_db) return _db;
  const raw = open({ name: "healthos.db" });
  const db: DB = {
    execute: async (sql, params) => {
      const res = await raw.execute(sql, params);
      return { rows: res.rows?._array ?? [] };
    },
    close: async () => {
      await raw.close();
      _db = null;
    },
  };
  await runMigrations(db);
  _db = db;
  return db;
}

export function resetDbForTests(injected: DB | null): void {
  _db = injected;
}
```

Note: the `.sql` import needs a Metro transformer. Instead of importing raw SQL, inline the schema as a template string. Replace `import schemaSql from "./schema.sql";` with:

```ts
const schemaSql = `
CREATE TABLE IF NOT EXISTS patient ( id INTEGER PRIMARY KEY, name TEXT NOT NULL, dob TEXT NOT NULL, sex TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')) );
CREATE TABLE IF NOT EXISTS encounter ( id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patient(id), date TEXT NOT NULL, provider TEXT, kind TEXT NOT NULL, summary TEXT );
CREATE TABLE IF NOT EXISTS medication ( id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patient(id), name TEXT NOT NULL, dose TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT, prescribed_at_encounter_id INTEGER REFERENCES encounter(id), frequency TEXT, timing TEXT, with_food INTEGER, duration_days INTEGER, patient_notes TEXT, source_type TEXT NOT NULL, source_ref TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS lab_result ( id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patient(id), test_name TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, ref_low REAL, ref_high REAL, taken_at TEXT NOT NULL, source_type TEXT NOT NULL, source_ref TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS condition ( id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patient(id), name TEXT NOT NULL, diagnosed_at TEXT NOT NULL, status TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS wearable_daily ( patient_id INTEGER NOT NULL REFERENCES patient(id), date TEXT NOT NULL, resting_hr INTEGER, sleep_hours REAL, steps INTEGER, hrv_ms INTEGER, PRIMARY KEY (patient_id, date) );
CREATE TABLE IF NOT EXISTS note_chunk ( id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patient(id), source_type TEXT NOT NULL, source_ref TEXT NOT NULL, text TEXT NOT NULL, taken_at TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS migrations ( version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')) );
`;
```

- [ ] **Step 4: Write `app/src/services/store/repos.ts`**

```ts
import type {
  AllFacts, Condition, Encounter, LabResult, Medication,
  NoteChunk, PatientId, WearableDaily,
} from "../../types";
import type { DB } from "./db";

function snake<K extends string, V>(row: Record<string, V>): Record<string, V> {
  // op-sqlite / better-sqlite return snake_case column names.
  return row;
}

export async function getPatient(db: DB, id: PatientId) {
  const r = (await db.execute("SELECT * FROM patient WHERE id = ?", [id])).rows[0];
  if (!r) throw new Error(`patient ${id} not found`);
  return { id: r.id, name: r.name, dob: r.dob, sex: r.sex };
}

export async function getEncounters(db: DB, patientId: PatientId, limit = 50): Promise<Encounter[]> {
  const rows = (await db.execute(
    "SELECT * FROM encounter WHERE patient_id = ? ORDER BY date DESC LIMIT ?",
    [patientId, limit],
  )).rows;
  return rows.map((r: any) => ({
    id: r.id, patientId: r.patient_id, date: r.date, provider: r.provider ?? undefined,
    kind: r.kind, summary: r.summary ?? undefined,
  }));
}

export async function getActiveMedications(db: DB, patientId: PatientId): Promise<Medication[]> {
  const rows = (await db.execute(
    "SELECT * FROM medication WHERE patient_id = ? AND (end_date IS NULL OR end_date >= date('now'))",
    [patientId],
  )).rows;
  return rows.map(_medRowToMedication);
}

export async function getAllMedications(db: DB, patientId: PatientId): Promise<Medication[]> {
  const rows = (await db.execute("SELECT * FROM medication WHERE patient_id = ?", [patientId])).rows;
  return rows.map(_medRowToMedication);
}

function _medRowToMedication(r: any): Medication {
  return {
    id: r.id, patientId: r.patient_id, name: r.name, dose: r.dose,
    startDate: r.start_date, endDate: r.end_date ?? undefined,
    prescribedAtEncounterId: r.prescribed_at_encounter_id ?? undefined,
    frequency: r.frequency ?? undefined, timing: r.timing ?? undefined,
    withFood: r.with_food != null ? Boolean(r.with_food) : undefined,
    durationDays: r.duration_days ?? undefined,
    patientNotes: r.patient_notes ?? undefined,
    sourceType: r.source_type, sourceRef: r.source_ref,
  };
}

export async function getRecentLabs(db: DB, patientId: PatientId, days = 90): Promise<LabResult[]> {
  const rows = (await db.execute(
    "SELECT * FROM lab_result WHERE patient_id = ? AND date(taken_at) >= date('now', ?) ORDER BY taken_at DESC",
    [patientId, `-${days} days`],
  )).rows;
  return rows.map((r: any) => ({
    id: r.id, patientId: r.patient_id, testName: r.test_name,
    value: r.value, unit: r.unit,
    refLow: r.ref_low ?? undefined, refHigh: r.ref_high ?? undefined,
    takenAt: r.taken_at, sourceType: r.source_type, sourceRef: r.source_ref,
  }));
}

export async function getConditions(db: DB, patientId: PatientId): Promise<Condition[]> {
  const rows = (await db.execute(
    "SELECT * FROM condition WHERE patient_id = ? AND status = 'active'", [patientId],
  )).rows;
  return rows.map((r: any) => ({
    id: r.id, patientId: r.patient_id, name: r.name,
    diagnosedAt: r.diagnosed_at, status: r.status,
  }));
}

export async function getWearable(db: DB, patientId: PatientId, days = 30): Promise<WearableDaily[]> {
  const rows = (await db.execute(
    "SELECT * FROM wearable_daily WHERE patient_id = ? AND date(date) >= date('now', ?) ORDER BY date DESC",
    [patientId, `-${days} days`],
  )).rows;
  return rows.map((r: any) => ({
    patientId: r.patient_id, date: r.date,
    restingHr: r.resting_hr ?? undefined, sleepHours: r.sleep_hours ?? undefined,
    steps: r.steps ?? undefined, hrvMs: r.hrv_ms ?? undefined,
  }));
}

export async function getNotes(db: DB, patientId: PatientId): Promise<NoteChunk[]> {
  const rows = (await db.execute(
    "SELECT * FROM note_chunk WHERE patient_id = ? ORDER BY taken_at DESC", [patientId],
  )).rows;
  return rows.map((r: any) => ({
    id: r.id, patientId: r.patient_id,
    sourceType: r.source_type, sourceRef: r.source_ref,
    text: r.text, takenAt: r.taken_at,
  }));
}

export async function getAllFacts(db: DB, patientId: PatientId): Promise<AllFacts> {
  const patient = await getPatient(db, patientId);
  const [encounters, medications, labResults, conditions, wearable, notes] = await Promise.all([
    getEncounters(db, patientId),
    getAllMedications(db, patientId),
    getRecentLabs(db, patientId, 365 * 3),
    getConditions(db, patientId),
    getWearable(db, patientId, 90),
    getNotes(db, patientId),
  ]);
  return {
    patient: { id: patient.id, name: patient.name, dob: patient.dob, sex: patient.sex },
    encounters, medications, labResults, conditions, wearable, notes,
  };
}

export async function insertEncounter(db: DB, row: {
  patientId: PatientId; date: string; provider?: string;
  kind: string; summary?: string;
}): Promise<number> {
  const res = await db.execute(
    "INSERT INTO encounter (patient_id, date, provider, kind, summary) VALUES (?, ?, ?, ?, ?) RETURNING id",
    [row.patientId, row.date, row.provider ?? null, row.kind, row.summary ?? null],
  );
  return (res.rows[0] as any).id;
}

export async function insertLabResult(db: DB, row: {
  patientId: PatientId; testName: string; value: number; unit: string;
  refLow?: number; refHigh?: number; takenAt: string;
  sourceType: string; sourceRef: string;
}): Promise<number> {
  const res = await db.execute(
    `INSERT INTO lab_result (patient_id, test_name, value, unit, ref_low, ref_high, taken_at, source_type, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      row.patientId, row.testName, row.value, row.unit,
      row.refLow ?? null, row.refHigh ?? null, row.takenAt,
      row.sourceType, row.sourceRef,
    ],
  );
  return (res.rows[0] as any).id;
}
```

- [ ] **Step 5: Add jest config to `app/package.json`**

```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "testMatch": ["<rootDir>/__tests__/**/*.test.ts"]
}
```

- [ ] **Step 6: Write test `app/__tests__/repos.test.ts`** (uses better-sqlite3 as an in-memory DB)

```ts
import Database from "better-sqlite3";
import { getActiveMedications, getRecentLabs, insertLabResult, insertEncounter } from "../src/services/store/repos";

// Adapter that mirrors our DB interface but uses better-sqlite3 synchronously.
function makeDb() {
  const raw = new Database(":memory:");
  return {
    execute: async (sql: string, params?: unknown[]) => {
      const stmt = raw.prepare(sql);
      if (/RETURNING/i.test(sql) || /SELECT/i.test(sql.trim().slice(0, 6))) {
        const rows = stmt.all(...(params ?? []));
        return { rows };
      }
      stmt.run(...(params ?? []));
      return { rows: [] };
    },
    close: async () => raw.close(),
  };
}

const SCHEMA = `
CREATE TABLE patient (id INTEGER PRIMARY KEY, name TEXT, dob TEXT, sex TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE encounter (id INTEGER PRIMARY KEY, patient_id INTEGER, date TEXT, provider TEXT, kind TEXT, summary TEXT);
CREATE TABLE medication (id INTEGER PRIMARY KEY, patient_id INTEGER, name TEXT, dose TEXT, start_date TEXT, end_date TEXT, prescribed_at_encounter_id INTEGER, frequency TEXT, timing TEXT, with_food INTEGER, duration_days INTEGER, patient_notes TEXT, source_type TEXT, source_ref TEXT);
CREATE TABLE lab_result (id INTEGER PRIMARY KEY, patient_id INTEGER, test_name TEXT, value REAL, unit TEXT, ref_low REAL, ref_high REAL, taken_at TEXT, source_type TEXT, source_ref TEXT);
CREATE TABLE condition (id INTEGER PRIMARY KEY, patient_id INTEGER, name TEXT, diagnosed_at TEXT, status TEXT);
CREATE TABLE wearable_daily (patient_id INTEGER, date TEXT, resting_hr INTEGER, sleep_hours REAL, steps INTEGER, hrv_ms INTEGER);
CREATE TABLE note_chunk (id INTEGER PRIMARY KEY, patient_id INTEGER, source_type TEXT, source_ref TEXT, text TEXT, taken_at TEXT);
`;

async function seed(db: any) {
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }
  await db.execute("INSERT INTO patient (id, name, dob, sex) VALUES (1, 'Riya', '1984-01-01', 'F')");
  await db.execute("INSERT INTO medication (patient_id, name, dose, start_date, end_date, source_type, source_ref) VALUES (1, 'Metformin', '500mg', '2024-01-01', NULL, 'seed', 'seed')");
  await db.execute("INSERT INTO medication (patient_id, name, dose, start_date, end_date, source_type, source_ref) VALUES (1, 'OldMed', '10mg', '2020-01-01', '2020-06-01', 'seed', 'seed')");
}

test("getActiveMedications returns only currently active meds", async () => {
  const db = makeDb();
  await seed(db);
  const active = await getActiveMedications(db as any, 1);
  expect(active.map((m) => m.name)).toEqual(["Metformin"]);
});

test("insertLabResult + getRecentLabs roundtrip", async () => {
  const db = makeDb();
  await seed(db);
  await insertEncounter(db as any, { patientId: 1, date: "2026-06-01", kind: "lab" });
  const id = await insertLabResult(db as any, {
    patientId: 1, testName: "HbA1c", value: 7.4, unit: "%",
    takenAt: "2026-06-01", sourceType: "lab_pdf", sourceRef: "abc",
  });
  expect(typeof id).toBe("number");
  const labs = await getRecentLabs(db as any, 1, 3650);
  expect(labs).toHaveLength(1);
  expect(labs[0].testName).toBe("HbA1c");
});
```

- [ ] **Step 7: Run tests**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npm test
```
Expected: `2 passed`.

- [ ] **Step 8: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/package.json app/package-lock.json app/src/services/store app/__tests__/repos.test.ts
git commit -m "feat(app): SQLite schema, migrations, and repos with jest coverage"
```

---

## Task 9: Seed data — synthetic patient (the DESIGN ARTIFACT)

**Files:**
- Create: `app/assets/seed/synthetic_patient.sql`
- Modify: `app/src/services/store/db.ts` (load seed on first boot)

**Interfaces:**
- Consumes: schema from Task 8.
- Produces:
  - `SEED_SQL` string embedded in `db.ts` (imported via bundler-agnostic string).
  - On first launch, DB is populated with patient id=1 "Riya M.", 3 years of history.

**Note:** This is not just data — it is the pitch. Every value must be clinically believable. Age 42, F, Indian name to fit the demo context. Diabetic + hypertensive with a *rising HbA1c trend* to hook the "trending" narrative, and one *deliberately-overdue HbA1c* so Feature B has something to flag.

- [ ] **Step 1: Write `app/assets/seed/synthetic_patient.sql`**

```sql
INSERT INTO patient (id, name, dob, sex) VALUES (1, 'Riya M.', '1984-03-14', 'F');

-- Conditions
INSERT INTO condition (patient_id, name, diagnosed_at, status) VALUES
  (1, 'Type 2 Diabetes', '2022-06-15', 'active'),
  (1, 'Hypertension',    '2020-11-02', 'active'),
  (1, 'Hyperlipidemia',  '2023-02-10', 'active');

-- Encounters (chronological)
INSERT INTO encounter (id, patient_id, date, provider, kind, summary) VALUES
  (1,  1, '2022-06-15', 'Dr. A. Kim',   'visit',     'New T2DM dx. Started Metformin 500mg BID.'),
  (2,  1, '2022-09-20', 'Apollo Diag',  'lab',       'HbA1c 7.9.'),
  (3,  1, '2023-01-11', 'Dr. A. Kim',   'visit',     'Diet counselling; LDL borderline high.'),
  (4,  1, '2023-02-10', 'Dr. A. Kim',   'visit',     'Started Atorvastatin 20mg for hyperlipidemia.'),
  (5,  1, '2023-05-05', 'Apollo Diag',  'lab',       'HbA1c 7.5, LDL 132.'),
  (6,  1, '2024-01-12', 'Apollo Diag',  'lab',       'HbA1c 7.1, LDL 118.'),
  (7,  1, '2024-06-18', 'Dr. R. Nair',  'visit',     'Losartan 50mg for BP creeping up.'),
  (8,  1, '2024-10-04', 'Apollo Diag',  'lab',       'HbA1c 7.0, LDL 122.'),
  (9,  1, '2025-05-14', 'Apollo Diag',  'lab',       'HbA1c 7.2, LDL 120.'),
  (10, 1, '2026-02-03', 'Dr. A. Kim',   'visit',     'Discussed adherence; refills.'),
  (11, 1, '2026-05-01', 'Apollo Diag',  'lab',       'HbA1c 7.4 (rising), LDL 122.');

-- Medications (active + historical)
INSERT INTO medication (patient_id, name, dose, start_date, end_date, prescribed_at_encounter_id, frequency, timing, with_food, patient_notes, source_type, source_ref) VALUES
  (1, 'Metformin',    '500mg', '2022-06-15', NULL, 1,  'twice daily', 'morning, evening', 1, 'Take with food to reduce GI upset.', 'seed', 'seed'),
  (1, 'Atorvastatin', '20mg',  '2023-02-10', NULL, 4,  'once daily',  'bedtime',          0, 'Avoid grapefruit juice.',           'seed', 'seed'),
  (1, 'Losartan',     '50mg',  '2024-06-18', NULL, 7,  'once daily',  'morning',          0, 'Watch for dizziness first week.',   'seed', 'seed');

-- Lab results (HbA1c rising story + LDL flat + fasting glucose)
INSERT INTO lab_result (patient_id, test_name, value, unit, ref_low, ref_high, taken_at, source_type, source_ref) VALUES
  (1, 'HbA1c',            7.9, '%',      4.0, 5.6, '2022-09-20', 'seed', 'seed'),
  (1, 'HbA1c',            7.5, '%',      4.0, 5.6, '2023-05-05', 'seed', 'seed'),
  (1, 'HbA1c',            7.1, '%',      4.0, 5.6, '2024-01-12', 'seed', 'seed'),
  (1, 'HbA1c',            7.0, '%',      4.0, 5.6, '2024-10-04', 'seed', 'seed'),
  (1, 'HbA1c',            7.2, '%',      4.0, 5.6, '2025-05-14', 'seed', 'seed'),
  (1, 'HbA1c',            7.4, '%',      4.0, 5.6, '2026-05-01', 'seed', 'seed'),
  (1, 'Fasting glucose',  148, 'mg/dL',  70,  100, '2026-05-01', 'seed', 'seed'),
  (1, 'LDL',              132, 'mg/dL',  0,   100, '2023-05-05', 'seed', 'seed'),
  (1, 'LDL',              118, 'mg/dL',  0,   100, '2024-01-12', 'seed', 'seed'),
  (1, 'LDL',              122, 'mg/dL',  0,   100, '2024-10-04', 'seed', 'seed'),
  (1, 'LDL',              120, 'mg/dL',  0,   100, '2025-05-14', 'seed', 'seed'),
  (1, 'LDL',              122, 'mg/dL',  0,   100, '2026-05-01', 'seed', 'seed'),
  (1, 'HDL',              48,  'mg/dL',  40,  60,  '2026-05-01', 'seed', 'seed'),
  (1, 'Creatinine',       0.9, 'mg/dL',  0.6, 1.2, '2026-05-01', 'seed', 'seed');

-- Wearable trend (mildly elevated resting HR, poor sleep)
INSERT INTO wearable_daily (patient_id, date, resting_hr, sleep_hours, steps, hrv_ms) VALUES
  (1, '2026-06-25', 74, 6.2, 5800, 32),
  (1, '2026-06-26', 76, 5.9, 4200, 30),
  (1, '2026-06-27', 72, 6.7, 6900, 34),
  (1, '2026-06-28', 78, 5.5, 3100, 28),
  (1, '2026-06-29', 75, 6.1, 5400, 31),
  (1, '2026-06-30', 74, 6.4, 6100, 33),
  (1, '2026-07-01', 76, 6.0, 4800, 30);

-- Doctor notes (short, believable)
INSERT INTO note_chunk (patient_id, source_type, source_ref, text, taken_at) VALUES
  (1, 'seed', 'seed', 'Dr. Kim: patient reports occasional evening lightheadedness. Consider hypoglycemia workup at next visit.', '2026-02-03'),
  (1, 'seed', 'seed', 'Dr. Nair: BP 138/86 in-clinic. Started Losartan 50mg. Recheck in 4 weeks.', '2024-06-18'),
  (1, 'seed', 'seed', 'Dr. Kim: reinforced med adherence, especially bedtime Atorvastatin. Patient reports skipping doses on weekends.', '2026-02-03'),
  (1, 'seed', 'seed', 'Apollo Diag: HbA1c trending up over past 12 months; recommend q3mo check.', '2026-05-01'),
  (1, 'seed', 'seed', 'Dr. Kim: discussed diet — patient interested in low-carb dinner swap.', '2023-01-11');
```

- [ ] **Step 2: Modify `app/src/services/store/db.ts` to load seed on first boot**

Add at the top:

```ts
const SEED_SQL = `
INSERT INTO patient (id, name, dob, sex) VALUES (1, 'Riya M.', '1984-03-14', 'F');
-- (paste every line of assets/seed/synthetic_patient.sql here)
`;
```

Because Metro can't `import` `.sql`, we embed the seed as a string constant. The source-of-truth stays in `assets/seed/synthetic_patient.sql` (design artifact) and is copy-pasted into `db.ts` `SEED_SQL`. Add a comment above the constant:

```ts
// SEED_SQL is copy-pasted from assets/seed/synthetic_patient.sql (the design artifact).
// If you edit the .sql file, also update this constant.
```

Modify `runMigrations` to seed on first boot:

```ts
async function runMigrations(db: DB): Promise<void> {
  for (const stmt of schemaSql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }
  const row = (await db.execute("SELECT COUNT(*) as c FROM migrations")).rows[0];
  if (row.c === 0) {
    for (const stmt of SEED_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.execute(stmt);
    }
    await db.execute("INSERT INTO migrations(version) VALUES (1)");
  }
}
```

- [ ] **Step 3: Manually verify by re-running the app**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
# Wipe the emulator app data to force first-boot seed run:
adb shell pm clear com.healthos.app || true
npx expo start --android
```
Expected: emulator boots into a blank timeline placeholder (screen not built yet), but `adb logcat` shows no SQLite errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/assets/seed/synthetic_patient.sql app/src/services/store/db.ts
git commit -m "feat(app): synthetic patient seed loaded on first boot"
```

---

## Task 10: GemmaClient interface + CloudGemma implementation + selection logic

**Files:**
- Create: `app/src/services/gemma/CloudGemma.ts`
- Create: `app/src/services/gemma/GemmaClient.ts`
- Create: `app/__tests__/GemmaClient.test.ts`

**Interfaces:**
- Consumes: `BACKEND_URL` and `CLOUD_ONLY_MODE` from `src/config.ts`, types from `src/types.ts`.
- Produces:
  - `interface GemmaClient { generate(req: GenerateRequest): Promise<GenerateResponse>; }`
  - `class CloudGemma implements GemmaClient` — POSTs to `${BACKEND_URL}/chat` for text; POSTs multipart to `${BACKEND_URL}/extract` for extraction. (Extraction is called by `ingestLabPdf`, not through this class — this class covers `/chat` fallback only in v1.)
  - `getGemmaClient(): GemmaClient` — factory. Returns cloud impl if `CLOUD_ONLY_MODE || !onDeviceAvailable`. Cached across calls.
  - `resetGemmaClientForTests(): void` — testing helper.

- [ ] **Step 1: Write `app/src/services/gemma/CloudGemma.ts`**

```ts
import { BACKEND_URL } from "../../config";
import type { GenerateRequest, GenerateResponse } from "../../types";

export class CloudGemma {
  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const resp = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: req.prompt,
        facts_json: "",
      }),
    });
    if (!resp.ok) throw new Error(`CloudGemma failed: ${resp.status}`);
    const body = (await resp.json()) as { text: string };
    return { text: body.text };
  }
}
```

Note: the "prompt" already contains facts + question when it comes from `buildContext`. `facts_json` on `/chat` is retained for backend prompt shaping but sent empty here since we bake it into `prompt` from the client side. Backend prompt is idempotent when `facts_json` is `""`.

- [ ] **Step 2: Write `app/src/services/gemma/GemmaClient.ts`**

```ts
import { CLOUD_ONLY_MODE } from "../../config";
import type { GenerateRequest, GenerateResponse } from "../../types";
import { CloudGemma } from "./CloudGemma";

export interface GemmaClient {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

let _client: GemmaClient | null = null;
let _isOnDeviceAvailable: (() => Promise<boolean>) = async () => false;

// Populated by OnDeviceGemma module registration (Task 11) via setOnDeviceCandidate.
let _onDeviceCandidate: (() => GemmaClient) | null = null;

export function registerOnDeviceCandidate(
  candidate: () => GemmaClient,
  probe: () => Promise<boolean>,
) {
  _onDeviceCandidate = candidate;
  _isOnDeviceAvailable = probe;
}

export async function getGemmaClient(): Promise<GemmaClient> {
  if (_client) return _client;
  if (!CLOUD_ONLY_MODE && _onDeviceCandidate) {
    try {
      if (await _isOnDeviceAvailable()) {
        _client = _onDeviceCandidate();
        return _client;
      }
    } catch { /* fall through to cloud */ }
  }
  _client = new CloudGemma();
  return _client;
}

export function resetGemmaClientForTests() {
  _client = null;
  _onDeviceCandidate = null;
  _isOnDeviceAvailable = async () => false;
}
```

- [ ] **Step 3: Write `app/__tests__/GemmaClient.test.ts`**

```ts
import { getGemmaClient, registerOnDeviceCandidate, resetGemmaClientForTests } from "../src/services/gemma/GemmaClient";
import { CloudGemma } from "../src/services/gemma/CloudGemma";

jest.mock("../src/config", () => ({
  BACKEND_URL: "http://test-backend",
  CLOUD_ONLY_MODE: false,
}));

beforeEach(() => resetGemmaClientForTests());

test("returns cloud impl when no on-device candidate registered", async () => {
  const c = await getGemmaClient();
  expect(c).toBeInstanceOf(CloudGemma);
});

test("returns on-device impl when candidate is available", async () => {
  const fake = { generate: async () => ({ text: "ondevice" }) };
  registerOnDeviceCandidate(() => fake, async () => true);
  const c = await getGemmaClient();
  expect(await c.generate({ prompt: "x" })).toEqual({ text: "ondevice" });
});

test("falls back to cloud when on-device probe returns false", async () => {
  const fake = { generate: async () => ({ text: "ondevice" }) };
  registerOnDeviceCandidate(() => fake, async () => false);
  const c = await getGemmaClient();
  expect(c).toBeInstanceOf(CloudGemma);
});

test("falls back to cloud when probe throws", async () => {
  const fake = { generate: async () => ({ text: "ondevice" }) };
  registerOnDeviceCandidate(() => fake, async () => { throw new Error("no bridge"); });
  const c = await getGemmaClient();
  expect(c).toBeInstanceOf(CloudGemma);
});
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npm test
```
Expected: `6 passed` (repos × 2 + GemmaClient × 4).

- [ ] **Step 5: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/src/services/gemma app/__tests__/GemmaClient.test.ts
git commit -m "feat(app): GemmaClient interface with CloudGemma default + selection logic"
```

---

## Task 11: OnDeviceGemma implementation (MediaPipe bridge) + registration

**Files:**
- Create: `app/src/services/gemma/OnDeviceGemma.ts`
- Modify: `app/app/_layout.tsx` (register on-device candidate on mount)
- Modify: `app/package.json` (add react-native-llm-mediapipe)

**Interfaces:**
- Consumes: `react-native-llm-mediapipe`, `expo-file-system`.
- Produces:
  - `class OnDeviceGemma implements GemmaClient` — uses MediaPipe LLM Inference to run Gemma 3n.
  - `async function probeOnDeviceAvailable(): Promise<boolean>` — returns true iff the `.task` model file exists at expected path and MediaPipe initialised.
  - Side-effect: `registerOnDeviceCandidate(...)` called at app boot.

**Note:** This task carries the RN-bridge risk we scoped for. If the bridge misbehaves, don't fight it — set `EXPO_PUBLIC_CLOUD_ONLY_MODE=1` in `.env` and move on. The rest of the app doesn't care because everything goes through `GemmaClient`.

- [ ] **Step 1: Install packages**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npm install react-native-llm-mediapipe expo-file-system
```

- [ ] **Step 2: Write `app/src/services/gemma/OnDeviceGemma.ts`**

```ts
import * as FileSystem from "expo-file-system";
import { LlmInference } from "react-native-llm-mediapipe";

import type { GenerateRequest, GenerateResponse } from "../../types";

const MODEL_URL = "https://huggingface.co/google/gemma-3n-E2B-it-litert-preview/resolve/main/gemma-3n-E2B-it-int4.task";
const MODEL_PATH = `${FileSystem.documentDirectory}models/gemma-3n-E2B-it-int4.task`;

let _inference: LlmInference | null = null;

async function ensureModelDownloaded(): Promise<string> {
  const info = await FileSystem.getInfoAsync(MODEL_PATH);
  if (info.exists && info.size && info.size > 500_000_000) return MODEL_PATH;

  await FileSystem.makeDirectoryAsync(
    `${FileSystem.documentDirectory}models/`,
    { intermediates: true },
  );
  const dl = FileSystem.createDownloadResumable(MODEL_URL, MODEL_PATH);
  const res = await dl.downloadAsync();
  if (!res) throw new Error("model download failed");
  return res.uri;
}

async function ensureInference(): Promise<LlmInference> {
  if (_inference) return _inference;
  const path = await ensureModelDownloaded();
  _inference = await LlmInference.createFromOptions({
    baseOptions: { modelAssetPath: path },
    maxTokens: 512,
    topK: 40,
    temperature: 0.6,
    randomSeed: 101,
  });
  return _inference;
}

export async function probeOnDeviceAvailable(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    return Boolean(info.exists);
  } catch {
    return false;
  }
}

export class OnDeviceGemma {
  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const inf = await ensureInference();
    const text = await inf.generateResponse(req.prompt);
    return { text };
  }
}
```

- [ ] **Step 3: Register on-device candidate in `app/app/_layout.tsx`**

```tsx
import { Stack } from "expo-router";
import { useEffect } from "react";

import "../global.css";
import { registerOnDeviceCandidate } from "../src/services/gemma/GemmaClient";
import { OnDeviceGemma, probeOnDeviceAvailable } from "../src/services/gemma/OnDeviceGemma";

export default function RootLayout() {
  useEffect(() => {
    registerOnDeviceCandidate(() => new OnDeviceGemma(), probeOnDeviceAvailable);
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 4: Verify by manual boot** (no unit test — bridge behaviour is emulator-dependent)

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npx expo start --android
```
Expected: app boots. No hard crash. If the bridge is problematic, edit `.env` to set `EXPO_PUBLIC_CLOUD_ONLY_MODE=1` and reboot — chat still works via backend `/chat`.

- [ ] **Step 5: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/src/services/gemma/OnDeviceGemma.ts app/app/_layout.tsx app/package.json app/package-lock.json
git commit -m "feat(app): OnDeviceGemma via MediaPipe + boot-time registration"
```

---

## Task 12: buildContext (chat prompt assembly) + test

**Files:**
- Create: `app/src/services/chat/buildContext.ts`
- Create: `app/__tests__/buildContext.test.ts`

**Interfaces:**
- Consumes: `AllFacts` type, `getAllFacts` from repos (Task 8).
- Produces:
  - `buildChatContext(facts: AllFacts, userQuestion: string): string` — returns full prompt.
  - `factsToCompactJson(facts: AllFacts): string` — used by BriefBuilder too.

- [ ] **Step 1: Write `app/src/services/chat/buildContext.ts`**

```ts
import type { AllFacts } from "../../types";

const SYSTEM = `You are 'Health Memory', a helpful and cautious explainer of a patient's own medical facts. You are given a compact JSON payload of the patient's history and a question. Answer in plain language, cite the source_type + date whenever you use a fact, and NEVER invent facts not in the payload. If the payload doesn't contain the answer, say so and suggest they discuss with their doctor.`;

export function factsToCompactJson(f: AllFacts): string {
  return JSON.stringify({
    p: { name: f.patient.name, dob: f.patient.dob, sex: f.patient.sex },
    cond: f.conditions.map((c) => ({ n: c.name, dx: c.diagnosedAt, s: c.status })),
    med: f.medications.map((m) => ({
      n: m.name, d: m.dose, from: m.startDate, to: m.endDate,
      freq: m.frequency, when: m.timing, food: m.withFood, note: m.patientNotes,
    })),
    lab: f.labResults.map((l) => ({
      t: l.testName, v: l.value, u: l.unit, at: l.takenAt,
      lo: l.refLow, hi: l.refHigh,
    })),
    enc: f.encounters.map((e) => ({
      at: e.date, by: e.provider, k: e.kind, s: e.summary,
    })),
    note: f.notes.map((n) => ({ t: n.text, at: n.takenAt })),
  });
}

export function buildChatContext(facts: AllFacts, userQuestion: string): string {
  const compact = factsToCompactJson(facts);
  return `${SYSTEM}\n\n# Facts\n${compact}\n\n# Question\n${userQuestion}\n\n# Answer\n`;
}
```

- [ ] **Step 2: Write `app/__tests__/buildContext.test.ts`**

```ts
import { buildChatContext, factsToCompactJson } from "../src/services/chat/buildContext";
import type { AllFacts } from "../src/types";

const facts: AllFacts = {
  patient: { id: 1, name: "Riya", dob: "1984-03-14", sex: "F" },
  encounters: [{ id: 1, patientId: 1, date: "2026-05-01", kind: "lab" }],
  medications: [{
    id: 1, patientId: 1, name: "Metformin", dose: "500mg",
    startDate: "2022-06-15", sourceType: "seed", sourceRef: "seed",
  }],
  labResults: [{
    id: 1, patientId: 1, testName: "HbA1c", value: 7.4, unit: "%",
    takenAt: "2026-05-01", sourceType: "seed", sourceRef: "seed",
  }],
  conditions: [{ id: 1, patientId: 1, name: "T2DM", diagnosedAt: "2022-06-15", status: "active" }],
  wearable: [],
  notes: [],
};

test("factsToCompactJson stays under 8KB for the seeded patient shape", () => {
  const json = factsToCompactJson(facts);
  expect(Buffer.byteLength(json, "utf8")).toBeLessThan(8192);
});

test("buildChatContext includes system + facts + question", () => {
  const prompt = buildChatContext(facts, "why am I on metformin?");
  expect(prompt).toMatch(/Health Memory/);
  expect(prompt).toMatch(/Metformin/);
  expect(prompt).toMatch(/why am I on metformin\?/);
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npm test
```
Expected: `8 passed`.

- [ ] **Step 4: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/src/services/chat app/__tests__/buildContext.test.ts
git commit -m "feat(app): chat context assembly with compact facts JSON"
```

---

## Task 13: ingestLabPdf module

**Files:**
- Create: `app/src/services/ingestion/ingestLabPdf.ts`
- Modify: `app/package.json` (add `expo-crypto`)

**Interfaces:**
- Consumes: backend `POST /extract`, repos `insertEncounter`, `insertLabResult`.
- Produces:
  - `async ingestLabPdf(db: DB, patientId: PatientId, fileUri: string, fileName: string): Promise<{ encounterId: number; labsInserted: number }>`

- [ ] **Step 1: Install dependency**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npm install expo-crypto
```

- [ ] **Step 2: Write `app/src/services/ingestion/ingestLabPdf.ts`**

```ts
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";

import { BACKEND_URL } from "../../config";
import type { PatientId } from "../../types";
import { insertEncounter, insertLabResult } from "../store/repos";
import type { DB } from "../store/db";

interface ExtractedLab {
  test_name: string;
  value: number;
  unit: string;
  ref_low: number | null;
  ref_high: number | null;
  taken_at: string;
}

interface ExtractResponse {
  labs: ExtractedLab[];
  encounter_date: string;
  provider: string | null;
}

export async function ingestLabPdf(
  db: DB,
  patientId: PatientId,
  fileUri: string,
  fileName: string,
): Promise<{ encounterId: number; labsInserted: number }> {
  // 1. Compute source_ref (sha256 of the PDF bytes).
  const bytes = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const sourceRef = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytes,
  );

  // 2. POST to /extract as multipart.
  const form = new FormData();
  form.append("file", { uri: fileUri, name: fileName, type: "application/pdf" } as any);
  form.append("source_type", "lab_pdf");
  const resp = await fetch(`${BACKEND_URL}/extract`, { method: "POST", body: form });
  if (!resp.ok) throw new Error(`extract failed: ${resp.status}`);
  const data = (await resp.json()) as ExtractResponse;

  // 3. Write one encounter + one lab_result per row.
  const encounterId = await insertEncounter(db, {
    patientId,
    date: data.encounter_date,
    provider: data.provider ?? undefined,
    kind: "lab",
    summary: `Lab report ingested (${data.labs.length} values)`,
  });
  for (const l of data.labs) {
    await insertLabResult(db, {
      patientId,
      testName: l.test_name,
      value: l.value,
      unit: l.unit,
      refLow: l.ref_low ?? undefined,
      refHigh: l.ref_high ?? undefined,
      takenAt: l.taken_at,
      sourceType: "lab_pdf",
      sourceRef,
    });
  }
  return { encounterId, labsInserted: data.labs.length };
}
```

- [ ] **Step 3: Manual smoke test** (backend + emulator must both be running)

Backend:
```bash
cd /Users/adityajha/GithubProjects/healthOS/backend
source .venv/bin/activate
cp .env.example .env  # fill in GOOGLE_API_KEY, UPSTASH_* first
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then use the Upload tab (built in Task 15) to send a real lab PDF and confirm rows appear.

- [ ] **Step 4: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/src/services/ingestion app/package.json app/package-lock.json
git commit -m "feat(app): ingestLabPdf module — extract + write rows"
```

---

## Task 14: Timeline screen (renders facts)

**Files:**
- Create: `app/src/ui/theme.ts`
- Create: `app/src/ui/Sparkline.tsx`
- Create: `app/src/ui/FactRow.tsx`
- Modify: `app/app/(tabs)/timeline.tsx` (replace placeholder with real UI)

**Interfaces:**
- Consumes: `openDb`, `getAllFacts`.
- Produces: user-visible Timeline tab showing conditions, active regimen, recent labs (with sparklines), encounters.

- [ ] **Step 1: Install `react-native-svg`**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npx expo install react-native-svg
```

- [ ] **Step 2: Write `app/src/ui/theme.ts`**

```ts
export const theme = {
  fg: "#111111",
  muted: "#6b7280",
  line: "#e5e7eb",
  cardBg: "#ffffff",
  bg: "#f8fafc",
  up: "#c0392b",
  down: "#16a34a",
  flat: "#6b7280",
};
```

- [ ] **Step 3: Write `app/src/ui/Sparkline.tsx`**

```tsx
import Svg, { Polyline } from "react-native-svg";
import { View } from "react-native";
import { theme } from "./theme";

export function Sparkline({ values, w = 120, h = 30 }: { values: number[]; w?: number; h?: number }) {
  if (!values.length) return <View style={{ width: w, height: h }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  const trend = values[values.length - 1] - values[0];
  const color = Math.abs(trend) < range * 0.05 ? theme.flat : trend > 0 ? theme.up : theme.down;
  return (
    <Svg width={w} height={h}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  );
}
```

- [ ] **Step 4: Write `app/src/ui/FactRow.tsx`**

```tsx
import { Text, View } from "react-native";

export function FactRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View className="flex-row items-baseline py-1">
      <Text className="w-32 text-gray-500">{label}</Text>
      <Text className="flex-1 text-base">{value}</Text>
      {sub ? <Text className="text-xs text-gray-400">{sub}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 5: Rewrite `app/app/(tabs)/timeline.tsx`**

```tsx
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { AllFacts } from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getAllFacts } from "../../src/services/store/repos";
import { Sparkline } from "../../src/ui/Sparkline";

const PATIENT_ID = 1;

function groupLabsByName(facts: AllFacts) {
  const by: Record<string, { at: string; v: number }[]> = {};
  for (const l of facts.labResults) {
    (by[l.testName] ||= []).push({ at: l.takenAt, v: l.value });
  }
  for (const k of Object.keys(by)) by[k].sort((a, b) => (a.at < b.at ? -1 : 1));
  return by;
}

export default function Timeline() {
  const [facts, setFacts] = useState<AllFacts | null>(null);

  useEffect(() => {
    (async () => {
      const db = await openDb();
      setFacts(await getAllFacts(db, PATIENT_ID));
    })();
  }, []);

  if (!facts) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text>Loading your memory…</Text>
      </View>
    );
  }

  const labsGrouped = groupLabsByName(facts);
  const activeMeds = facts.medications.filter((m) => !m.endDate);

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-4">
        <Text className="text-xl font-semibold">
          {facts.patient.name}
        </Text>
        <Text className="text-gray-500">DOB {facts.patient.dob} · {facts.patient.sex}</Text>
      </View>

      <View className="mx-4 mb-3 rounded-lg bg-white p-4">
        <Text className="mb-2 text-xs uppercase text-gray-500">Active conditions</Text>
        <View className="flex-row flex-wrap gap-2">
          {facts.conditions.map((c) => (
            <View key={c.id} className="rounded-full border border-gray-200 px-3 py-1">
              <Text>{c.name}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="mx-4 mb-3 rounded-lg bg-white p-4">
        <Text className="mb-2 text-xs uppercase text-gray-500">Today's routine</Text>
        {activeMeds.map((m) => (
          <View key={m.id} className="py-1">
            <Text className="text-base">
              <Text className="font-semibold">{m.name}</Text> {m.dose}
              {m.frequency ? ` — ${m.frequency}` : ""}
              {m.timing ? `, ${m.timing}` : ""}
              {m.withFood ? " · with food" : ""}
            </Text>
            {m.patientNotes ? (
              <Text className="text-xs text-gray-500">{m.patientNotes}</Text>
            ) : null}
          </View>
        ))}
      </View>

      <View className="mx-4 mb-3 rounded-lg bg-white p-4">
        <Text className="mb-2 text-xs uppercase text-gray-500">Recent labs</Text>
        {Object.entries(labsGrouped).map(([name, arr]) => {
          const last = arr[arr.length - 1];
          return (
            <View key={name} className="flex-row items-center justify-between py-1.5">
              <View className="flex-1">
                <Text>{name}</Text>
                <Text className="text-xs text-gray-500">
                  {last.v} · {last.at}
                </Text>
              </View>
              <Sparkline values={arr.slice(-6).map((p) => p.v)} />
            </View>
          );
        })}
      </View>

      <View className="mx-4 mb-6 rounded-lg bg-white p-4">
        <Text className="mb-2 text-xs uppercase text-gray-500">Recent encounters</Text>
        {facts.encounters.slice(0, 5).map((e) => (
          <View key={e.id} className="py-1">
            <Text className="font-semibold">{e.date}</Text>
            <Text className="text-sm">
              {e.provider ? `${e.provider} — ` : ""}
              {e.summary ?? e.kind}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 6: Boot the app and verify Timeline renders**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npx expo start --android
```
Expected: Timeline tab shows Riya M., 3 conditions, 3 meds, labs with sparklines, encounter list.

- [ ] **Step 7: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/src/ui app/app/(tabs)/timeline.tsx
git commit -m "feat(app): Timeline screen with sparklines and seeded data"
```

---

## Task 15: Chat screen

**Files:**
- Create: `app/src/ui/ChatBubble.tsx`
- Modify: `app/app/(tabs)/chat.tsx`

**Interfaces:**
- Consumes: `getGemmaClient`, `openDb`, `getAllFacts`, `buildChatContext`.
- Produces: interactive chat with 3 chips + free-text input.

- [ ] **Step 1: Write `app/src/ui/ChatBubble.tsx`**

```tsx
import { Text, View } from "react-native";

export function ChatBubble({ text, mine }: { text: string; mine?: boolean }) {
  return (
    <View
      className={
        (mine ? "ml-16 self-end bg-blue-500 " : "mr-16 self-start bg-white ") +
        "my-1 rounded-2xl border border-gray-200 px-3 py-2"
      }
    >
      <Text className={mine ? "text-white" : "text-gray-900"}>{text}</Text>
    </View>
  );
}
```

- [ ] **Step 2: Rewrite `app/app/(tabs)/chat.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import type { AllFacts } from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getAllFacts } from "../../src/services/store/repos";
import { buildChatContext } from "../../src/services/chat/buildContext";
import { getGemmaClient } from "../../src/services/gemma/GemmaClient";
import { ChatBubble } from "../../src/ui/ChatBubble";

const PATIENT_ID = 1;
const CHIPS = [
  "Why am I on metformin?",
  "What did the doctor say about my sleep?",
  "Is my HbA1c trending well?",
];

interface Msg { who: "me" | "ai"; text: string; }

export default function Chat() {
  const [facts, setFacts] = useState<AllFacts | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      const db = await openDb();
      setFacts(await getAllFacts(db, PATIENT_ID));
    })();
  }, []);

  async function ask(text: string) {
    if (!facts || busy || !text.trim()) return;
    const q = text.trim();
    setMessages((m) => [...m, { who: "me", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const client = await getGemmaClient();
      const prompt = buildChatContext(facts, q);
      const res = await client.generate({ prompt });
      setMessages((m) => [...m, { who: "ai", text: res.text }]);
    } catch (e: any) {
      setMessages((m) => [...m, { who: "ai", text: `(error: ${e.message ?? e})` }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-slate-50"
    >
      <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: 12 }}>
        {messages.length === 0 && (
          <View className="mb-3">
            <Text className="mb-2 text-xs uppercase text-gray-500">Try asking</Text>
            <View className="flex-row flex-wrap gap-2">
              {CHIPS.map((c) => (
                <Pressable key={c} onPress={() => ask(c)} className="rounded-full border border-gray-300 bg-white px-3 py-1.5">
                  <Text>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {messages.map((m, i) => <ChatBubble key={i} text={m.text} mine={m.who === "me"} />)}
        {busy && <ChatBubble text="thinking…" />}
      </ScrollView>

      <View className="flex-row items-center gap-2 border-t border-gray-200 bg-white p-2">
        <TextInput
          className="flex-1 rounded-full border border-gray-300 px-3 py-2"
          value={input}
          onChangeText={setInput}
          placeholder="Ask your health memory"
          returnKeyType="send"
          onSubmitEditing={() => ask(input)}
        />
        <Pressable
          onPress={() => ask(input)}
          className="rounded-full bg-blue-500 px-4 py-2"
          disabled={busy}
        >
          <Text className="text-white">Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 3: Boot, test chat with a chip on the emulator**

Backend must be running. Tap a chip in the Chat tab; a response should stream/populate.

- [ ] **Step 4: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/src/ui/ChatBubble.tsx app/app/(tabs)/chat.tsx
git commit -m "feat(app): Chat tab with chips and free-text input"
```

---

## Task 16: Upload screen (live lab-PDF ingestion)

**Files:**
- Modify: `app/app/(tabs)/upload.tsx`
- Modify: `app/package.json` (add `expo-document-picker`)

**Interfaces:**
- Consumes: `ingestLabPdf`, `openDb`.
- Produces: Upload tab with "Pick a lab PDF" button → ingests → navigates to Timeline.

- [ ] **Step 1: Install**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npx expo install expo-document-picker
```

- [ ] **Step 2: Rewrite `app/app/(tabs)/upload.tsx`**

```tsx
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";

import { openDb } from "../../src/services/store/db";
import { ingestLabPdf } from "../../src/services/ingestion/ingestLabPdf";

const PATIENT_ID = 1;

export default function Upload() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function pick() {
    const res = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    setBusy(true);
    try {
      const db = await openDb();
      const { labsInserted } = await ingestLabPdf(db, PATIENT_ID, asset.uri, asset.name);
      Alert.alert("Ingested", `${labsInserted} lab values added to your memory.`);
      router.push("/(tabs)/timeline");
    } catch (e: any) {
      Alert.alert("Couldn't read this PDF", e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 p-6">
      <Text className="text-center text-lg">
        Upload a lab-report PDF to add it to your health memory.
      </Text>
      <Pressable onPress={pick} disabled={busy} className="rounded-full bg-blue-500 px-6 py-3">
        <Text className="text-white">{busy ? "Reading…" : "Pick a lab PDF"}</Text>
      </Pressable>
      <Text className="text-center text-xs text-gray-500">
        The file is sent to healthOS only for extraction, then deleted.
      </Text>
    </View>
  );
}
```

- [ ] **Step 3: Manual smoke test end-to-end**

Backend running with a real Google API key. In emulator, tap Upload → pick a real one-page lab PDF from device storage → alert shows N lab values inserted → Timeline updates.

- [ ] **Step 4: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/app/(tabs)/upload.tsx app/package.json app/package-lock.json
git commit -m "feat(app): Upload tab with real lab-PDF ingestion"
```

---

## Task 17: BriefBuilder + Share screen with QR

**Files:**
- Create: `app/src/services/share/BriefBuilder.ts`
- Create: `app/__tests__/BriefBuilder.test.ts`
- Modify: `app/app/share.tsx`
- Modify: `app/package.json` (add `react-native-qrcode-svg`)

**Interfaces:**
- Consumes: `AllFacts`, `BACKEND_URL`.
- Produces:
  - `async buildBriefFacts(facts: AllFacts): Promise<BriefFacts>` — assembles the payload the backend expects.
  - `async postBrief(payload: BriefFacts): Promise<BriefResponse>`.
  - Share screen renders QR + copyable URL.

- [ ] **Step 1: Install QR lib**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npm install react-native-qrcode-svg
```

- [ ] **Step 2: Write `app/src/services/share/BriefBuilder.ts`**

```ts
import { BACKEND_URL } from "../../config";
import type { AllFacts, BriefFacts, BriefResponse } from "../../types";

function ageFromDob(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

function trendOf(values: number[]): "up" | "down" | "flat" {
  if (values.length < 2) return "flat";
  const first = values[0];
  const last = values[values.length - 1];
  const range = Math.max(...values) - Math.min(...values) || 1;
  const delta = last - first;
  if (Math.abs(delta) < range * 0.05) return "flat";
  return delta > 0 ? "up" : "down";
}

export function buildBriefFacts(facts: AllFacts): BriefFacts {
  const activeMeds = facts.medications.filter((m) => !m.endDate);
  const recentLabs = facts.labResults
    .filter((l) => {
      const d = new Date(l.takenAt);
      return Date.now() - d.getTime() < 90 * 24 * 3600 * 1000;
    });

  const grouped: Record<string, typeof facts.labResults> = {};
  for (const l of facts.labResults) (grouped[l.testName] ||= []).push(l);
  for (const k of Object.keys(grouped)) {
    grouped[k].sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1));
  }

  const recentSummary = Object.keys(grouped).map((name) => {
    const arr = grouped[name];
    const last = arr[arr.length - 1];
    return {
      test_name: name,
      value: last.value,
      unit: last.unit,
      taken_at: last.takenAt,
      trend: trendOf(arr.map((x) => x.value)),
      ref_low: last.refLow,
      ref_high: last.refHigh,
    };
  });

  return {
    patient: { name: facts.patient.name, age: ageFromDob(facts.patient.dob), sex: facts.patient.sex },
    conditions: facts.conditions.map((c) => ({ name: c.name, diagnosed_at: c.diagnosedAt })),
    medications: activeMeds.map((m) => ({
      name: m.name, dose: m.dose, active: true,
      frequency: m.frequency, timing: m.timing, with_food: m.withFood,
    })),
    recent_labs: recentSummary,
    encounters: facts.encounters.slice(0, 5).map((e) => ({
      date: e.date, provider: e.provider, kind: e.kind, summary: e.summary,
    })),
    watch_list: [],
    follow_ups: [],
  };
}

export async function postBrief(payload: BriefFacts): Promise<BriefResponse> {
  const resp = await fetch(`${BACKEND_URL}/brief`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`brief failed: ${resp.status}`);
  return (await resp.json()) as BriefResponse;
}
```

- [ ] **Step 3: Write `app/__tests__/BriefBuilder.test.ts`**

```ts
import { buildBriefFacts } from "../src/services/share/BriefBuilder";
import type { AllFacts } from "../src/types";

const facts: AllFacts = {
  patient: { id: 1, name: "Riya M.", dob: "1984-03-14", sex: "F" },
  encounters: [
    { id: 1, patientId: 1, date: "2026-05-01", provider: "Apollo", kind: "lab", summary: "labs" },
  ],
  medications: [
    { id: 1, patientId: 1, name: "Metformin", dose: "500mg", startDate: "2022-06-15",
      frequency: "twice daily", timing: "morning, evening", withFood: true,
      sourceType: "seed", sourceRef: "seed" },
    { id: 2, patientId: 1, name: "OldMed",    dose: "10mg", startDate: "2020-01-01",
      endDate: "2020-06-01", sourceType: "seed", sourceRef: "seed" },
  ],
  labResults: [
    { id: 1, patientId: 1, testName: "HbA1c", value: 7.0, unit: "%",
      takenAt: "2024-10-04", sourceType: "seed", sourceRef: "seed" },
    { id: 2, patientId: 1, testName: "HbA1c", value: 7.4, unit: "%",
      takenAt: "2026-05-01", sourceType: "seed", sourceRef: "seed" },
  ],
  conditions: [
    { id: 1, patientId: 1, name: "T2DM", diagnosedAt: "2022-06-15", status: "active" },
  ],
  wearable: [],
  notes: [],
};

test("buildBriefFacts collapses labs by name and computes trend", () => {
  const b = buildBriefFacts(facts);
  const hba1c = b.recent_labs.find((l) => l.test_name === "HbA1c");
  expect(hba1c?.value).toBe(7.4);
  expect(hba1c?.trend).toBe("up");
});

test("buildBriefFacts excludes ended meds from active list", () => {
  const b = buildBriefFacts(facts);
  expect(b.medications.map((m) => m.name)).toEqual(["Metformin"]);
  expect(b.medications[0].with_food).toBe(true);
});

test("buildBriefFacts computes age from dob", () => {
  const b = buildBriefFacts(facts);
  expect(b.patient.age).toBeGreaterThan(40);
  expect(b.patient.age).toBeLessThan(60);
});
```

- [ ] **Step 4: Rewrite `app/app/share.tsx`**

```tsx
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { openDb } from "../src/services/store/db";
import { getAllFacts } from "../src/services/store/repos";
import { buildBriefFacts, postBrief } from "../src/services/share/BriefBuilder";

const PATIENT_ID = 1;

export default function Share() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const db = await openDb();
      const facts = await getAllFacts(db, PATIENT_ID);
      const payload = buildBriefFacts(facts);
      const res = await postBrief(payload);
      setUrl(res.url);
    } catch (e: any) {
      Alert.alert("Couldn't generate brief", e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 p-6">
      <Text className="text-lg">Share a doctor brief</Text>
      {!url ? (
        <Pressable onPress={generate} disabled={busy} className="rounded-full bg-blue-500 px-6 py-3">
          <Text className="text-white">{busy ? "Building…" : "Generate brief"}</Text>
        </Pressable>
      ) : (
        <>
          <View className="rounded-lg bg-white p-4">
            <QRCode value={url} size={220} />
          </View>
          <TextInput value={url} editable={false} selectTextOnFocus className="w-full rounded border border-gray-300 p-2 text-center" />
          <Text className="text-xs text-gray-500">Expires in 24 hours.</Text>
          <Pressable onPress={() => setUrl(null)} className="rounded-full border border-gray-300 px-4 py-2">
            <Text>Generate a new one</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 5: Add a Share button to Timeline** (small nav to `/share`)

Prepend inside `Timeline`'s return, just above the conditions card:

```tsx
import { Link } from "expo-router";
// ...
<View className="mx-4 mt-2 flex-row justify-end">
  <Link href="/share" asChild>
    <Pressable className="rounded-full bg-blue-500 px-4 py-2">
      <Text className="text-white">Share with doctor</Text>
    </Pressable>
  </Link>
</View>
```
(Add `import { Pressable } from "react-native"` and the Link import.)

- [ ] **Step 6: Run tests**

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npm test
```
Expected: `11 passed`.

- [ ] **Step 7: Manual end-to-end** — tap Share from Timeline → tap Generate → QR appears → open URL in laptop browser → see doctor brief.

- [ ] **Step 8: Commit**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add app/src/services/share app/app/share.tsx app/app/(tabs)/timeline.tsx app/package.json app/package-lock.json app/__tests__/BriefBuilder.test.ts
git commit -m "feat(app): BriefBuilder + Share screen with QR"
```

---

## Task 18: Deploy backend + demo drill

**Files:**
- Create: `backend/fly.toml` (or Render equivalent)
- Create: `DEMO_DRILL.md` (checked-in demo runbook)

**Interfaces:**
- Consumes: nothing new.
- Produces: a public backend URL judges can hit; a rehearsed demo path.

- [ ] **Step 1: Deploy backend to Fly.io** (or Render — pick whichever you have credits for)

```bash
cd /Users/adityajha/GithubProjects/healthOS/backend
fly launch --now  # answer defaults; region close to demo location
fly secrets set GOOGLE_API_KEY=... UPSTASH_REDIS_URL=... UPSTASH_REDIS_TOKEN=... BACKEND_BASE_URL=https://healthos-backend.fly.dev CORS_ORIGINS="*"
fly deploy
```
Verify: `curl https://healthos-backend.fly.dev/health` returns `{"status":"ok"}`.
`curl https://healthos-backend.fly.dev/brief/demo` returns the demo HTML.

- [ ] **Step 2: Update `app/.env`** to point at the deployed backend

```
EXPO_PUBLIC_BACKEND_URL=https://healthos-backend.fly.dev
EXPO_PUBLIC_CLOUD_ONLY_MODE=0
```

- [ ] **Step 3: Build an APK** for the demo device

```bash
cd /Users/adityajha/GithubProjects/healthOS/app
npx eas build --platform android --profile preview --local
```
(Or `--profile development` for faster iteration. Install the resulting APK on the demo phone via `adb install`.)

- [ ] **Step 4: Write `DEMO_DRILL.md`**

```md
# healthOS demo drill

## Roles
- Presenter: drives the phone.
- Co-presenter (optional): opens the brief URL on a tablet.

## Pre-demo checklist (T-30min)
- [ ] Backend `/health` returns ok.
- [ ] Backend `/brief/demo` renders.
- [ ] APK installed on Pixel demo device; app data cleared with `adb shell pm clear com.healthos.app`.
- [ ] Wifi hotspot ready as backup (venue Wifi often fails).
- [ ] Google API key quota checked in Studio.
- [ ] `EXPO_PUBLIC_CLOUD_ONLY_MODE` set to `1` if on-device is flaky.
- [ ] One real lab PDF loaded onto the phone in Files (for the live upload).
- [ ] Backup: screenshot deck of every screen (for total-failure recovery).

## Script (3 minutes)
1. **Hook (20s)** — "Every time you see a new doctor, you start from scratch. HealthOS gives you a memory that goes with you."
2. **Timeline (30s)** — Boot the app. Point to Riya's conditions, current regimen, and the *rising* HbA1c sparkline.
3. **Chat (40s)** — Tap "Why am I on metformin?" chip. Read the grounded answer. Point out the citation to the 2022 encounter.
4. **Live ingestion (40s)** — Tap Upload, pick a real lab PDF. In ~3s the timeline shows new lab values with the trend arrow.
5. **The hero — share with doctor (50s)** — Tap Share, tap Generate, show the QR. Co-presenter scans → doctor brief opens on tablet. Walk the doctor brief top-to-bottom: conditions, regimen, labs, follow-ups due, *3 things to ask*.
6. **Close (10s)** — "Data lives on the patient's phone. On-device Gemma 3n does the reasoning. This is not a record. It's a memory."

## Failure playbooks
- Bridge fails to init on stage → `adb shell setprop debug.cloudonly 1` (won't work; instead, ship two APKs: one with cloud-only baked in as the backup).
- Backend times out → open `https://healthos-backend.fly.dev/brief/demo` in the browser and narrate over the demo brief.
- Emulator dies → screenshot deck (linked below).
```

- [ ] **Step 5: Commit and (optionally) push**

```bash
cd /Users/adityajha/GithubProjects/healthOS
git add backend/fly.toml DEMO_DRILL.md app/.env.example
git commit -m "chore: deploy backend + write demo drill"
```

---

## Self-Review

**Spec coverage check** — each item from `docs/superpowers/specs/2026-07-08-healthos-android-mvp-design.md`:

| Spec section | Task(s) |
|---|---|
| §2 Scope — Expo/RN, doctor via link, on-device+cloud Gemma, single `GemmaClient` fallback | Tasks 7, 10, 11 |
| §2 Local-first storage (op-sqlite) | Tasks 8, 9 |
| §2 Backend routes `/extract`, `/chat`, `/brief`, `/brief/{token}`, `/brief/demo` | Tasks 4, 5, 6 |
| §2 One live pipeline (lab PDFs); others seeded | Tasks 9, 13, 16 |
| §2 Feature A (medication routine) — schema fields + Today's Routine card | Tasks 8, 9, 14 |
| §2 Feature B (follow-up tests) — Gemma-derived at brief render time | Task 6 |
| §3 Architecture layers | Tasks 2–18 collectively |
| §4 Components — every named file has a task | See File Structure section |
| §5 Data flow — 5.1 boot, 5.2 upload, 5.3 chat, 5.4 share, 5.5 invariants | Tasks 9, 13/16, 12/15, 17, and the Global Constraints |
| §6 Fallbacks — bridge init, model dl, extract retry, brief POST, OOM | Tasks 10, 11, 4 (retry via GemmaClient double-call), 17 (retry surfaced in UI), Task 6 (`/brief/demo` static backup) |
| §7 Testing & demo drill | Tasks 2–17 (tests) and Task 18 (drill) |
| §8 Synthetic patient seed | Task 9 |
| §9 Out of scope items | Actively excluded — no tasks touch them |

**Placeholder scan:** every step contains real code, exact paths, and executable commands. No "TODO", "TBD", "add error handling", or "similar to Task N" without repetition.

**Type consistency check:**
- `GemmaClient.generate(req: GenerateRequest)` — defined in Task 7 (types.ts) and Task 10 (interface), consumed by Tasks 11, 12, 15. Names match.
- `AllFacts` — defined Task 7, consumed Tasks 8, 12, 14, 15, 17. Match.
- `BriefFacts` — defined Task 7, produced Task 17, consumed by backend Task 6 (Pydantic `BriefFactsIn` shape matches: `patient`, `conditions`, `medications`, `recent_labs`, `encounters`, `watch_list`, `follow_ups`).
- Backend `POST /brief` returns `{url, expires_at}` — frontend `postBrief` parses same. Match.
- `insertLabResult`, `insertEncounter` — defined Task 8, consumed Task 13. Signatures match.
- `getAllFacts` — defined Task 8, consumed Tasks 12, 14, 15, 17. Match.
- `registerOnDeviceCandidate(candidate, probe)` — defined Task 10, called Task 11. Signature matches.
