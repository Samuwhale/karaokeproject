from __future__ import annotations

import shutil
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from backend.core.config import RuntimeSettings
from backend.db.models import ACTIVE_RUN_STATUSES, AppSettings, Track
from backend.schemas.storage import (
    ExportBundleCleanupResponse,
    NonKeeperCleanupResponse,
    StorageBucketKey,
    StorageBucketResponse,
    StorageOverviewResponse,
    TempCleanupResponse,
)
from backend.services.tracks import list_tracks, purge_non_keeper_runs


@dataclass(frozen=True)
class StoragePaths:
    database_path: Path
    uploads_dir: Path
    outputs_dir: Path
    exports_dir: Path
    temp_dir: Path
    model_cache_dir: Path

    @property
    def export_bundles_dir(self) -> Path:
        return self.exports_dir / "bundles"

    def ensure_directories(self) -> None:
        for directory in (
            self.database_path.parent,
            self.uploads_dir,
            self.outputs_dir,
            self.exports_dir,
            self.export_bundles_dir,
            self.temp_dir,
            self.model_cache_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)


def resolve_storage_paths(runtime_settings: RuntimeSettings, settings: AppSettings) -> StoragePaths:
    uploads_dir = Path(settings.uploads_directory or runtime_settings.uploads_dir).expanduser().resolve()
    outputs_dir = Path(settings.outputs_directory or runtime_settings.output_dir).expanduser().resolve()
    exports_dir = Path(settings.exports_directory or runtime_settings.exports_dir).expanduser().resolve()
    temp_dir = Path(settings.temp_directory or runtime_settings.temp_dir).expanduser().resolve()
    model_cache_dir = Path(settings.model_cache_directory or runtime_settings.model_cache_dir).expanduser().resolve()
    paths = StoragePaths(
        database_path=runtime_settings.database_path.expanduser().resolve(),
        uploads_dir=uploads_dir,
        outputs_dir=outputs_dir,
        exports_dir=exports_dir,
        temp_dir=temp_dir,
        model_cache_dir=model_cache_dir,
    )
    paths.ensure_directories()
    return paths


def file_size(path: Path) -> int:
    try:
        return path.stat().st_size if path.is_file() else 0
    except OSError:
        return 0


def directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return file_size(path)

    total = 0
    for entry in path.rglob("*"):
        if entry.is_file():
            total += file_size(entry)
    return total


