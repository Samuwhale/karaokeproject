from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from backend.core.config import RuntimeSettings
from backend.db.models import Run, RunStatus, Track
from backend.schemas.exports import (
    ExportArtifactKind,
    ExportBundleRequest,
    ExportBundleResponse,
    ExportBundleSkip,
    ExportOutputMode,
    ExportPlanArtifact,
    ExportPlanRequest,
    ExportPlanResponse,
    ExportPlanTrack,
    ExportRunSelector,
)
from backend.services.tracks import get_track


# Maps request artifact kind to the RunArtifact.kind stored in the DB.
_RUN_ARTIFACT_KIND = {
    ExportArtifactKind.instrumental_wav: "export-audio-wav",
    ExportArtifactKind.instrumental_mp3: "export-audio-mp3",
    ExportArtifactKind.vocals_wav: "export-vocals",
    ExportArtifactKind.metadata: "metadata",
}


@dataclass(frozen=True)
class _ResolvedFile:
    arcname: str
    path: Path


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "track"


def _bundle_root(runtime_settings: RuntimeSettings) -> Path:
    return Path(runtime_settings.exports_dir) / "bundles"


def bundle_path(runtime_settings: RuntimeSettings, job_id: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise ValueError("Invalid bundle id.")
    return _bundle_root(runtime_settings) / f"{job_id}.zip"


def _select_run(
    track: Track, selector: ExportRunSelector
) -> tuple[Run | None, bool]:
    """Return (run, fell_back_to_latest). fell_back_to_latest is True iff the
    selector was 'keeper' but the track had no keeper set, so we used the
    latest completed run instead.
    """
    if selector == ExportRunSelector.keeper and track.keeper_run_id:
        for run in track.runs:
            if run.id == track.keeper_run_id:
                return run, False
    completed = [run for run in track.runs if run.status == RunStatus.completed.value]
    if not completed:
        return None, False
    latest = sorted(completed, key=lambda run: run.created_at, reverse=True)[0]
    fell_back = selector == ExportRunSelector.keeper
    return latest, fell_back


@dataclass(frozen=True)
class _ResolvedArtifact:
    kind: ExportArtifactKind
    file: _ResolvedFile | None
    present: bool
    size_bytes: int | None
    missing_reason: str | None


def _resolve_artifact(
    track: Track, run: Run, kind: ExportArtifactKind
) -> _ResolvedArtifact:
    if kind == ExportArtifactKind.source:
        source_path = Path(track.source_path)
        if not source_path.is_file():
            return _ResolvedArtifact(kind, None, False, None, "source file is not on disk")
        return _ResolvedArtifact(
            kind,
            _ResolvedFile(arcname=f"source{source_path.suffix}", path=source_path),
            True,
            source_path.stat().st_size,
            None,
        )

    artifact_kind = _RUN_ARTIFACT_KIND[kind]
    artifact = next((a for a in run.artifacts if a.kind == artifact_kind), None)
    if artifact is None:
        return _ResolvedArtifact(kind, None, False, None, "not produced by this run")

    artifact_path = Path(artifact.path)
    if not artifact_path.is_file():
        return _ResolvedArtifact(kind, None, False, None, "file missing on disk")

    return _ResolvedArtifact(
        kind,
        _ResolvedFile(arcname=f"{kind.value}{artifact_path.suffix}", path=artifact_path),
        True,
        artifact_path.stat().st_size,
        None,
    )


def _resolve_track_files(
    track: Track,
    run: Run,
    requested: list[ExportArtifactKind],
) -> tuple[list[_ResolvedFile], list[str]]:
    """Return (files_to_include, missing_artifact_reasons) for one track."""
    files: list[_ResolvedFile] = []
    missing: list[str] = []
    for kind in requested:
        resolved = _resolve_artifact(track, run, kind)
        if resolved.file is not None:
            files.append(resolved.file)
        else:
            missing.append(resolved.missing_reason or "unavailable")
    return files, missing


def build_export_bundle(
    session: Session,
    runtime_settings: RuntimeSettings,
    payload: ExportBundleRequest,
) -> ExportBundleResponse:
    bundle_root = _bundle_root(runtime_settings)
    bundle_root.mkdir(parents=True, exist_ok=True)

    job_id = uuid4().hex
    output_path = bundle_root / f"{job_id}.zip"

    skipped: list[ExportBundleSkip] = []
    included = 0

    # Collect one entry per track: (folder_name, files)
    entries: list[tuple[str, list[_ResolvedFile]]] = []

    for track_id in payload.track_ids:
        track = get_track(session, track_id)
        if track is None:
            skipped.append(
                ExportBundleSkip(
                    track_id=track_id,
                    track_title="(missing)",
                    reason="track no longer exists",
                )
            )
            continue

        run, _fallback = _select_run(track, payload.run_selector)
        if run is None:
            skipped.append(
                ExportBundleSkip(
                    track_id=track_id,
                    track_title=track.title,
                    reason=(
                        "no keeper run set"
                        if payload.run_selector == ExportRunSelector.keeper
                        else "no completed run yet"
                    ),
                )
            )
            continue

        files, missing = _resolve_track_files(track, run, payload.artifacts)
        if missing and not files:
            skipped.append(
                ExportBundleSkip(
                    track_id=track_id,
                    track_title=track.title,
                    reason="; ".join(missing),
                )
            )
            continue

        folder_name = _slugify(f"{track.title} {track.id[:6]}")
        entries.append((folder_name, files))
        included += 1

    if not entries:
        raise ValueError("No tracks produced exportable files with the chosen settings.")

    if payload.mode == ExportOutputMode.single_bundle:
        _write_single_bundle(output_path, entries)
    else:
        _write_zip_per_track(output_path, entries)

    filename = _default_filename(payload.mode, included)

    return ExportBundleResponse(
        job_id=job_id,
        download_url=f"/api/exports/bundle/{job_id}",
        filename=filename,
        byte_count=output_path.stat().st_size,
        included_track_count=included,
        skipped=skipped,
    )


def _write_single_bundle(output_path: Path, entries: list[tuple[str, list[_ResolvedFile]]]) -> None:
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for folder_name, files in entries:
            for resolved in files:
                zf.write(resolved.path, arcname=f"{folder_name}/{resolved.arcname}")


def _write_zip_per_track(
    output_path: Path, entries: list[tuple[str, list[_ResolvedFile]]]
) -> None:
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_STORED) as outer:
        for folder_name, files in entries:
            inner_bytes = _make_inner_zip(files)
            outer.writestr(f"{folder_name}.zip", inner_bytes)


