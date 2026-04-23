from __future__ import annotations

import hashlib
import json
import re
import shutil
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, object_session, selectinload

from backend.core.config import RuntimeSettings
from backend.core.stems import is_stem_kind
from backend.db.models import (
    IN_PROGRESS_RUN_STATUSES,
    TERMINAL_RUN_STATUSES,
    Run,
    RunArtifact,
    RunStatus,
    Track,
)
from backend.schemas.tracks import (
    MIX_GAIN_DB_MAX,
    MIX_GAIN_DB_MIN,
    ArtifactMetricsResponse,
    RunArtifactResponse,
    RunDetailResponse,
    RunMixInput,
    RunMixState,
    RunMixStemEntry,
    RunSummaryResponse,
    TrackDetailResponse,
    TrackSummaryResponse,
)
from backend.services.processing import (
    build_processing_config,
    resolve_run_processing,
    serialize_processing_config,
)

UNSET = object()


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "track"


def compute_file_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


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


def _serialize_artifact_metrics(metrics: dict[str, Any] | None) -> ArtifactMetricsResponse | None:
    if not metrics:
        return None
    return ArtifactMetricsResponse(
        duration_seconds=metrics.get("duration_seconds"),
        sample_rate=metrics.get("sample_rate"),
        channels=metrics.get("channels"),
        size_bytes=metrics.get("size_bytes"),
        integrated_lufs=metrics.get("integrated_lufs"),
        true_peak_dbfs=metrics.get("true_peak_dbfs"),
        peaks=list(metrics.get("peaks") or []),
    )


def serialize_run_artifact(artifact: RunArtifact) -> RunArtifactResponse:
    return RunArtifactResponse(
        id=artifact.id,
        kind=artifact.kind,
        label=artifact.label,
        format=artifact.format,
        path=artifact.path,
        created_at=artifact.created_at,
        download_url=_artifact_download_url(artifact.id),
        metrics=_serialize_artifact_metrics(artifact.metrics_json),
    )


def _run_note(run: Run) -> str:
    metadata = run.metadata_json or {}
    note = metadata.get("note")
    return note.strip() if isinstance(note, str) else ""


def serialize_run_summary(run: Run) -> RunSummaryResponse:
    return RunSummaryResponse(
        id=run.id,
        processing=serialize_processing_config(resolve_run_processing(run)),
        status=run.status,
        progress=run.progress,
        status_message=run.status_message,
        error_message=run.error_message,
        output_directory=run.output_directory,
        created_at=run.created_at,
        updated_at=run.updated_at,
        note=_run_note(run),
        last_active_status=run.last_active_status,
        dismissed_at=run.dismissed_at,
    )


def mixable_artifacts(run: Run) -> list[RunArtifact]:
    return [artifact for artifact in run.artifacts if is_stem_kind(artifact.kind)]


def _run_has_mixable_stems(run: Run) -> bool:
    return bool(mixable_artifacts(run))


def _is_default_stem(entry: dict[str, Any] | RunMixStemEntry) -> bool:
    gain = getattr(entry, "gain_db", None)
    muted = getattr(entry, "muted", None)
    if gain is None and isinstance(entry, dict):
        gain = entry.get("gain_db")
        muted = entry.get("muted")
    return abs(float(gain or 0.0)) < 0.01 and not bool(muted)


def serialize_run_mix(run: Run) -> RunMixState:
    raw = run.mix_json or {}
    stems_raw = raw.get("stems") if isinstance(raw, dict) else None
    stems: list[RunMixStemEntry] = []
    if isinstance(stems_raw, list):
        for entry in stems_raw:
            if not isinstance(entry, dict):
                continue
            artifact_id = entry.get("artifact_id")
            if not isinstance(artifact_id, str):
                continue
            gain = float(entry.get("gain_db") or 0.0)
            gain = max(MIX_GAIN_DB_MIN, min(MIX_GAIN_DB_MAX, gain))
            stems.append(
                RunMixStemEntry(
                    artifact_id=artifact_id,
                    gain_db=gain,
                    muted=bool(entry.get("muted") or False),
                )
            )
    is_default = all(_is_default_stem(entry) for entry in stems)
    return RunMixState(stems=stems, is_default=is_default)


