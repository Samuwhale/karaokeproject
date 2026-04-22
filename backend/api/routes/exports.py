from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.api.dependencies import get_db_session, get_settings_dependency
from backend.core.config import RuntimeSettings
from backend.schemas.exports import (
    ExportBundleRequest,
    ExportBundleResponse,
    ExportPlanRequest,
    ExportPlanResponse,
)
from backend.services.exports import build_export_bundle, bundle_path, plan_export_bundle

router = APIRouter(tags=["exports"])


@router.post("/exports/bundle", response_model=ExportBundleResponse)
def create_export_bundle(
    payload: ExportBundleRequest,
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> ExportBundleResponse:
    try:
        return build_export_bundle(session, runtime_settings, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/exports/plan", response_model=ExportPlanResponse)
def create_export_plan(
    payload: ExportPlanRequest,
    session: Session = Depends(get_db_session),
) -> ExportPlanResponse:
    return plan_export_bundle(session, payload)


@router.get("/exports/bundle/{job_id}")
def download_export_bundle(
    job_id: str,
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> FileResponse:
    try:
        path = bundle_path(session, runtime_settings, job_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Export bundle is no longer available.")
    return FileResponse(
        path=path,
        filename=path.name,
        content_disposition_type="attachment",
    )
