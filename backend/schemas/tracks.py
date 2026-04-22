from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

MIX_GAIN_DB_MIN = -24.0
MIX_GAIN_DB_MAX = 12.0


class ProcessingProfileResponse(BaseModel):
    key: str
    label: str
    description: str
    model_filename: str
    quality_tier: int


class RunProcessingConfigRequest(BaseModel):
    profile_key: str
    export_mp3_bitrate: str | None = None


class RunProcessingConfigResponse(BaseModel):
    profile_key: str
    profile_label: str
    model_filename: str
    export_mp3_bitrate: str


class ArtifactMetricsResponse(BaseModel):
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channels: int | None = None
    size_bytes: int | None = None
    integrated_lufs: float | None = None
    true_peak_dbfs: float | None = None
    peaks: list[float] = []


class RunArtifactResponse(BaseModel):
    id: str
    kind: str
    label: str
    format: str
    path: str
    created_at: datetime
    download_url: str
    metrics: ArtifactMetricsResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class RunSummaryResponse(BaseModel):
    id: str
    preset: str
    processing: RunProcessingConfigResponse
    status: str
    progress: float
    status_message: str
    error_message: str | None
    output_directory: str | None
    created_at: datetime
    updated_at: datetime
    note: str = ""
    last_active_status: str | None = None
    dismissed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RunMixStemEntry(BaseModel):
    artifact_id: str
    gain_db: float = Field(default=0.0, ge=MIX_GAIN_DB_MIN, le=MIX_GAIN_DB_MAX)
    muted: bool = False


class RunMixState(BaseModel):
    stems: list[RunMixStemEntry] = []
    is_default: bool = True


class RunMixInput(BaseModel):
    stems: list[RunMixStemEntry]


class RunDetailResponse(RunSummaryResponse):
    metadata_json: dict[str, Any]
    artifacts: list[RunArtifactResponse]
    mix: RunMixState


class TrackSummaryResponse(BaseModel):
    id: str
    title: str
    artist: str | None
    source_type: str
    source_url: str | None
    thumbnail_url: str | None
    source_filename: str
    duration_seconds: float | None
    created_at: datetime
    updated_at: datetime
    latest_run: RunSummaryResponse | None
    run_count: int
    keeper_run_id: str | None = None
    has_custom_mix: bool = False


class TrackDetailResponse(BaseModel):
    id: str
    title: str
    artist: str | None
    source_type: str
    source_url: str | None
    thumbnail_url: str | None
    source_filename: str
    source_format: str
    source_download_url: str
    duration_seconds: float | None
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    runs: list[RunDetailResponse]
    keeper_run_id: str | None = None


class CreateRunRequest(BaseModel):
    processing: RunProcessingConfigRequest


class CreateRunResponse(BaseModel):
    run: RunSummaryResponse


class SetKeeperRequest(BaseModel):
    run_id: str | None = None


class SetRunNoteRequest(BaseModel):
    note: str = ""


class UpdateTrackRequest(BaseModel):
    title: str | None = None
    artist: str | None = None


class PurgeNonKeepersResponse(BaseModel):
    deleted_run_count: int
    bytes_reclaimed: int


class BackfillMetricsResponse(BaseModel):
    updated_artifact_count: int


class QueueRunResponse(BaseModel):
    run: RunSummaryResponse
    track_id: str
    track_title: str
    track_artist: str | None


class BatchTrackIdsRequest(BaseModel):
    track_ids: list[str]


class BatchQueueRunsRequest(BatchTrackIdsRequest):
    processing: RunProcessingConfigRequest


class BatchApplyRequest(BatchTrackIdsRequest):
    artist: str | None = None


class BatchQueueRunsResponse(BaseModel):
    queued_run_count: int
    skipped_track_ids: list[str] = []


class BatchDeleteResponse(BaseModel):
    deleted_track_count: int
    skipped_track_ids: list[str] = []


class BatchCancelResponse(BaseModel):
    cancelled_run_count: int


class BatchApplyResponse(BaseModel):
    updated_track_count: int


class BatchPurgeNonKeepersResponse(BaseModel):
    purged_track_count: int
    deleted_run_count: int
    bytes_reclaimed: int
    skipped_track_ids: list[str] = []
