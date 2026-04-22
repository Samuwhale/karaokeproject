from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from backend.core.config import RuntimeSettings
from backend.core.stems import (
    parse_export_stem_kind,
    stem_display_label,
    stem_display_order,
    stem_name_from_kind,
)
from backend.db.models import Run, RunStatus, Track
from backend.schemas.exports import (
    ExportBundleRequest,
    ExportBundleResponse,
    ExportBundleSkip,
    ExportOutputMode,
    ExportPlanArtifact,
    ExportPlanRequest,
    ExportPlanResponse,
    ExportPlanTrack,
    ExportStemOption,
    ExportStemsRequest,
    ExportStemsResponse,
)
from backend.services.mixing import (
    MIX_MP3_KIND,
    MIX_WAV_KIND,
    ensure_mix_render,
    ensure_stem_mp3,
)
from backend.services.settings import get_or_create_settings
from backend.services.storage import apply_storage_retention, resolve_storage_paths
from backend.services.tracks import get_track, mixable_artifacts


_STATIC_RUN_ARTIFACT_KIND = {
    "mix-wav": MIX_WAV_KIND,
    "mix-mp3": MIX_MP3_KIND,
    "metadata": "metadata",
}

_MIX_KINDS = frozenset({"mix-wav", "mix-mp3"})


def _mix_format(kind: str) -> str:
    return "wav" if kind == "mix-wav" else "mp3"


@dataclass(frozen=True)
class _ResolvedFile:
    arcname: str
    path: Path


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "track"


def _bundle_root(exports_dir: Path) -> Path:
    return exports_dir / "bundles"