def serialize_run_detail(run: Run) -> RunDetailResponse:
    return RunDetailResponse(
        **serialize_run_summary(run).model_dump(),
        metadata_json=run.metadata_json or {},
        artifacts=[serialize_run_artifact(artifact) for artifact in run.artifacts],
        mix=serialize_run_mix(run),
    )


def _summary_mix_run(runs: list[Run], keeper_run_id: str | None) -> Run | None:
    if keeper_run_id:
        keeper_run = next(
            (
                run
                for run in runs
                if run.id == keeper_run_id and run.status == RunStatus.completed.value
            ),
            None,
        )
        if keeper_run is not None:
            return keeper_run
    return next((run for run in runs if run.status == RunStatus.completed.value), None)


def set_run_mix(session: Session, track_id: str, run_id: str, payload: RunMixInput) -> Run:
    track = get_track(session, track_id)
    if track is None:
        raise LookupError(f"Track '{track_id}' does not exist.")

    run = session.get(Run, run_id, options=[selectinload(Run.artifacts)])
    if run is None or run.track_id != track.id:
        raise ValueError("Run does not belong to this track.")
    if run.status != RunStatus.completed.value:
        raise ValueError("Only completed runs can have a mix.")

    mixable_ids = {artifact.id for artifact in mixable_artifacts(run)}
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for entry in payload.stems:
        if entry.artifact_id not in mixable_ids:
            raise ValueError(f"Artifact '{entry.artifact_id}' is not a mixable stem for this run.")
        if entry.artifact_id in seen:
            raise ValueError(f"Duplicate mix entry for artifact '{entry.artifact_id}'.")
        seen.add(entry.artifact_id)
        normalized.append(
            {
                "artifact_id": entry.artifact_id,
                "gain_db": float(entry.gain_db),
                "muted": bool(entry.muted),
            }
        )

    run.mix_json = {"version": 1, "stems": normalized}
    session.commit()
    session.refresh(run)
    return run


def serialize_track_summary(track: Track) -> TrackSummaryResponse:
    runs = _sorted_runs(track)
    latest_run = runs[0] if runs else None
    mix_summary_run = _summary_mix_run(runs, track.keeper_run_id)
    has_custom_mix = (
        mix_summary_run is not None
        and not serialize_run_mix(mix_summary_run).is_default
    )
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
        keeper_run_id=track.keeper_run_id,
        has_custom_mix=has_custom_mix,
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
        keeper_run_id=track.keeper_run_id,
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


def backfill_content_hashes(session: Session) -> int:
    updated = 0
    for track in session.scalars(select(Track)):
        metadata = dict(track.metadata_json or {})
        if metadata.get("content_hash"):
            continue
        source_path = Path(track.source_path)
        if not source_path.exists():
            continue
        metadata["content_hash"] = compute_file_sha256(source_path)
        track.metadata_json = metadata
        updated += 1
    if updated:
        session.commit()
    return updated