def _make_inner_zip(files: list[_ResolvedFile]) -> bytes:
    import io

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for resolved in files:
            zf.write(resolved.path, arcname=resolved.arcname)
    return buffer.getvalue()


def plan_export_bundle(
    session: Session,
    payload: ExportPlanRequest,
) -> ExportPlanResponse:
    """Return a read-only manifest of what an export would produce.

    Surfaces per-track / per-artifact presence so the user can see what they
    will actually get before committing to the zip.
    """
    tracks: list[ExportPlanTrack] = []
    total_bytes = 0
    included = 0
    skipped = 0
    using_keeper = 0
    using_latest_fallback = 0

    for track_id in payload.track_ids:
        track = get_track(session, track_id)
        if track is None:
            tracks.append(
                ExportPlanTrack(
                    track_id=track_id,
                    track_title="(deleted)",
                    run_id=None,
                    run_selector_used=None,
                    fallback_to_latest=False,
                    artifacts=[],
                    skip_reason="track no longer exists",
                )
            )
            skipped += 1
            continue

        run, fell_back = _select_run(track, payload.run_selector)
        if run is None:
            tracks.append(
                ExportPlanTrack(
                    track_id=track_id,
                    track_title=track.title,
                    run_id=None,
                    run_selector_used=None,
                    fallback_to_latest=False,
                    artifacts=[],
                    skip_reason=(
                        "no keeper run set"
                        if payload.run_selector == ExportRunSelector.keeper
                        else "no completed run yet"
                    ),
                )
            )
            skipped += 1
            continue

        selector_used = (
            ExportRunSelector.latest if fell_back else payload.run_selector
        )
        if payload.run_selector == ExportRunSelector.keeper:
            if fell_back:
                using_latest_fallback += 1
            else:
                using_keeper += 1

        resolved_artifacts: list[ExportPlanArtifact] = []
        track_bytes = 0
        any_present = False
        for kind in payload.artifacts:
            resolved = _resolve_artifact(track, run, kind)
            resolved_artifacts.append(
                ExportPlanArtifact(
                    kind=resolved.kind,
                    present=resolved.present,
                    size_bytes=resolved.size_bytes,
                    missing_reason=resolved.missing_reason,
                )
            )
            if resolved.present and resolved.size_bytes is not None:
                track_bytes += resolved.size_bytes
                any_present = True

        if any_present:
            included += 1
            total_bytes += track_bytes
            skip_reason = None
        else:
            skipped += 1
            skip_reason = "no requested artifacts are available"

        tracks.append(
            ExportPlanTrack(
                track_id=track_id,
                track_title=track.title,
                run_id=run.id,
                run_selector_used=selector_used,
                fallback_to_latest=fell_back,
                artifacts=resolved_artifacts,
                skip_reason=skip_reason,
            )
        )

    return ExportPlanResponse(
        tracks=tracks,
        included_track_count=included,
        total_bytes=total_bytes,
        skipped_track_count=skipped,
        tracks_using_keeper=using_keeper,
        tracks_using_latest_fallback=using_latest_fallback,
    )


def _default_filename(mode: ExportOutputMode, track_count: int) -> str:
    stamp = uuid4().hex[:8]
    if mode == ExportOutputMode.single_bundle:
        return f"karaoke-bundle-{track_count}-{stamp}.zip"
    return f"karaoke-zips-{track_count}-{stamp}.zip"
