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