def create_track(
    session: Session,
    *,
    source_path: Path,
    source_filename: str,
    title: str,
    artist: str | None,
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
    return track


def create_run(track: Track, processing: dict[str, str]) -> Run:
    session = object_session(track)
    if session is not None:
        prune_terminal_runs_without_stems(session, track)

    track.updated_at = datetime.utcnow()
    run = Run(
        track_id=track.id,
        profile_key=processing["profile_key"],
        status=RunStatus.queued.value,
        progress=0.0,
        status_message="",
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
    if status.value in IN_PROGRESS_RUN_STATUSES:
        run.last_active_status = status.value
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
        status_message="",
    )
    session.flush()
    return run


def recover_orphaned_runs(session: Session) -> int:
    statement = select(Run).where(Run.status.in_(list(IN_PROGRESS_RUN_STATUSES)))
    orphaned = list(session.scalars(statement))
    for run in orphaned:
        set_run_state(
            run,
            status=RunStatus.failed,
            progress=run.progress,
            status_message="",
            error_message="Worker restarted before this run could finish.",
        )
    if orphaned:
        session.commit()
    return len(orphaned)


def request_run_cancellation(session: Session, run_id: str) -> Run:
    run = session.get(Run, run_id, options=[selectinload(Run.track), selectinload(Run.artifacts)])
    if run is None:
        raise LookupError(f"Run '{run_id}' does not exist.")

    if run.status == RunStatus.cancelled.value:
        return run
    if run.status in {RunStatus.completed.value, RunStatus.failed.value}:
        raise ValueError(f"Run is already {run.status}; nothing to cancel.")

    if run.status == RunStatus.queued.value:
        set_run_state(
            run,
            status=RunStatus.cancelled,
            progress=run.progress,
            status_message="",
            error_message=None,
        )
    else:
        metadata = dict(run.metadata_json or {})
        metadata["cancellation_requested"] = True
        run.metadata_json = metadata
        run.status_message = "Stopping at next stage"

    session.commit()
    return run


def is_cancellation_requested(run: Run) -> bool:
    metadata = run.metadata_json or {}
    return bool(metadata.get("cancellation_requested"))


def mark_run_cancelled(run: Run) -> None:
    set_run_state(
        run,
        status=RunStatus.cancelled,
        progress=run.progress,
        status_message="",
        error_message=None,
    )
    metadata = dict(run.metadata_json or {})
    metadata.pop("cancellation_requested", None)
    run.metadata_json = metadata


def dismiss_run(session: Session, run_id: str) -> Run:
    run = session.get(Run, run_id, options=[selectinload(Run.track), selectinload(Run.artifacts)])
    if run is None:
        raise LookupError(f"Run '{run_id}' does not exist.")
    if run.status not in TERMINAL_RUN_STATUSES:
        raise ValueError("Only completed, failed, or cancelled runs can be dismissed from the queue.")
    if run.dismissed_at is None:
        run.dismissed_at = datetime.utcnow()
        session.commit()
        session.refresh(run)
    return run


def delete_run(session: Session, run_id: str) -> None:
    run = session.get(Run, run_id, options=[selectinload(Run.track), selectinload(Run.artifacts)])
    if run is None:
        raise LookupError(f"Run '{run_id}' does not exist.")
    if run.status not in TERMINAL_RUN_STATUSES:
        raise ValueError("Only completed, failed, or cancelled runs can be deleted.")
    if run.track and run.track.keeper_run_id == run.id:
        raise ValueError("Clear the final version before deleting this run.")

    if run.track is not None:
        run.track.updated_at = datetime.utcnow()

    _delete_run_files(run, include_source=False)
    session.delete(run)
    session.commit()


def retry_run(session: Session, run_id: str) -> Run:
    source_run = session.get(Run, run_id, options=[selectinload(Run.track)])
    if source_run is None:
        raise LookupError(f"Run '{run_id}' does not exist.")

    stored_processing = (source_run.metadata_json or {}).get("processing")
    if not isinstance(stored_processing, dict) or "profile_key" not in stored_processing:
        raise ValueError("This run does not have a stored processing config to retry from.")

    # Drop the failed/cancelled source run from the queue view so it doesn't
    # sit next to the retry that replaces it.
    if source_run.status in TERMINAL_RUN_STATUSES and source_run.dismissed_at is None:
        source_run.dismissed_at = datetime.utcnow()

    track = source_run.track
    processing: dict[str, str] = {str(key): str(value) for key, value in stored_processing.items()}
    new_run = create_run(track, processing)
    session.commit()
    session.refresh(new_run)
    return new_run


def prune_terminal_runs_without_stems(session: Session, track: Track) -> int:
    deleted = 0
    for run in list(track.runs):
        if run.status not in TERMINAL_RUN_STATUSES:
            continue
        if run.id == track.keeper_run_id:
            continue
        if _run_has_mixable_stems(run):
            continue

        _delete_run_files(run, include_source=False)
        session.delete(run)
        deleted += 1

    return deleted


RUN_NOTE_MAX_LENGTH = 280


def set_run_note(session: Session, run_id: str, note: str) -> Run:
    run = session.get(Run, run_id, options=[selectinload(Run.track), selectinload(Run.artifacts)])
    if run is None:
        raise LookupError(f"Run '{run_id}' does not exist.")

    cleaned = note.strip()
    if len(cleaned) > RUN_NOTE_MAX_LENGTH:
        raise ValueError(f"Note cannot exceed {RUN_NOTE_MAX_LENGTH} characters.")

    metadata = dict(run.metadata_json or {})
    if cleaned:
        metadata["note"] = cleaned
    else:
        metadata.pop("note", None)
    run.metadata_json = metadata
    session.commit()
    session.refresh(run)
    return run


def set_keeper_run(session: Session, track_id: str, run_id: str | None) -> Track:
    track = get_track(session, track_id)
    if track is None:
        raise LookupError(f"Track '{track_id}' does not exist.")

    if run_id is None:
        track.keeper_run_id = None
        session.commit()
        session.refresh(track)
        return track

    run = session.get(Run, run_id)
    if run is None or run.track_id != track.id:
        raise ValueError("Run does not belong to this track.")
    if run.status != RunStatus.completed.value:
        raise ValueError("Only completed runs can be marked as the keeper.")

    track.keeper_run_id = run.id
    session.commit()
    session.refresh(track)
    return track


def _directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for entry in path.rglob("*"):
        if entry.is_file():
            try:
                total += entry.stat().st_size
            except OSError:
                continue
    return total


def update_track(
    session: Session,
    track_id: str,
    *,
    title: str | None,
    artist: str | None | object = UNSET,
) -> Track:
    track = get_track(session, track_id)
    if track is None:
        raise LookupError(f"Track '{track_id}' does not exist.")

    if title is not None:
        clean_title = title.strip()
        if not clean_title:
            raise ValueError("Title cannot be empty.")
        track.title = clean_title
        metadata = dict(track.metadata_json or {})
        metadata["source_slug"] = _slugify(clean_title)
        track.metadata_json = metadata

    if artist is not UNSET:
        clean_artist = artist.strip() if isinstance(artist, str) else None
        clean_artist = clean_artist or None
        track.artist = clean_artist

    session.commit()
    session.refresh(track)
    return track


def delete_track(
    session: Session,
    track_id: str,
) -> None:
    track = get_track(session, track_id)
    if track is None:
        raise LookupError(f"Track '{track_id}' does not exist.")

    if any(run.status in IN_PROGRESS_RUN_STATUSES for run in track.runs):
        raise ValueError("Cancel or wait for in-progress runs before deleting this track.")

    source_path = Path(track.source_path) if track.source_path else None

    for run in list(track.runs):
        _delete_run_files(run, include_source=False)

    session.delete(track)
    session.commit()

    if source_path is not None and source_path.exists():
        source_path.unlink(missing_ok=True)


def purge_non_keeper_runs(
    session: Session,
    track_id: str,
) -> tuple[int, int]:
    track = get_track(session, track_id)
    if track is None:
        raise LookupError(f"Track '{track_id}' does not exist.")
    if not track.keeper_run_id:
        raise ValueError("Set a keeper run before cleaning up other runs.")

    deleted = 0
    reclaimed = 0
    for run in list(track.runs):
        if run.id == track.keeper_run_id:
            continue
        if run.status not in TERMINAL_RUN_STATUSES:
            continue

        reclaimed += _measure_run_files(run, include_source=False)
        _delete_run_files(run, include_source=False)

        session.delete(run)
        deleted += 1

    if deleted:
        session.commit()
    return deleted, reclaimed


def _measure_paths(paths: Iterable[Path]) -> int:
    unique_paths = {path.resolve() for path in paths if path.exists()}
    return sum(_directory_size(path) for path in unique_paths)


def _run_file_paths(run: Run, *, include_source: bool) -> set[Path]:
    paths: set[Path] = set()
    output_root = Path(run.output_directory).resolve() if run.output_directory else None
    if output_root is not None:
        paths.add(output_root)
    for artifact in run.artifacts:
        if not include_source and artifact.kind == "source":
            continue
        artifact_path = Path(artifact.path).resolve()
        if output_root is not None and artifact_path == output_root:
            continue
        if output_root is not None and artifact_path.is_relative_to(output_root):
            continue
        paths.add(artifact_path)
    return paths


def _measure_run_files(run: Run, *, include_source: bool) -> int:
    return _measure_paths(_run_file_paths(run, include_source=include_source))


def _delete_run_files(run: Run, *, include_source: bool) -> None:
    for path in _run_file_paths(run, include_source=include_source):
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        else:
            path.unlink(missing_ok=True)


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
                    "profile_key": run.profile_key,
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
