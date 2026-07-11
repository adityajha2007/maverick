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
