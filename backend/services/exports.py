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


def _select_run(track: Track, selector: ExportRunSelector) -> Run | None:
    if selector == ExportRunSelector.keeper and track.keeper_run_id:
        for run in track.runs:
            if run.id == track.keeper_run_id:
                return run
    completed = [run for run in track.runs if run.status == RunStatus.completed.value]
    if not completed:
        return None
    return sorted(completed, key=lambda run: run.created_at, reverse=True)[0]


def _resolve_track_files(
    track: Track,
    run: Run,
    requested: list[ExportArtifactKind],
) -> tuple[list[_ResolvedFile], list[str]]:
    """Return (files_to_include, missing_artifact_reasons) for one track."""
    files: list[_ResolvedFile] = []
    missing: list[str] = []

    for kind in requested:
        if kind == ExportArtifactKind.source:
            source_path = Path(track.source_path)
            if source_path.is_file():
                files.append(
                    _ResolvedFile(
                        arcname=f"source{source_path.suffix}",
                        path=source_path,
                    )
                )
            else:
                missing.append("source file is not on disk")
            continue

        artifact_kind = _RUN_ARTIFACT_KIND[kind]
        artifact = next(
            (a for a in run.artifacts if a.kind == artifact_kind),
            None,
        )
        if artifact is None:
            missing.append(f"no '{artifact_kind}' artifact")
            continue

        artifact_path = Path(artifact.path)
        if not artifact_path.is_file():
            missing.append(f"'{artifact_kind}' file missing on disk")
            continue

        files.append(
            _ResolvedFile(
                arcname=f"{kind.value}{artifact_path.suffix}",
                path=artifact_path,
            )
        )

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

        run = _select_run(track, payload.run_selector)
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


def _default_filename(mode: ExportOutputMode, track_count: int) -> str:
    stamp = uuid4().hex[:8]
    if mode == ExportOutputMode.single_bundle:
        return f"karaoke-bundle-{track_count}-{stamp}.zip"
    return f"karaoke-zips-{track_count}-{stamp}.zip"
