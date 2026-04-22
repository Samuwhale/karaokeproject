from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy.orm import Session, selectinload

from backend.adapters.ffmpeg import FfmpegAdapter
from backend.adapters.separator import AudioSeparatorAdapter, SeparationError
from backend.core.config import RuntimeSettings
from backend.core.stems import (
    export_stem_kind,
    stem_display_label,
    stem_display_order,
    stem_kind,
)
from backend.db.models import Run, RunStatus
from backend.services.exporters import bundle_files
from backend.services.metrics import populate_run_metrics
from backend.services.processing import resolve_run_processing
from backend.services.settings import get_or_create_settings
from backend.services.storage import apply_storage_retention, resolve_storage_paths
from backend.services.tracks import (
    add_run_artifact,
    assign_run_metadata,
    is_cancellation_requested,
    mark_run_cancelled,
    set_run_state,
    write_metadata_file,
)


class RunCancelled(Exception):
    pass


def _check_cancellation(session: Session, run: Run) -> None:
    session.refresh(run, attribute_names=["metadata_json", "status"])
    if is_cancellation_requested(run) or run.status == RunStatus.cancelled.value:
        raise RunCancelled()


def process_run(session: Session, runtime_settings: RuntimeSettings, run: Run) -> None:
    session.refresh(run, attribute_names=["track", "artifacts"])
    track = run.track
    ffmpeg_adapter = FfmpegAdapter(runtime_settings)
    separator_adapter = AudioSeparatorAdapter(runtime_settings)
    app_settings = get_or_create_settings(session, runtime_settings)
    storage_paths = resolve_storage_paths(runtime_settings, app_settings)
    processing = resolve_run_processing(run)

    source_path = Path(track.source_path)
    if not source_path.exists():
        set_run_state(
            run,
            status=RunStatus.failed,
            progress=0.0,
            status_message="",
            error_message=f"Source file no longer exists: {source_path}",
        )
        session.commit()
        return

    source_slug = (track.metadata_json or {}).get("source_slug", track.id)
    output_directory = storage_paths.outputs_dir / source_slug / run.id
    work_directory = output_directory / "work"
    raw_stems_directory = work_directory / "raw-stems"
    stems_directory = output_directory / "stems"
    export_directory = output_directory / "export"
    output_directory.mkdir(parents=True, exist_ok=True)

    try:
        _check_cancellation(session, run)
        set_run_state(
            run,
            status=RunStatus.preparing,
            progress=0.1,
            status_message="Probing source audio",
        )
        session.commit()
        metadata = ffmpeg_adapter.probe(source_path)

        _check_cancellation(session, run)
        set_run_state(
            run,
            status=RunStatus.preparing,
            progress=0.2,
            status_message="Normalising loudness",
        )
        session.commit()
        normalized_path = work_directory / "normalized.wav"
        ffmpeg_adapter.normalize(source_path, normalized_path)

        if track.duration_seconds is None:
            track.duration_seconds = metadata.duration_seconds

        assign_run_metadata(
            run,
            output_directory=output_directory,
            metadata_json={
                **(run.metadata_json or {}),
                "sample_rate": metadata.sample_rate,
                "channels": metadata.channels,
                "normalized_source": str(normalized_path.resolve()),
                "processing": processing,
            },
        )
        add_run_artifact(
            run,
            kind="normalized",
            label="Normalized working WAV",
            format_name="WAV",
            path=normalized_path,
        )
        session.commit()

        _check_cancellation(session, run)
        profile_label = processing.get("profile_label") or processing.get("profile_key") or "stem model"
        set_run_state(
            run,
            status=RunStatus.separating,
            progress=0.4,
            status_message=f"Running {profile_label}",
        )
        session.commit()

        separation = separator_adapter.run(
            source_path=normalized_path,
            output_dir=raw_stems_directory,
            model_cache_dir=storage_paths.model_cache_dir,
            model_filename=processing["model_filename"],
        )
        stems_directory.mkdir(parents=True, exist_ok=True)

        ordered_stem_names = sorted(
            separation.stems.keys(),
            key=lambda name: (stem_display_order(name), name),
        )
        stem_wav_paths: dict[str, Path] = {}
        for name in ordered_stem_names:
            raw_path = separation.stems[name]
            suffix = raw_path.suffix.lower() or ".wav"
            stable_path = stems_directory / f"{name}{suffix}"
            shutil.move(raw_path, stable_path)
            stem_wav_paths[name] = stable_path
            add_run_artifact(
                run,
                kind=stem_kind(name),
                label=stem_display_label(name),
                format_name=suffix.lstrip(".").upper() or "WAV",
                path=stable_path,
            )
        session.commit()

        _check_cancellation(session, run)
        set_run_state(
            run,
            status=RunStatus.exporting,
            progress=0.8,
            status_message="Copying stems",
        )
        session.commit()

        export_directory.mkdir(parents=True, exist_ok=True)
        stem_export_wavs: dict[str, Path] = {}
        for name, stem_path in stem_wav_paths.items():
            export_wav = export_directory / f"{name}.wav"
            shutil.copy2(stem_path, export_wav)
            stem_export_wavs[name] = export_wav
            add_run_artifact(
                run,
                kind=export_stem_kind(name, fmt="wav"),
                label=f"{stem_display_label(name)} WAV export",
                format_name="WAV",
                path=export_wav,
            )

        _check_cancellation(session, run)
        bitrate = processing["export_mp3_bitrate"]
        set_run_state(
            run,
            status=RunStatus.exporting,
            progress=0.88,
            status_message=f"Encoding MP3 at {bitrate}",
        )
        session.commit()

        stem_export_mp3s: dict[str, Path] = {}
        for name, export_wav in stem_export_wavs.items():
            export_mp3 = export_directory / f"{name}.mp3"
            ffmpeg_adapter.convert_to_mp3(export_wav, export_mp3, bitrate)
            stem_export_mp3s[name] = export_mp3
            add_run_artifact(
                run,
                kind=export_stem_kind(name, fmt="mp3"),
                label=f"{stem_display_label(name)} MP3 export",
                format_name="MP3",
                path=export_mp3,
            )

        metadata_path = export_directory / "metadata.json"
        write_metadata_file(track, run, metadata_path)

        _check_cancellation(session, run)
        set_run_state(
            run,
            status=RunStatus.exporting,
            progress=0.94,
            status_message="Writing bundle",
        )
        session.commit()

        bundle_path = storage_paths.exports_dir / f"{source_slug}-{run.id}.zip"
        bundle_entries: list[Path] = []
        for name in ordered_stem_names:
            bundle_entries.append(stem_export_wavs[name])
            bundle_entries.append(stem_export_mp3s[name])
        bundle_entries.append(metadata_path)
        bundle_files(bundle_path, bundle_entries)
        add_run_artifact(
            run,
            kind="metadata",
            label="Metadata JSON",
            format_name="JSON",
            path=metadata_path,
        )
        add_run_artifact(
            run,
            kind="package",
            label="Export package",
            format_name="ZIP",
            path=bundle_path,
        )

        set_run_state(
            run,
            status=RunStatus.completed,
            progress=1.0,
            status_message="",
            error_message=None,
        )
        session.commit()
        apply_storage_retention(session, runtime_settings)

        try:
            populate_run_metrics(session, runtime_settings, run)
        except Exception as metrics_error:
            session.rollback()
            run = session.get(Run, run.id, options=[selectinload(Run.artifacts)])
            if run is not None:
                metadata = dict(run.metadata_json or {})
                metadata["metrics_error"] = f"{metrics_error.__class__.__name__}: {metrics_error}"
                run.metadata_json = metadata
                session.commit()
    except RunCancelled:
        session.rollback()
        run = session.get(Run, run.id, options=[selectinload(Run.track), selectinload(Run.artifacts)])
        if run is None:
            return
        shutil.rmtree(output_directory, ignore_errors=True)
        mark_run_cancelled(run)
        session.commit()
    except (RuntimeError, SeparationError) as error:
        session.rollback()
        run = session.get(Run, run.id, options=[selectinload(Run.track), selectinload(Run.artifacts)])
        if run is None:
            return
        set_run_state(
            run,
            status=RunStatus.failed,
            progress=run.progress,
            status_message="",
            error_message=str(error),
        )
        session.commit()
    except Exception as error:
        session.rollback()
        run = session.get(Run, run.id, options=[selectinload(Run.track), selectinload(Run.artifacts)])
        if run is None:
            return
        set_run_state(
            run,
            status=RunStatus.failed,
            progress=run.progress,
            status_message="",
            error_message=f"Unexpected processing error: {error.__class__.__name__}: {error}",
        )
        session.commit()
