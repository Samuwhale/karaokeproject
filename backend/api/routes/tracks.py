from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload

from backend.api.dependencies import get_db_session, get_settings_dependency
from backend.core.config import RuntimeSettings
from backend.db.models import IN_PROGRESS_RUN_STATUSES, Run, RunStatus, Track
from backend.schemas.tracks import (
    BackfillMetricsResponse,
    BatchApplyRequest,
    BatchApplyResponse,
    BatchCancelResponse,
    BatchDeleteResponse,
    BatchPurgeNonKeepersResponse,
    BatchQueueRunsRequest,
    BatchQueueRunsResponse,
    BatchTrackIdsRequest,
    CreateRunRequest,
    CreateRunResponse,
    PurgeNonKeepersResponse,
    QueueRunResponse,
    RunDetailResponse,
    RunMixInput,
    SetKeeperRequest,
    SetRunNoteRequest,
    TrackDetailResponse,
    TrackSummaryResponse,
    UpdateTrackRequest,
)
from sqlalchemy import select
from backend.services.metrics import backfill_artifact_metrics, populate_run_metrics
from backend.services.processing import build_processing_from_request
from backend.services.settings import get_or_create_settings
from backend.services.tracks import (
    create_run,
    delete_run,
    delete_track,
    dismiss_run,
    get_track,
    list_tracks,
    purge_non_keeper_runs,
    request_run_cancellation,
    retry_run,
    serialize_run_detail,
    serialize_run_summary,
    serialize_track_detail,
    serialize_track_summary,
    set_keeper_run,
    set_run_mix,
    set_run_note,
    update_track,
)

router = APIRouter(tags=["tracks"])


@router.get("/tracks", response_model=list[TrackSummaryResponse])
def get_tracks(session: Session = Depends(get_db_session)) -> list[TrackSummaryResponse]:
    return [serialize_track_summary(track) for track in list_tracks(session)]


