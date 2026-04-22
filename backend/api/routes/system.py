import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.dependencies import get_db_session, get_settings_dependency
from backend.core.config import RuntimeSettings
from backend.schemas.system import (
    DiagnosticsResponse,
    RevealFolderKind,
    RevealFolderRequest,
    RevealFolderResponse,
)
from backend.services.diagnostics import collect_diagnostics
from backend.services.exports import bundle_path
from backend.services.settings import get_or_create_settings
from backend.services.storage import resolve_storage_paths
from backend.services.tracks import get_track

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


def _resolve_reveal_target(
    payload: RevealFolderRequest,
    session: Session,
    runtime_settings: RuntimeSettings,
) -> tuple[Path, bool]:
    """Resolve the filesystem target to reveal. Returns (path, is_file)."""
    settings = get_or_create_settings(session, runtime_settings)
    storage_paths = resolve_storage_paths(runtime_settings, settings)
    if payload.kind == RevealFolderKind.exports:
        return storage_paths.exports_dir, False
    if payload.kind == RevealFolderKind.outputs:
        return storage_paths.outputs_dir, False
    if payload.kind == RevealFolderKind.bundle:
        if not payload.job_id:
            raise HTTPException(status_code=400, detail="job_id is required to reveal a bundle.")
        try:
            return bundle_path(session, runtime_settings, payload.job_id), True
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    if not payload.track_id:
        raise HTTPException(status_code=400, detail="track_id is required for this folder kind.")
    track = get_track(session, payload.track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")
    source_slug = (track.metadata_json or {}).get("source_slug") or track.id
    return storage_paths.outputs_dir / source_slug, False


@router.post("/system/reveal", response_model=RevealFolderResponse)
def reveal_folder(
    payload: RevealFolderRequest,
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> RevealFolderResponse:
    if sys.platform != "darwin":
        raise HTTPException(
            status_code=501,
            detail="Revealing paths is only supported on macOS for this local tool.",
        )

    path, is_file = _resolve_reveal_target(payload, session, runtime_settings)
    path = path.resolve()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Path does not exist yet: {path}")

    # `open -R` selects the item in Finder (parent directory opens, item highlighted).
    args = ["open", "-R", str(path)] if is_file else ["open", str(path)]
    subprocess.run(args, check=False)
    return RevealFolderResponse(path=str(path))