def bundle_path(session: Session, runtime_settings: RuntimeSettings, job_id: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise ValueError("Invalid bundle id.")
    settings = get_or_create_settings(session, runtime_settings)
    storage_paths = resolve_storage_paths(runtime_settings, settings)
    return _bundle_root(storage_paths.exports_dir) / f"{job_id}.zip"


def _select_run(track: Track, override_run_id: str | None) -> Run | None:
    """Pick which run to export for this track.

    Caller-supplied override takes priority (lets the UI pin a specific run).
    Otherwise use the most recent completed run — the keeper/Final star is
    purely a cleanup bookmark and no longer gates export.
    """
    if override_run_id:
        for run in track.runs:
            if run.id == override_run_id and run.status == RunStatus.completed.value:
                return run
        return None
    completed = [run for run in track.runs if run.status == RunStatus.completed.value]
    if not completed:
        return None
    return sorted(completed, key=lambda run: run.created_at, reverse=True)[0]


@dataclass(frozen=True)
class _ResolvedArtifact:
    kind: str
    file: _ResolvedFile | None
    present: bool
    size_bytes: int | None
    missing_reason: str | None


def _stem_arcname(stem_name: str, fmt: str) -> str:
    return f"{stem_name}.{fmt}"


def _resolve_artifact(
    track: Track,
    run: Run,
    kind: str,
    *,
    mix_errors: dict[str, str] | None = None,
    stem_mp3_errors: dict[str, str] | None = None,
) -> _ResolvedArtifact:
    if kind == "source":
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

    if kind in _MIX_KINDS:
        return _resolve_mix_artifact(
            run,
            kind,
            render_error=(mix_errors or {}).get(kind),
        )

    stem_parsed = parse_export_stem_kind(kind)
    if stem_parsed is not None:
        fmt, stem_name = stem_parsed
        return _resolve_stem_artifact(
            run,
            kind,
            stem_name=stem_name,
            fmt=fmt,
            encode_error=(stem_mp3_errors or {}).get(stem_name) if fmt == "mp3" else None,
        )

    artifact_kind = _STATIC_RUN_ARTIFACT_KIND.get(kind)
    if artifact_kind is None:
        return _ResolvedArtifact(kind, None, False, None, f"unknown artifact kind: {kind}")

    artifact = next((a for a in run.artifacts if a.kind == artifact_kind), None)
    if artifact is None:
        return _ResolvedArtifact(kind, None, False, None, "not produced by this run")

    artifact_path = Path(artifact.path)
    if not artifact_path.is_file():
        return _ResolvedArtifact(kind, None, False, None, "file missing on disk")

    return _ResolvedArtifact(
        kind,
        _ResolvedFile(arcname=f"{kind}{artifact_path.suffix}", path=artifact_path),
        True,
        artifact_path.stat().st_size,
        None,
    )


def _resolve_stem_artifact(
    run: Run,
    kind: str,
    *,
    stem_name: str,
    fmt: str,
    encode_error: str | None = None,
) -> _ResolvedArtifact:
    if fmt == "wav":
        from backend.core.stems import export_stem_kind

        target_kind = export_stem_kind(stem_name, fmt="wav")
        artifact = next((a for a in run.artifacts if a.kind == target_kind), None)
        if artifact is None:
            return _ResolvedArtifact(kind, None, False, None, f"run has no {stem_name} stem")
        artifact_path = Path(artifact.path)
        if not artifact_path.is_file():
            return _ResolvedArtifact(kind, None, False, None, "file missing on disk")
        return _ResolvedArtifact(
            kind,
            _ResolvedFile(arcname=_stem_arcname(stem_name, fmt), path=artifact_path),
            True,
            artifact_path.stat().st_size,
            None,
        )

    # MP3 stems are encoded on demand during build; at plan time we just check
    # that the underlying WAV stem exists so we can predict availability.
    from backend.core.stems import export_stem_kind

    wav_kind = export_stem_kind(stem_name, fmt="wav")
    wav_artifact = next((a for a in run.artifacts if a.kind == wav_kind), None)
    if wav_artifact is None:
        return _ResolvedArtifact(kind, None, False, None, f"run has no {stem_name} stem")
    if not Path(wav_artifact.path).is_file():
        return _ResolvedArtifact(kind, None, False, None, "stem wav missing on disk")

    if encode_error:
        return _ResolvedArtifact(kind, None, False, None, f"mp3 encode failed: {encode_error}")

    mp3_kind = export_stem_kind(stem_name, fmt="mp3")
    mp3_artifact = next((a for a in run.artifacts if a.kind == mp3_kind), None)
    mp3_path = Path(mp3_artifact.path) if mp3_artifact is not None else None
    if mp3_path is not None and mp3_path.is_file():
        return _ResolvedArtifact(
            kind,
            _ResolvedFile(arcname=_stem_arcname(stem_name, fmt), path=mp3_path),
            True,
            mp3_path.stat().st_size,
            None,
        )

    # Plan time (no encode requested yet) — mp3 is achievable but not yet on
    # disk. Size is unknown until build time encodes it.
    return _ResolvedArtifact(kind, None, True, None, None)


def _resolve_mix_artifact(
    run: Run,
    kind: str,
    *,
    render_error: str | None = None,
) -> _ResolvedArtifact:
    """Mix resolution: present whenever the run has mixable stems.

    Plan never renders — size is the already-rendered artifact's size, if any.
    Build calls ensure_mix_render first, so the artifact file exists on disk
    by the time this function runs and the file is included in the bundle.
    """
    if not mixable_artifacts(run):
        return _ResolvedArtifact(kind, None, False, None, "no stems to mix")

    if render_error:
        return _ResolvedArtifact(kind, None, False, None, f"mix render failed: {render_error}")

    artifact_kind = _STATIC_RUN_ARTIFACT_KIND[kind]
    existing = next((a for a in run.artifacts if a.kind == artifact_kind), None)
    existing_path = Path(existing.path) if existing is not None else None
    file_ready = existing_path is not None and existing_path.is_file()

    if not file_ready:
        # Plan time (no render requested yet) — mix is achievable but not yet
        # on disk. Size is unknown until build time renders it.
        return _ResolvedArtifact(kind, None, True, None, None)

    assert existing_path is not None
    return _ResolvedArtifact(
        kind,
        _ResolvedFile(arcname=f"{kind}{existing_path.suffix}", path=existing_path),
        True,
        existing_path.stat().st_size,
        None,
    )


def _render_requested_mixes(
    session: Session,
    runtime_settings: RuntimeSettings,
    run: Run,
    requested: list[str],
    bitrate: str,
) -> dict[str, str]:
    """Render any requested mix artifacts and collect per-kind failures."""
    errors: dict[str, str] = {}
    for kind in requested:
        if kind not in _MIX_KINDS:
            continue
        try:
            fmt = _mix_format(kind)
            ensure_mix_render(
                session,
                runtime_settings,
                run,
                fmt,
                bitrate=bitrate if fmt == "mp3" else None,
            )
        except Exception as error:  # noqa: BLE001 — surfaced back to user via resolver
            errors[kind] = str(error) or error.__class__.__name__
    return errors


def _encode_requested_stem_mp3s(
    session: Session,
    runtime_settings: RuntimeSettings,
    run: Run,
    requested: list[str],
    bitrate: str,
) -> dict[str, str]:
    """Encode any requested stem mp3s on demand; collect per-stem failures."""
    errors: dict[str, str] = {}
    for kind in requested:
        parsed = parse_export_stem_kind(kind)
        if parsed is None or parsed[0] != "mp3":
            continue
        stem_name = parsed[1]
        try:
            ensure_stem_mp3(session, runtime_settings, run, stem_name, bitrate)
        except Exception as error:  # noqa: BLE001 — surfaced back to user via resolver
            errors[stem_name] = str(error) or error.__class__.__name__
    return errors


def _resolve_track_files(
    track: Track,
    run: Run,
    requested: list[str],
    *,
    mix_errors: dict[str, str] | None = None,
    stem_mp3_errors: dict[str, str] | None = None,
) -> tuple[list[_ResolvedFile], list[str]]:
    """Return (files_to_include, missing_artifact_reasons) for one track."""
    files: list[_ResolvedFile] = []
    missing: list[str] = []
    for kind in requested:
        resolved = _resolve_artifact(
            track,
            run,
            kind,
            mix_errors=mix_errors,
            stem_mp3_errors=stem_mp3_errors,
        )
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
    settings = get_or_create_settings(session, runtime_settings)
    storage_paths = resolve_storage_paths(runtime_settings, settings)
    bundle_root = _bundle_root(storage_paths.exports_dir)
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

        run = _select_run(track, payload.run_ids.get(track_id))
        if run is None:
            skipped.append(
                ExportBundleSkip(
                    track_id=track_id,
                    track_title=track.title,
                    reason="no completed run yet",
                )
            )
            continue

        mix_errors = _render_requested_mixes(
            session, runtime_settings, run, payload.artifacts, payload.bitrate,
        )
        stem_mp3_errors = _encode_requested_stem_mp3s(
            session, runtime_settings, run, payload.artifacts, payload.bitrate,
        )

        files, missing = _resolve_track_files(
            track,
            run,
            payload.artifacts,
            mix_errors=mix_errors,
            stem_mp3_errors=stem_mp3_errors,
        )
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
    apply_storage_retention(session, runtime_settings)

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
    """Return a read-only manifest of what an export would produce."""
    tracks: list[ExportPlanTrack] = []
    total_bytes = 0
    included = 0
    skipped = 0

    for track_id in payload.track_ids:
        track = get_track(session, track_id)
        if track is None:
            tracks.append(
                ExportPlanTrack(
                    track_id=track_id,
                    track_title="(deleted)",
                    run_id=None,
                    artifacts=[],
                    skip_reason="track no longer exists",
                )
            )
            skipped += 1
            continue

        run = _select_run(track, payload.run_ids.get(track_id))
        if run is None:
            tracks.append(
                ExportPlanTrack(
                    track_id=track_id,
                    track_title=track.title,
                    run_id=None,
                    artifacts=[],
                    skip_reason="no completed run yet",
                )
            )
            skipped += 1
            continue

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
            if resolved.present:
                any_present = True
                if resolved.size_bytes is not None:
                    track_bytes += resolved.size_bytes

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
                artifacts=resolved_artifacts,
                skip_reason=skip_reason,
            )
        )

    return ExportPlanResponse(
        tracks=tracks,
        included_track_count=included,
        total_bytes=total_bytes,
        skipped_track_count=skipped,
    )


