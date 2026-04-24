from __future__ import annotations

import shutil
from collections.abc import Callable
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
from backend.services.metrics import populate_run_metrics
from backend.services.mixing import ensure_worker_mix_wav
from backend.services.processing import resolve_run_processing
from backend.services.settings import get_or_create_settings
from backend.services.storage import apply_storage_retention, resolve_storage_paths
from backend.services.tracks import (
    add_run_artifact,
    assign_run_metadata,
    is_cancellation_requested,
    mark_run_cancelled,
    replace_terminal_runs_for_completed_profile,
    set_run_state,
    write_metadata_file,
)


class RunCancelled(Exception):
    pass


def _stage_progress_updater(
    session: Session,
    run: Run,
    *,
    stage: RunStatus,
    stage_range: tuple[float, float],
    status_message: str,
) -> Callable[[float], None]:
    """Map a 0.0–1.0 sub-task fraction into a global run percentage and commit."""
    start, end = stage_range
    span = max(0.0, end - start)
    last_progress = run.progress

    def callback(fraction: float) -> None:
        nonlocal last_progress
        _check_cancellation(session, run)
        clamped = max(0.0, min(1.0, fraction))
        global_progress = start + span * clamped
        if global_progress <= last_progress:
            return
        set_run_state(
            run,
            status=stage,
            progress=global_progress,
            status_message=status_message,
        )
        session.commit()
        last_progress = global_progress

    return callback


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
            progress=0.06,
            status_message="Probing source audio",
        )
        session.commit()
        metadata = ffmpeg_adapter.probe(source_path)

        _check_cancellation(session, run)
        set_run_state(
            run,
            status=RunStatus.preparing,
            progress=0.09,
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
        followup = processing.get("followup") if isinstance(processing.get("followup"), dict) else None

        # Total separating work spans 0.10 → 0.85 of the run. Split evenly
        # across the primary (and optional followup) passes so sub-progress
        # from tqdm maps into an honest global percentage.
        if followup is not None:
            primary_range = (0.10, 0.48)
            followup_range = (0.48, 0.85)
        else:
            primary_range = (0.10, 0.85)
            followup_range = None

        primary_message = f"Splitting with {profile_label}{' (1/2)' if followup else ''}"
        set_run_state(
            run,
            status=RunStatus.separating,
            progress=primary_range[0],
            status_message=primary_message,
        )
        session.commit()

        primary_separation = separator_adapter.run(
            source_path=normalized_path,
            output_dir=raw_stems_directory / "primary",
            model_cache_dir=storage_paths.model_cache_dir,
            model_filename=processing["model_filename"],
            progress_callback=_stage_progress_updater(
                session,
                run,
                stage=RunStatus.separating,
                stage_range=primary_range,
                status_message=primary_message,
            ),
        )

        # stem_name → raw WAV path. The followup pass (if any) replaces the
        # input stem with two or more new stems; we keep a single flat map so
        # the downstream "move into stems/ and register artifacts" loop stays
        # model-agnostic.
        raw_stems: dict[str, Path] = dict(primary_separation.stems)
        if not raw_stems:
            raise SeparationError("Separation produced no stems.")

        if followup is not None:
            input_stem = str(followup["input_stem"])
            input_path = raw_stems.get(input_stem)
            if input_path is None:
                raise SeparationError(
                    f"Primary separation did not produce a '{input_stem}' stem needed by the followup pass."
                )

            _check_cancellation(session, run)
            assert followup_range is not None
            followup_message = f"Splitting with {profile_label} (2/2)"
            set_run_state(
                run,
                status=RunStatus.separating,
                progress=followup_range[0],
                status_message=followup_message,
            )
            session.commit()

            followup_separation = separator_adapter.run(
                source_path=input_path,
                output_dir=raw_stems_directory / "followup",
                model_cache_dir=storage_paths.model_cache_dir,
                model_filename=str(followup["model_filename"]),
                progress_callback=_stage_progress_updater(
                    session,
                    run,
                    stage=RunStatus.separating,
                    stage_range=followup_range,
                    status_message=followup_message,
                ),
            )
            if not followup_separation.stems:
                raise SeparationError("Followup separation produced no stems.")

            # Replace the consumed input stem with whatever the followup emitted.
            del raw_stems[input_stem]
            for name, path in followup_separation.stems.items():
                if name in raw_stems:
                    # Collision — followup emitted something sharing a name with
                    # another primary stem. Suffix it so both survive.
                    collision = 2
                    while f"{name}-{collision}" in raw_stems:
                        collision += 1
                    name = f"{name}-{collision}"
                raw_stems[name] = path

        if not raw_stems:
            raise SeparationError("Separation finished without any usable stems.")

        stems_directory.mkdir(parents=True, exist_ok=True)

        ordered_stem_names = sorted(
            raw_stems.keys(),
            key=lambda name: (stem_display_order(name), name),
        )
        stem_wav_paths: dict[str, Path] = {}
        for name in ordered_stem_names:
            raw_path = raw_stems[name]
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
            progress=0.87,
            status_message="Copying stems",
        )
        session.commit()

        export_directory.mkdir(parents=True, exist_ok=True)
        for name, stem_path in stem_wav_paths.items():
            export_wav = export_directory / f"{name}.wav"
            shutil.copy2(stem_path, export_wav)
            add_run_artifact(
                run,
                kind=export_stem_kind(name, fmt="wav"),
                label=f"{stem_display_label(name)} WAV export",
                format_name="WAV",
                path=export_wav,
            )
        session.commit()

        _check_cancellation(session, run)
        set_run_state(
            run,
            status=RunStatus.exporting,
            progress=0.93,
            status_message="Writing metadata",
        )
        session.commit()

        metadata_path = export_directory / "metadata.json"
        write_metadata_file(track, run, metadata_path)
        add_run_artifact(
            run,
            kind="metadata",
            label="Metadata JSON",
            format_name="JSON",
            path=metadata_path,
        )
        session.commit()

        _check_cancellation(session, run)
        set_run_state(
            run,
            status=RunStatus.exporting,
            progress=0.97,
            status_message="Rendering mixdown",
        )
        session.commit()

        # Keep a bitrate-free whole-run render around for compare/preview
        # without reintroducing render-time MP3 work.
        ensure_worker_mix_wav(session, runtime_settings, run)

        set_run_state(
            run,
            status=RunStatus.completed,
            progress=1.0,
            status_message="",
            error_message=None,
        )
        replace_terminal_runs_for_completed_profile(session, run)
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
