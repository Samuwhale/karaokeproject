from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.dependencies import get_db_session, get_settings_dependency
from backend.core.config import RuntimeSettings
from backend.schemas.models import CachedModelsResponse
from backend.services.models import list_cached_models

router = APIRouter(tags=["models"])


@router.get("/models/cached", response_model=CachedModelsResponse)
def get_cached_models(
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> CachedModelsResponse:
    return list_cached_models(session, runtime_settings)