def entry_count(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return 1
    return sum(1 for _ in path.rglob("*"))


def _iter_export_download_entries(paths: StoragePaths) -> list[Path]:
    if not paths.exports_dir.is_dir():
        return []

    entries: list[Path] = []
    for child in sorted(paths.exports_dir.iterdir()):
        if child == paths.export_bundles_dir:
            if child.is_dir():
                entries.extend(
                    sorted(path for path in child.iterdir() if path.is_file() or path.is_dir())
                )
            continue
        if child.is_file() or child.is_dir():
            entries.append(child)
    return entries


def _delete_path(path: Path) -> tuple[int, int]:
    if not path.exists():
        return 0, 0
    reclaimed = directory_size(path)
    deleted = entry_count(path)
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
    else:
        path.unlink(missing_ok=True)
    return deleted, reclaimed


def _live_output_directories(session: Session) -> set[Path]:
    live: set[Path] = set()
    for track in list_tracks(session):
        for run in track.runs:
            if not run.output_directory:
                continue
            live.add(Path(run.output_directory).resolve())
    return live


def _iter_orphaned_output_entries(
    session: Session,
    paths: StoragePaths,
) -> list[Path]:
    if not paths.outputs_dir.is_dir():
        return []

    live_output_dirs = _live_output_directories(session)
    orphans: list[Path] = []
    for track_dir in sorted(paths.outputs_dir.iterdir()):
        if not track_dir.is_dir():
            orphans.append(track_dir)
            continue

        live_children = 0
        for child in sorted(track_dir.iterdir()):
            if child.resolve() in live_output_dirs:
                live_children += 1
                continue
            orphans.append(child)

        if live_children == 0 and not any(child.resolve() in live_output_dirs for child in [track_dir]):
            if not any(path.parent == track_dir.resolve() for path in live_output_dirs):
                orphans.append(track_dir)

    # A parent may have been queued after its children; delete children first.
    unique = {path.resolve(): path for path in orphans}
    return sorted(unique.values(), key=lambda path: len(path.parts), reverse=True)


def orphaned_output_bytes(
    session: Session,
    paths: StoragePaths,
) -> int:
    return sum(directory_size(path) for path in _iter_orphaned_output_entries(session, paths))


def cleanup_orphaned_output_artifacts(
    session: Session,
    runtime_settings: RuntimeSettings,
) -> tuple[int, int]:
    from backend.services.settings import get_or_create_settings

    settings = get_or_create_settings(session, runtime_settings)
    paths = resolve_storage_paths(runtime_settings, settings)
    deleted = 0
    reclaimed = 0

    for path in _iter_orphaned_output_entries(session, paths):
        child_deleted, child_reclaimed = _delete_path(path)
        deleted += child_deleted
        reclaimed += child_reclaimed

    return deleted, reclaimed


def cleanup_temp_storage(paths: StoragePaths, *, older_than: timedelta | None = None) -> TempCleanupResponse:
    deleted = 0
    reclaimed = 0
    cutoff = datetime.utcnow() - older_than if older_than is not None else None
    if not paths.temp_dir.is_dir():
        return TempCleanupResponse(deleted_entry_count=0, bytes_reclaimed=0)

    for child in list(paths.temp_dir.iterdir()):
        if cutoff is not None:
            try:
                modified_at = datetime.utcfromtimestamp(child.stat().st_mtime)
            except OSError:
                continue
            if modified_at > cutoff:
                continue
        child_deleted, child_reclaimed = _delete_path(child)
        deleted += child_deleted
        reclaimed += child_reclaimed

    return TempCleanupResponse(deleted_entry_count=deleted, bytes_reclaimed=reclaimed)


def cleanup_export_bundles(
    paths: StoragePaths,
    *,
    older_than: timedelta | None = None,
) -> ExportBundleCleanupResponse:
    deleted = 0
    reclaimed = 0
    cutoff = datetime.utcnow() - older_than if older_than is not None else None

    for path in _iter_export_download_entries(paths):
        if cutoff is not None:
            try:
                modified_at = datetime.utcfromtimestamp(path.stat().st_mtime)
            except OSError:
                continue
            if modified_at > cutoff:
                continue
        _, child_reclaimed = _delete_path(path)
        reclaimed += child_reclaimed
        deleted += 1

    return ExportBundleCleanupResponse(deleted_bundle_count=deleted, bytes_reclaimed=reclaimed)


def apply_storage_retention(session: Session, runtime_settings: RuntimeSettings) -> None:
    from backend.services.settings import get_or_create_settings

    settings = get_or_create_settings(session, runtime_settings)
    paths = resolve_storage_paths(runtime_settings, settings)
    cleanup_orphaned_output_artifacts(session, runtime_settings)
    cleanup_temp_storage(paths, older_than=timedelta(hours=settings.temp_max_age_hours or 24))
    cleanup_export_bundles(
        paths,
        older_than=timedelta(days=settings.export_bundle_max_age_days or 7),
    )


def _sum_unique_paths(paths: set[Path]) -> int:
    return sum(directory_size(path) for path in paths)


def _non_keeper_reclaimable_bytes(track: Track) -> int:
    if not track.keeper_run_id:
        return 0
    reclaimable = 0
    seen_paths: set[Path] = set()
    for run in track.runs:
        if run.id == track.keeper_run_id:
            continue
        if run.status not in {"completed", "failed", "cancelled"}:
            continue
        if run.output_directory:
            seen_paths.add(Path(run.output_directory))
        for artifact in run.artifacts:
            if artifact.kind == "source":
                continue
            artifact_path = Path(artifact.path)
            if run.output_directory and artifact_path.is_relative_to(Path(run.output_directory)):
                continue
            seen_paths.add(artifact_path)
    reclaimable += _sum_unique_paths(seen_paths)
    return reclaimable


def collect_storage_overview(
    session: Session,
    runtime_settings: RuntimeSettings,
) -> StorageOverviewResponse:
    from backend.services.settings import get_or_create_settings

    settings = get_or_create_settings(session, runtime_settings)
    paths = resolve_storage_paths(runtime_settings, settings)
    library_tracks = list_tracks(session)

    upload_paths = {Path(track.source_path) for track in library_tracks if track.source_path}
    non_keeper_reclaimable = sum(_non_keeper_reclaimable_bytes(track) for track in library_tracks)
    orphan_outputs_reclaimable = orphaned_output_bytes(session, paths)
    export_download_bytes = directory_size(paths.exports_dir)

    items = [
        StorageBucketResponse(
            key=StorageBucketKey.database,
            label="Database",
            path=str(paths.database_path),
            total_bytes=file_size(paths.database_path),
            reclaimable_bytes=0,
        ),
        StorageBucketResponse(
            key=StorageBucketKey.uploads,
            label="Source uploads",
            path=str(paths.uploads_dir),
            total_bytes=_sum_unique_paths(upload_paths),
            reclaimable_bytes=0,
        ),
        StorageBucketResponse(
            key=StorageBucketKey.outputs,
            label="Run outputs",
            path=str(paths.outputs_dir),
            total_bytes=directory_size(paths.outputs_dir),
            reclaimable_bytes=non_keeper_reclaimable + orphan_outputs_reclaimable,
        ),
        StorageBucketResponse(
            key=StorageBucketKey.export_bundles,
            label="Export downloads",
            path=str(paths.exports_dir),
            total_bytes=export_download_bytes,
            reclaimable_bytes=export_download_bytes,
        ),
        StorageBucketResponse(
            key=StorageBucketKey.temp,
            label="Temp workspace",
            path=str(paths.temp_dir),
            total_bytes=directory_size(paths.temp_dir),
            reclaimable_bytes=directory_size(paths.temp_dir),
        ),
        StorageBucketResponse(
            key=StorageBucketKey.model_cache,
            label="Model cache",
            path=str(paths.model_cache_dir),
            total_bytes=directory_size(paths.model_cache_dir),
            reclaimable_bytes=0,
        ),
    ]
    total_bytes = sum(item.total_bytes for item in items)
    return StorageOverviewResponse(items=items, total_bytes=total_bytes)


def cleanup_non_keeper_runs_library(
    session: Session,
    runtime_settings: RuntimeSettings,
) -> NonKeeperCleanupResponse:
    deleted_run_count = 0
    bytes_reclaimed = 0
    purged_track_count = 0
    skipped_track_count = 0

    for track in list_tracks(session):
        if not track.keeper_run_id or any(run.status in ACTIVE_RUN_STATUSES for run in track.runs):
            skipped_track_count += 1
            continue
        deleted, reclaimed = purge_non_keeper_runs(session, track.id)
        if deleted > 0:
            purged_track_count += 1
            deleted_run_count += deleted
            bytes_reclaimed += reclaimed

    _, orphan_bytes_reclaimed = cleanup_orphaned_output_artifacts(session, runtime_settings)
    bytes_reclaimed += orphan_bytes_reclaimed

    return NonKeeperCleanupResponse(
        purged_track_count=purged_track_count,
        skipped_track_count=skipped_track_count,
        deleted_run_count=deleted_run_count,
        bytes_reclaimed=bytes_reclaimed,
    )
