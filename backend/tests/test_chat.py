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
