from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy.orm import Session, selectinload

from backend.adapters.ffmpeg import FfmpegAdapter
from backend.adapters.separator import AudioSeparatorAdapter, SeparationError
from backend.core.config import RuntimeSettings
from backend.db.models import Run, RunStatus
from backend.services.exporters import bundle_files
from backend.services.processing import resolve_run_processing
from backend.services.settings import get_or_create_settings
from backend.services.tracks import add_run_artifact, assign_run_metadata, set_run_state, write_metadata_file


def process_run(session: Session, runtime_settings: RuntimeSettings, run: Run) -> None:
    session.refresh(run, attribute_names=["track", "artifacts"])
    track = run.track
    ffmpeg_adapter = FfmpegAdapter(runtime_settings)
    separator_adapter = AudioSeparatorAdapter(runtime_settings)
    app_settings = get_or_create_settings(session, runtime_settings)
    processing = resolve_run_processing(run)

    source_path = Path(track.source_path)
    if not source_path.exists():
        set_run_state(
            run,
            status=RunStatus.failed,
            progress=0.0,
            status_message="Source file missing",
            error_message=f"Source file no longer exists: {source_path}",
        )
        session.commit()
        return

    source_slug = (track.metadata_json or {}).get("source_slug", track.id)
    output_directory = Path(app_settings.output_directory) / source_slug / run.id
    work_directory = output_directory / "work"
    raw_stems_directory = work_directory / "raw-stems"
    stems_directory = output_directory / "stems"
    export_directory = output_directory / "export"
    output_directory.mkdir(parents=True, exist_ok=True)

    try:
        set_run_state(
            run,
            status=RunStatus.preparing,
            progress=0.15,
            status_message="Probing and normalizing source audio",
        )
        metadata = ffmpeg_adapter.probe(source_path)
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

        set_run_state(
            run,
            status=RunStatus.separating,
            progress=0.5,
            status_message="Running local source separation",
        )
        session.commit()

        separation = separator_adapter.run(
            source_path=normalized_path,
            output_dir=raw_stems_directory,
            model_cache_dir=Path(app_settings.model_cache_directory),
            model_filename=processing["model_filename"],
        )
        stems_directory.mkdir(parents=True, exist_ok=True)
        instrumental_path = stems_directory / "instrumental.wav"
        vocals_path = stems_directory / "vocals.wav"
        shutil.move(separation.instrumental_path, instrumental_path)
        shutil.move(separation.vocals_path, vocals_path)

        add_run_artifact(
            run,
            kind="instrumental",
            label="Instrumental stem",
            format_name="WAV",
            path=instrumental_path,
        )
        add_run_artifact(
            run,
            kind="vocals",
            label="Vocal stem",
            format_name="WAV",
            path=vocals_path,
        )

        for index, extra_path in enumerate(separation.extra_paths, start=1):
            extra_label = extra_path.stem.replace("_", " ").strip() or f"Extra stem {index}"
            stable_extra_path = stems_directory / f"extra-{index:02d}{extra_path.suffix.lower() or '.wav'}"
            shutil.move(extra_path, stable_extra_path)
            add_run_artifact(
                run,
                kind="extra-stem",
                label=extra_label,
                format_name=stable_extra_path.suffix.lstrip(".").upper() or "WAV",
                path=stable_extra_path,
            )
        session.commit()

        set_run_state(
            run,
            status=RunStatus.exporting,
            progress=0.82,
            status_message="Writing export bundle",
        )
        session.commit()

        export_directory.mkdir(parents=True, exist_ok=True)
        instrumental_wav_export = export_directory / "instrumental.wav"
        vocals_wav_export = export_directory / "vocals.wav"
        shutil.copy2(instrumental_path, instrumental_wav_export)
        shutil.copy2(vocals_path, vocals_wav_export)

        instrumental_mp3_export = export_directory / "instrumental.mp3"
        ffmpeg_adapter.convert_to_mp3(
            instrumental_wav_export,
            instrumental_mp3_export,
            processing["export_mp3_bitrate"],
        )
        metadata_path = export_directory / "metadata.json"
        write_metadata_file(track, run, metadata_path)

        bundle_path = Path(runtime_settings.exports_dir) / f"{source_slug}-{run.id}.zip"
        bundle_files(
            bundle_path,
            [
                instrumental_wav_export,
                instrumental_mp3_export,
                vocals_wav_export,
                metadata_path,
            ],
        )
        add_run_artifact(
            run,
            kind="export-audio-wav",
            label="Instrumental WAV export",
            format_name="WAV",
            path=instrumental_wav_export,
        )
        add_run_artifact(
            run,
            kind="export-audio-mp3",
            label="Instrumental MP3 export",
            format_name="MP3",
            path=instrumental_mp3_export,
        )
        add_run_artifact(
            run,
            kind="export-vocals",
            label="Vocal WAV export",
            format_name="WAV",
            path=vocals_wav_export,
        )
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
            status_message="Ready for preview and export",
            error_message=None,
        )
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
            status_message="Processing failed",
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
            status_message="Processing failed",
            error_message=f"Unexpected processing error: {error.__class__.__name__}: {error}",
        )
        session.commit()
