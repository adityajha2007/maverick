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
