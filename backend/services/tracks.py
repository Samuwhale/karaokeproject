from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, BinaryIO
from uuid import uuid4

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from backend.core.constants import SUPPORTED_IMPORT_EXTENSIONS
from backend.db.models import Run, RunArtifact, RunStatus, Track
from backend.schemas.tracks import (
    RunArtifactResponse,
    RunDetailResponse,
    RunSummaryResponse,
    TrackDetailResponse,
    TrackSummaryResponse,
)
from backend.services.processing import resolve_run_processing, serialize_processing_config


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "track"


def _artifact_download_url(artifact_id: str) -> str:
    return f"/api/artifacts/{artifact_id}"


def _track_source_download_url(track_id: str) -> str:
    return f"/api/tracks/{track_id}/source"


def _source_format(source_filename: str) -> str:
    return Path(source_filename).suffix.lstrip(".").upper() or "FILE"


def _track_source_type(track: Track) -> str:
    metadata = track.metadata_json or {}
    source_type = metadata.get("source_type")
    return str(source_type) if source_type else "file"


def _track_source_url(track: Track) -> str | None:
    metadata = track.metadata_json or {}
    source_url = metadata.get("source_url")
    return str(source_url) if source_url else None


def _track_thumbnail_url(track: Track) -> str | None:
    metadata = track.metadata_json or {}
    thumbnail_url = metadata.get("thumbnail_url")
    return str(thumbnail_url) if thumbnail_url else None


def _build_track_query() -> Select[tuple[Track]]:
    return select(Track).options(selectinload(Track.runs).selectinload(Run.artifacts))


def _sorted_runs(track: Track) -> list[Run]:
    return sorted(track.runs, key=lambda run: run.created_at, reverse=True)


def serialize_run_artifact(artifact: RunArtifact) -> RunArtifactResponse:
    return RunArtifactResponse(
        id=artifact.id,
        kind=artifact.kind,
        label=artifact.label,
        format=artifact.format,
        path=artifact.path,
        created_at=artifact.created_at,
        download_url=_artifact_download_url(artifact.id),
    )


