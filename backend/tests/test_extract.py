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
