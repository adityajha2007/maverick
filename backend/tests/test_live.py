from unittest.mock import patch

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient


def test_live_ws_missing_config_closes_1002(client: TestClient) -> None:
    # First message must be JSON (the {sourceLang, targetLang} config). Sending
    # raw bytes instead makes the server's `receive_json()` blow up, which the
    # route should turn into a clean 1002 close rather than a hard crash.
    with client.websocket_connect("/live-ws") as ws:
        ws.send_bytes(b"not-json-config")
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_text()
    assert exc_info.value.code == 1002


def test_live_ws_valid_config_instantiates_genai_client(client: TestClient) -> None:
    # We never want a real test to open a socket to Gemini Live. Mock
    # genai.Client so the route's `.aio.live.connect(...)` raises inside the
    # route's own try/except, which surfaces as a {"kind": "error"} frame
    # instead of hanging or making a real network call.
    with patch("app.routes.live.genai.Client") as mock_client_cls:
        mock_client_cls.return_value.aio.live.connect.side_effect = RuntimeError(
            "no real Live API connection in tests"
        )
        with client.websocket_connect("/live-ws") as ws:
            ws.send_json({"sourceLang": "hi-IN", "targetLang": "en-US"})
            msg = ws.receive_json()
            assert msg["kind"] == "error"

    mock_client_cls.assert_called_once_with(api_key="test-key")