def serialize_run_summary(run: Run) -> RunSummaryResponse:
    return RunSummaryResponse(
        id=run.id,
        preset=run.preset,
        processing=serialize_processing_config(resolve_run_processing(run)),
        status=run.status,
        progress=run.progress,
        status_message=run.status_message,
        error_message=run.error_message,
        output_directory=run.output_directory,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def serialize_run_detail(run: Run) -> RunDetailResponse:
    return RunDetailResponse(
        **serialize_run_summary(run).model_dump(),
        metadata_json=run.metadata_json or {},
        artifacts=[serialize_run_artifact(artifact) for artifact in run.artifacts],
    )


def serialize_track_summary(track: Track) -> TrackSummaryResponse:
    runs = _sorted_runs(track)
    latest_run = runs[0] if runs else None
    return TrackSummaryResponse(
        id=track.id,
        title=track.title,
        artist=track.artist,
        source_type=_track_source_type(track),
        source_url=_track_source_url(track),
        thumbnail_url=_track_thumbnail_url(track),
        source_filename=track.source_filename,
        duration_seconds=track.duration_seconds,
        created_at=track.created_at,
        updated_at=track.updated_at,
        latest_run=serialize_run_summary(latest_run) if latest_run else None,
        run_count=len(runs),
    )


def serialize_track_detail(track: Track) -> TrackDetailResponse:
    return TrackDetailResponse(
        id=track.id,
        title=track.title,
        artist=track.artist,
        source_type=_track_source_type(track),
        source_url=_track_source_url(track),
        thumbnail_url=_track_thumbnail_url(track),
        source_filename=track.source_filename,
        source_format=_source_format(track.source_filename),
        source_download_url=_track_source_download_url(track.id),
        duration_seconds=track.duration_seconds,
        metadata_json=track.metadata_json or {},
        created_at=track.created_at,
        updated_at=track.updated_at,
        runs=[serialize_run_detail(run) for run in _sorted_runs(track)],
    )


def list_tracks(session: Session) -> list[Track]:
    statement = _build_track_query().order_by(Track.updated_at.desc())
    return list(session.scalars(statement))


def list_track_library(session: Session) -> list[Track]:
    statement = select(Track).order_by(Track.updated_at.desc())
    return list(session.scalars(statement))


def get_track(session: Session, track_id: str) -> Track | None:
    statement = _build_track_query().where(Track.id == track_id)
    return session.scalars(statement).first()


def create_tracks_from_uploads(
    session: Session,
    uploads_dir: Path,
    files: list[tuple[str, BinaryIO]],
    processing: dict[str, str],
    artist: str | None,
) -> list[Track]:
    tracks: list[Track] = []
    for original_name, file_handle in files:
        extension = Path(original_name).suffix.lower()
        if extension not in SUPPORTED_IMPORT_EXTENSIONS:
            raise ValueError(f"Unsupported file type '{extension or 'unknown'}' for '{original_name}'.")

        stored_name = f"{uuid4().hex}{extension}"
        stored_path = uploads_dir / stored_name
        with stored_path.open("wb") as output_file:
            shutil.copyfileobj(file_handle, output_file)

        title = Path(original_name).stem.replace("_", " ").strip() or "Untitled Track"
        track = create_track(
            session,
            source_path=stored_path,
            source_filename=original_name,
            title=title,
            artist=artist,
            processing=processing,
            source_metadata={"source_type": "file"},
        )
        tracks.append(track)

    return tracks


def create_track(
    session: Session,
    *,
    source_path: Path,
    source_filename: str,
    title: str,
    artist: str | None,
    processing: dict[str, str],
    source_metadata: dict[str, Any] | None = None,
) -> Track:
    clean_title = title.strip() or "Untitled Track"
    clean_artist = artist.strip() if artist else None
    metadata = {
        "source_slug": _slugify(clean_title),
        "source_type": "file",
    }
    if source_metadata:
        metadata.update(source_metadata)

    track = Track(
        title=clean_title,
        artist=clean_artist or None,
        source_filename=source_filename,
        source_path=str(source_path.resolve()),
        metadata_json=metadata,
    )
    session.add(track)
    session.flush()
    create_run(track, processing)
    return track


def create_run(track: Track, processing: dict[str, str]) -> Run:
    track.updated_at = datetime.utcnow()
    run = Run(
        track_id=track.id,
        preset=processing["profile_key"],
        status=RunStatus.queued.value,
        progress=0.0,
        status_message="Queued for processing",
        metadata_json={"processing": processing},
    )
    run.artifacts.append(
        RunArtifact(
            kind="source",
            label="Imported source",
            format=_source_format(track.source_filename),
            path=track.source_path,
        )
    )
    track.runs.append(run)
    return run


def add_run_artifact(
    run: Run,
    *,
    kind: str,
    label: str,
    format_name: str,
    path: Path,
) -> RunArtifact:
    artifact = RunArtifact(
        kind=kind,
        label=label,
        format=format_name,
        path=str(path.resolve()),
    )
    run.artifacts.append(artifact)
    return artifact


def set_run_state(
    run: Run,
    *,
    status: RunStatus,
    progress: float,
    status_message: str,
    error_message: str | None = None,
) -> Run:
    run.status = status.value
    run.progress = progress
    run.status_message = status_message
    run.error_message = error_message
    return run


def assign_run_metadata(run: Run, *, output_directory: Path, metadata_json: dict[str, Any]) -> Run:
    run.output_directory = str(output_directory.resolve())
    run.metadata_json = metadata_json
    return run


def claim_next_run(session: Session) -> Run | None:
    statement = (
        select(Run)
        .options(selectinload(Run.track), selectinload(Run.artifacts))
        .where(Run.status == RunStatus.queued.value)
        .order_by(Run.created_at.asc())
    )
    run = session.scalars(statement).first()
    if run is None:
        return None

    set_run_state(
        run,
        status=RunStatus.preparing,
        progress=0.05,
        status_message="Claimed by worker",
    )
    session.flush()
    return run


def write_metadata_file(track: Track, run: Run, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(
        json.dumps(
            {
                "track": {
                    "id": track.id,
                    "title": track.title,
                    "artist": track.artist,
                    "source_filename": track.source_filename,
                    "duration_seconds": track.duration_seconds,
                    "metadata": track.metadata_json or {},
                },
                "run": {
                    "id": run.id,
                    "preset": run.preset,
                    "status": run.status,
                    "progress": run.progress,
                    "status_message": run.status_message,
                    "metadata": run.metadata_json or {},
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