@router.get("/tracks/{track_id}", response_model=TrackDetailResponse)
def get_track_detail(track_id: str, session: Session = Depends(get_db_session)) -> TrackDetailResponse:
    track = get_track(session, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")
    return serialize_track_detail(track)


@router.put("/tracks/{track_id}", response_model=TrackDetailResponse)
def update_track_endpoint(
    track_id: str,
    payload: UpdateTrackRequest,
    session: Session = Depends(get_db_session),
) -> TrackDetailResponse:
    try:
        update_track(session, track_id, title=payload.title, artist=payload.artist)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    track = get_track(session, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")
    return serialize_track_detail(track)


@router.delete("/tracks/{track_id}")
def delete_track_endpoint(
    track_id: str,
    session: Session = Depends(get_db_session),
) -> dict[str, bool]:
    try:
        delete_track(session, track_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"ok": True}


@router.get("/tracks/{track_id}/source")
def download_track_source(track_id: str, session: Session = Depends(get_db_session)) -> FileResponse:
    track = get_track(session, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")
    return FileResponse(
        path=track.source_path,
        filename=track.source_filename,
        content_disposition_type="attachment",
    )


@router.post("/tracks/{track_id}/runs", response_model=CreateRunResponse)
def create_track_run(
    track_id: str,
    payload: CreateRunRequest,
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> CreateRunResponse:
    track = get_track(session, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")

    try:
        processing = build_processing_from_request(
            payload.processing,
            get_or_create_settings(session, runtime_settings),
        )
        run = create_run(track, processing)
        session.commit()
    except ValueError as error:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(error)) from error

    session.refresh(run)
    return CreateRunResponse(run=serialize_run_summary(run))


@router.post("/runs/{run_id}/cancel", response_model=CreateRunResponse)
def cancel_run_endpoint(run_id: str, session: Session = Depends(get_db_session)) -> CreateRunResponse:
    try:
        run = request_run_cancellation(session, run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return CreateRunResponse(run=serialize_run_summary(run))


@router.delete("/runs/{run_id}")
def delete_run_endpoint(run_id: str, session: Session = Depends(get_db_session)) -> dict[str, bool]:
    try:
        delete_run(session, run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"ok": True}


@router.put("/runs/{run_id}/note", response_model=RunDetailResponse)
def set_run_note_endpoint(
    run_id: str,
    payload: SetRunNoteRequest,
    session: Session = Depends(get_db_session),
) -> RunDetailResponse:
    try:
        run = set_run_note(session, run_id, payload.note)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return serialize_run_detail(run)


@router.post("/runs/{run_id}/retry", response_model=CreateRunResponse)
def retry_run_endpoint(run_id: str, session: Session = Depends(get_db_session)) -> CreateRunResponse:
    try:
        run = retry_run(session, run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return CreateRunResponse(run=serialize_run_summary(run))


@router.put(
    "/tracks/{track_id}/runs/{run_id}/mix",
    response_model=RunDetailResponse,
)
def set_run_mix_endpoint(
    track_id: str,
    run_id: str,
    payload: RunMixInput,
    session: Session = Depends(get_db_session),
) -> RunDetailResponse:
    try:
        run = set_run_mix(session, track_id, run_id, payload)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return serialize_run_detail(run)


@router.put("/tracks/{track_id}/keeper", response_model=TrackDetailResponse)
def set_track_keeper(
    track_id: str,
    payload: SetKeeperRequest,
    session: Session = Depends(get_db_session),
) -> TrackDetailResponse:
    try:
        set_keeper_run(session, track_id, payload.run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    track = get_track(session, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")
    return serialize_track_detail(track)


@router.post("/tracks/{track_id}/purge-non-keepers", response_model=PurgeNonKeepersResponse)
def purge_non_keepers_endpoint(
    track_id: str,
    session: Session = Depends(get_db_session),
) -> PurgeNonKeepersResponse:
    try:
        deleted, reclaimed = purge_non_keeper_runs(session, track_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return PurgeNonKeepersResponse(deleted_run_count=deleted, bytes_reclaimed=reclaimed)


@router.get("/runs/active", response_model=list[QueueRunResponse])
def list_active_runs(session: Session = Depends(get_db_session)) -> list[QueueRunResponse]:
    active_statuses = [RunStatus.queued.value, *IN_PROGRESS_RUN_STATUSES]
    terminal_statuses = [RunStatus.failed.value, RunStatus.cancelled.value]

    active_statement = (
        select(Run)
        .options(selectinload(Run.track))
        .where(Run.status.in_(active_statuses))
        .order_by(Run.created_at.asc())
    )
    # Recently-terminal runs stay visible until the user dismisses them so
    # failures don't silently vanish from the queue.
    terminal_statement = (
        select(Run)
        .options(selectinload(Run.track))
        .where(Run.status.in_(terminal_statuses))
        .where(Run.dismissed_at.is_(None))
        .order_by(Run.updated_at.desc())
    )

    entries: list[QueueRunResponse] = []
    for run in list(session.scalars(active_statement)) + list(session.scalars(terminal_statement)):
        track: Track | None = run.track
        entries.append(
            QueueRunResponse(
                run=serialize_run_summary(run),
                track_id=run.track_id,
                track_title=track.title if track else "(deleted)",
                track_artist=track.artist if track else None,
            )
        )
    return entries


@router.post("/runs/{run_id}/dismiss", response_model=CreateRunResponse)
def dismiss_run_endpoint(run_id: str, session: Session = Depends(get_db_session)) -> CreateRunResponse:
    try:
        run = dismiss_run(session, run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return CreateRunResponse(run=serialize_run_summary(run))


@router.post("/tracks/batch/queue", response_model=BatchQueueRunsResponse)
def batch_queue_runs(
    payload: BatchQueueRunsRequest,
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> BatchQueueRunsResponse:
    if not payload.track_ids:
        return BatchQueueRunsResponse(queued_run_count=0)

    try:
        processing = build_processing_from_request(
            payload.processing,
            get_or_create_settings(session, runtime_settings),
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    queued = 0
    skipped: list[str] = []
    for track_id in payload.track_ids:
        track = get_track(session, track_id)
        if track is None:
            skipped.append(track_id)
            continue
        create_run(track, processing)
        queued += 1
    if queued:
        session.commit()
    return BatchQueueRunsResponse(queued_run_count=queued, skipped_track_ids=skipped)


@router.post("/tracks/batch/apply", response_model=BatchApplyResponse)
def batch_apply_track_fields(
    payload: BatchApplyRequest,
    session: Session = Depends(get_db_session),
) -> BatchApplyResponse:
    if not payload.track_ids or payload.artist is None:
        return BatchApplyResponse(updated_track_count=0)

    updated = 0
    for track_id in payload.track_ids:
        try:
            update_track(session, track_id, title=None, artist=payload.artist)
            updated += 1
        except LookupError:
            continue
        except ValueError:
            continue
    return BatchApplyResponse(updated_track_count=updated)


@router.post("/tracks/batch/delete", response_model=BatchDeleteResponse)
def batch_delete_tracks(
    payload: BatchTrackIdsRequest,
    session: Session = Depends(get_db_session),
) -> BatchDeleteResponse:
    deleted = 0
    skipped: list[str] = []
    for track_id in payload.track_ids:
        try:
            delete_track(session, track_id)
            deleted += 1
        except LookupError:
            skipped.append(track_id)
        except ValueError:
            skipped.append(track_id)
    return BatchDeleteResponse(deleted_track_count=deleted, skipped_track_ids=skipped)


@router.post("/tracks/batch/cancel", response_model=BatchCancelResponse)
def batch_cancel_runs(
    payload: BatchTrackIdsRequest,
    session: Session = Depends(get_db_session),
) -> BatchCancelResponse:
    cancelled = 0
    cancellable = {RunStatus.queued.value} | set(IN_PROGRESS_RUN_STATUSES)
    for track_id in payload.track_ids:
        track = get_track(session, track_id)
        if track is None:
            continue
        for run in track.runs:
            if run.status not in cancellable:
                continue
            try:
                request_run_cancellation(session, run.id)
                cancelled += 1
            except (LookupError, ValueError):
                continue
    return BatchCancelResponse(cancelled_run_count=cancelled)


@router.post("/tracks/batch/purge-non-keepers", response_model=BatchPurgeNonKeepersResponse)
def batch_purge_non_keepers(
    payload: BatchTrackIdsRequest,
    session: Session = Depends(get_db_session),
) -> BatchPurgeNonKeepersResponse:
    purged = 0
    total_deleted = 0
    total_reclaimed = 0
    skipped: list[str] = []
    for track_id in payload.track_ids:
        try:
            deleted, reclaimed = purge_non_keeper_runs(session, track_id)
            purged += 1
            total_deleted += deleted
            total_reclaimed += reclaimed
        except (LookupError, ValueError):
            skipped.append(track_id)
    return BatchPurgeNonKeepersResponse(
        purged_track_count=purged,
        deleted_run_count=total_deleted,
        bytes_reclaimed=total_reclaimed,
        skipped_track_ids=skipped,
    )


@router.post("/runs/{run_id}/measure", response_model=RunDetailResponse)
def measure_run_endpoint(
    run_id: str,
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> RunDetailResponse:
    run = session.get(Run, run_id, options=[selectinload(Run.artifacts)])
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    populate_run_metrics(session, runtime_settings, run)
    session.refresh(run)
    return serialize_run_detail(run)


@router.post("/admin/backfill-metrics", response_model=BackfillMetricsResponse)
def backfill_metrics_endpoint(
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> BackfillMetricsResponse:
    updated = backfill_artifact_metrics(session, runtime_settings)
    return BackfillMetricsResponse(updated_artifact_count=updated)
