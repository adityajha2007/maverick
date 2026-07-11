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
