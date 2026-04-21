from enum import StrEnum

from pydantic import BaseModel, Field

from backend.schemas.tracks import (
    ProcessingProfileResponse,
    RunProcessingConfigRequest,
    RunProcessingConfigResponse,
    TrackSummaryResponse,
)


class DuplicateAction(StrEnum):
    create_new = "create-new"
    reuse_existing = "reuse-existing"


class ExistingTrackDuplicateResponse(BaseModel):
    id: str
    title: str
    artist: str | None
    source_filename: str


class ResolveYouTubeImportRequest(BaseModel):
    source_url: str


class ResolvedYouTubeImportItemResponse(BaseModel):
    video_id: str
    source_url: str
    canonical_source_url: str
    title: str
    artist: str | None
    thumbnail_url: str | None
    duration_seconds: float | None
    duplicate_tracks: list[ExistingTrackDuplicateResponse]


class ResolveYouTubeImportResponse(BaseModel):
    source_kind: str
    source_url: str
    title: str
    item_count: int
    items: list[ResolvedYouTubeImportItemResponse]
    profiles: list[ProcessingProfileResponse]
    default_processing: RunProcessingConfigResponse


class ConfirmYouTubeImportItemRequest(BaseModel):
    video_id: str
    source_url: str
    canonical_source_url: str
    title: str = Field(min_length=1)
    artist: str | None = None
    thumbnail_url: str | None = None
    duplicate_action: DuplicateAction = DuplicateAction.create_new
    existing_track_id: str | None = None


class ConfirmYouTubeImportRequest(BaseModel):
    source_url: str
    processing: RunProcessingConfigRequest
    items: list[ConfirmYouTubeImportItemRequest]


class ConfirmYouTubeImportResponse(BaseModel):
    tracks: list[TrackSummaryResponse]
    created_track_count: int
    reused_track_count: int
