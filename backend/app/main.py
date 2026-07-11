from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.routes import extract as extract_router
from app.routes import chat as chat_router
from app.routes import brief as brief_router
from app.routes import live as live_router
from app.routes import live_camera as live_camera_router

app = FastAPI(title="healthOS backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.state.limiter = chat_router.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(extract_router.router)
app.include_router(chat_router.router)
app.include_router(brief_router.router)
app.include_router(live_router.router)
app.include_router(live_camera_router.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
