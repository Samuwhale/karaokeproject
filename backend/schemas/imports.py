from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from backend.schemas.tracks import (
    ProcessingProfileResponse,
    RunProcessingConfigRequest,
    RunProcessingConfigResponse,
    TrackSummaryResponse,
)


class DraftSourceType(StrEnum):
    youtube = "youtube"
    local = "local"


class DraftStatus(StrEnum):
    pending = "pending"
    confirmed = "confirmed"
    discarded = "discarded"


class DraftDuplicateAction(StrEnum):
    create_new = "create-new"
    reuse_existing = "reuse-existing"
    skip = "skip"


class ExistingTrackDuplicateResponse(BaseModel):
    id: str
    title: str
    artist: str | None
    source_filename: str


class ImportDraftResponse(BaseModel):
    id: str
    source_type: str
    status: str
    created_at: datetime
    updated_at: datetime

    title: str
    artist: str | None
    suggested_title: str
    suggested_artist: str | None

    video_id: str | None = None
    source_url: str | None = None
    canonical_source_url: str | None = None
    playlist_source_url: str | None = None
    thumbnail_url: str | None = None
    duration_seconds: float | None = None

    original_filename: str | None = None
    content_hash: str | None = None
    size_bytes: int | None = None

    duplicate_action: str | None = None
    existing_track_id: str | None = None
    duplicate_tracks: list[ExistingTrackDuplicateResponse] = []


class ResolveYouTubeImportRequest(BaseModel):
    source_url: str


class ResolveYouTubeImportResponse(BaseModel):
    source_kind: str
    source_title: str
    drafts: list[ImportDraftResponse]
    profiles: list[ProcessingProfileResponse]
    default_processing: RunProcessingConfigResponse


class ResolveLocalImportResponse(BaseModel):
    drafts: list[ImportDraftResponse]
    profiles: list[ProcessingProfileResponse]
    default_processing: RunProcessingConfigResponse


class UpdateImportDraftRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    artist: str | None = None
    duplicate_action: DraftDuplicateAction | None = None
    existing_track_id: str | None = None


class BatchUpdateImportDraftRequest(BaseModel):
    draft_ids: list[str]
    title: str | None = Field(default=None, min_length=1)
    artist: str | None = None
    duplicate_action: DraftDuplicateAction | None = None


class BatchDiscardImportDraftRequest(BaseModel):
    draft_ids: list[str]


class ConfirmImportDraftsRequest(BaseModel):
    draft_ids: list[str]
    queue: bool = False
    processing: RunProcessingConfigRequest | None = None
    processing_overrides: dict[str, RunProcessingConfigRequest] = Field(default_factory=dict)


class ConfirmImportDraftsResponse(BaseModel):
    tracks: list[TrackSummaryResponse]
    created_track_count: int
    reused_track_count: int
    skipped_draft_count: int
    queued_run_count: int
