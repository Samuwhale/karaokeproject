from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.dependencies import get_db_session
from backend.db.models import RunArtifact

router = APIRouter(tags=["artifacts"])


@router.get("/artifacts/{artifact_id}")
def download_artifact(artifact_id: str, session: Session = Depends(get_db_session)) -> FileResponse:
    artifact = session.scalars(select(RunArtifact).where(RunArtifact.id == artifact_id)).first()
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found.")

    artifact_path = Path(artifact.path)
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Artifact file is missing on disk.")

    return FileResponse(path=artifact_path, filename=artifact_path.name)
