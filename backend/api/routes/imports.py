from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.dependencies import get_db_session, get_settings_dependency
from backend.core.config import RuntimeSettings
from backend.schemas.imports import (
    ConfirmYouTubeImportRequest,
    ConfirmYouTubeImportResponse,
    ResolveYouTubeImportRequest,
    ResolveYouTubeImportResponse,
)
from backend.services.imports import confirm_youtube_import, resolve_youtube_import

router = APIRouter(tags=["imports"])


@router.post("/imports/youtube/resolve", response_model=ResolveYouTubeImportResponse)
def resolve_import(
    payload: ResolveYouTubeImportRequest,
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> ResolveYouTubeImportResponse:
    try:
        return resolve_youtube_import(session, runtime_settings, payload.source_url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/imports/youtube/confirm", response_model=ConfirmYouTubeImportResponse)
def confirm_import(
    payload: ConfirmYouTubeImportRequest,
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> ConfirmYouTubeImportResponse:
    try:
        return confirm_youtube_import(session, runtime_settings, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(error)) from error
