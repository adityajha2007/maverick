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
