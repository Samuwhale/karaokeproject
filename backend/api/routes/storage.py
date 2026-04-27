from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.dependencies import get_db_session, get_settings_dependency
from backend.core.config import RuntimeSettings
from backend.schemas.storage import (
    ExportBundleCleanupResponse,
    LibraryResetResponse,
    NonKeeperCleanupResponse,
    StorageOverviewResponse,
    TempCleanupResponse,
)
from backend.services.settings import get_or_create_settings
from backend.services.storage import (
    cleanup_export_bundles,
    cleanup_non_keeper_runs_library,
    cleanup_temp_storage,
    collect_storage_overview,
    reset_library,
    resolve_storage_paths,
)

router = APIRouter(tags=["storage"])


@router.get("/storage", response_model=StorageOverviewResponse)
def get_storage_overview(
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> StorageOverviewResponse:
    return collect_storage_overview(session, runtime_settings)


@router.post("/storage/cleanup/temp", response_model=TempCleanupResponse)
def cleanup_temp_endpoint(
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> TempCleanupResponse:
    settings = get_or_create_settings(session, runtime_settings)
    storage_paths = resolve_storage_paths(runtime_settings, settings)
    return cleanup_temp_storage(storage_paths)


@router.post("/storage/cleanup/export-bundles", response_model=ExportBundleCleanupResponse)
def cleanup_export_bundles_endpoint(
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> ExportBundleCleanupResponse:
    settings = get_or_create_settings(session, runtime_settings)
    storage_paths = resolve_storage_paths(runtime_settings, settings)
    return cleanup_export_bundles(storage_paths)


@router.post("/storage/cleanup/non-keeper-runs", response_model=NonKeeperCleanupResponse)
def cleanup_non_keeper_runs_endpoint(
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> NonKeeperCleanupResponse:
    return cleanup_non_keeper_runs_library(session, runtime_settings)


@router.post("/storage/reset", response_model=LibraryResetResponse)
def reset_library_endpoint(
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> LibraryResetResponse:
    return reset_library(session, runtime_settings)
