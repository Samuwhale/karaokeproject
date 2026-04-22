from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes.imports import router as imports_router
from backend.api.routes.assets import router as assets_router
from backend.api.routes.exports import router as exports_router
from backend.api.routes.settings import router as settings_router
from backend.api.routes.system import router as system_router
from backend.api.routes.tracks import router as tracks_router
from backend.core.config import get_runtime_settings
from backend.db.session import SessionLocal, init_database
from backend.services.tracks import backfill_content_hashes


@asynccontextmanager
async def lifespan(_: FastAPI):
    runtime_settings = get_runtime_settings()
    runtime_settings.ensure_directories()
    init_database()
    with SessionLocal() as session:
        backfill_content_hashes(session)
    yield


runtime_settings = get_runtime_settings()
app = FastAPI(
    title="Local Karaoke Generator API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[runtime_settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(tracks_router, prefix="/api")
app.include_router(imports_router, prefix="/api")
app.include_router(exports_router, prefix="/api")
app.include_router(assets_router, prefix="/api")
