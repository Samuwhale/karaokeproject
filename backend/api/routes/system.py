from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.dependencies import get_db_session, get_settings_dependency
from backend.core.config import RuntimeSettings
from backend.schemas.system import DiagnosticsResponse
from backend.services.diagnostics import collect_diagnostics

router = APIRouter(tags=["system"])


@router.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/diagnostics", response_model=DiagnosticsResponse)
def diagnostics(
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> DiagnosticsResponse:
    return collect_diagnostics(session, runtime_settings)
