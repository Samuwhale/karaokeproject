from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.api.dependencies import get_db_session, get_settings_dependency
from backend.core.config import RuntimeSettings
from backend.schemas.tracks import (
    CreateRunRequest,
    CreateRunResponse,
    ImportTracksResponse,
    RunProcessingConfigRequest,
    TrackDetailResponse,
    TrackSummaryResponse,
)
from backend.services.processing import build_processing_from_request
from backend.services.settings import get_or_create_settings
from backend.services.tracks import create_run, create_tracks_from_uploads, get_track, list_tracks, serialize_run_summary, serialize_track_detail, serialize_track_summary

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


@router.get("/tracks/{track_id}/source")
def download_track_source(track_id: str, session: Session = Depends(get_db_session)) -> FileResponse:
    track = get_track(session, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")
    return FileResponse(path=track.source_path, filename=track.source_filename)


@router.post("/tracks/import", response_model=ImportTracksResponse)
def import_tracks(
    files: list[UploadFile] = File(...),
    artist: str | None = Form(default=None),
    processing_config_json: str | None = Form(default=None),
    session: Session = Depends(get_db_session),
    runtime_settings: RuntimeSettings = Depends(get_settings_dependency),
) -> ImportTracksResponse:
    app_settings = get_or_create_settings(session, runtime_settings)
    try:
        processing_request = (
            RunProcessingConfigRequest.model_validate_json(processing_config_json)
            if processing_config_json
            else None
        )
        processing = build_processing_from_request(processing_request, app_settings)
    except (ValidationError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    prepared_files = [(upload.filename or "untitled", upload.file) for upload in files]
    try:
        tracks = create_tracks_from_uploads(
            session,
            runtime_settings.uploads_dir,
            prepared_files,
            processing,
            artist,
        )
        session.commit()
    except ValueError as error:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(error)) from error

    for track in tracks:
        session.refresh(track)
    return ImportTracksResponse(tracks=[serialize_track_summary(track) for track in tracks])


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