def list_export_stems(
    session: Session,
    payload: ExportStemsRequest,
) -> ExportStemsResponse:
    """Union of stem names available across the selected tracks' resolved runs.

    Powers the export modal's per-stem checkbox list — the UI only offers
    stems that actually exist, so it stays honest with whatever the models
    actually produced.
    """
    counts: dict[str, int] = {}
    for track_id in payload.track_ids:
        track = get_track(session, track_id)
        if track is None:
            continue
        run = _select_run(track, payload.run_ids.get(track_id))
        if run is None:
            continue
        seen_in_run: set[str] = set()
        for artifact in run.artifacts:
            stem_name = stem_name_from_kind(artifact.kind)
            if stem_name is None or stem_name in seen_in_run:
                continue
            seen_in_run.add(stem_name)
            counts[stem_name] = counts.get(stem_name, 0) + 1

    ordered = sorted(counts.items(), key=lambda pair: (stem_display_order(pair[0]), pair[0]))
    return ExportStemsResponse(
        stems=[
            ExportStemOption(
                name=name,
                label=stem_display_label(name),
                track_count=count,
            )
            for name, count in ordered
        ]
    )


def _default_filename(mode: ExportOutputMode, track_count: int) -> str:
    stamp = uuid4().hex[:8]
    if mode == ExportOutputMode.single_bundle:
        return f"stems-bundle-{track_count}-{stamp}.zip"
    return f"stems-zips-{track_count}-{stamp}.zip"
