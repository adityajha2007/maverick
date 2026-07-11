from __future__ import annotations

from app.config import settings

_store: object | None = None


class _InMemoryStore:
    """Minimal Redis-like interface backed by a plain dict (local dev only)."""

    def __init__(self) -> None:
        self._data: dict[str, str] = {}

    def setex(self, key: str, _ttl: int, value: str) -> None:
        self._data[key] = value

    def get(self, key: str) -> str | None:
        return self._data.get(key)


def get_redis() -> object:
    global _store
    if _store is None:
        if settings.upstash_redis_url and settings.upstash_redis_token:
            from upstash_redis import Redis
            _store = Redis(url=settings.upstash_redis_url, token=settings.upstash_redis_token)
        else:
            _store = _InMemoryStore()
    return _store
