from __future__ import annotations
from typing import TypedDict

import httpx
import google.generativeai as genai


class GemmaImage(TypedDict):
    mime_type: str
    data: bytes


def _is_ollama_model(model: str) -> bool:
    return model.startswith("gemma") and not model.startswith("gemini")


class GemmaClient:
    def __init__(self, api_key: str, ollama_base_url: str, ollama_model: str) -> None:
        self._api_key = api_key
        self._ollama_base_url = ollama_base_url.rstrip("/")
        self._ollama_model = ollama_model
        if api_key:
            genai.configure(api_key=api_key)

    def _call_gemini(
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

    def _call_ollama(
        self,
        prompt: str,
        *,
        json_mode: bool,
    ) -> str:
        payload: dict = {
            "model": self._ollama_model,
            "prompt": prompt,
            "stream": False,
        }
        if json_mode:
            payload["format"] = "json"
        resp = httpx.post(
            f"{self._ollama_base_url}/api/generate",
            json=payload,
            timeout=120.0,
        )
        resp.raise_for_status()
        return resp.json()["response"]

    def generate(
        self,
        prompt: str,
        *,
        images: list[GemmaImage] | None = None,
        json_mode: bool = False,
        model: str = "gemini-2.0-flash",
    ) -> str:
        if _is_ollama_model(model):
            try:
                return self._call_ollama(prompt, json_mode=json_mode)
            except Exception:
                if self._api_key:
                    return self._call_gemini(
                        prompt, images=images, json_mode=json_mode, model="gemini-2.0-flash"
                    )
                raise

        if not self._api_key:
            return self._call_ollama(prompt, json_mode=json_mode)

        try:
            return self._call_gemini(prompt, images=images, json_mode=json_mode, model=model)
        except Exception:
            return self._call_gemini(
                prompt, images=images, json_mode=json_mode, model="gemini-2.0-flash"
            )


_singleton: GemmaClient | None = None


def get_gemma_client() -> GemmaClient:
    global _singleton
    if _singleton is None:
        from app.config import settings
        _singleton = GemmaClient(
            api_key=settings.google_api_key,
            ollama_base_url=settings.ollama_base_url,
            ollama_model=settings.ollama_model,
        )
    return _singleton
