from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.schemas.validation import normalize_unique_string_list

MIX_GAIN_DB_MIN = -24.0
MIX_GAIN_DB_MAX = 12.0


class ProcessingProfileResponse(BaseModel):
    key: str
    label: str
    strength: str
    best_for: str
    tradeoff: str
    stems: list[str] = Field(default_factory=list)


class RunProcessingConfigRequest(BaseModel):
    profile_key: str

    @field_validator("profile_key")
    @classmethod
    def validate_profile_key(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Profile key cannot be blank.")
        return cleaned


class RunProcessingConfigResponse(BaseModel):
    profile_key: str
    profile_label: str


class ArtifactMetricsResponse(BaseModel):
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channels: int | None = None
    size_bytes: int | None = None
    integrated_lufs: float | None = None
    true_peak_dbfs: float | None = None
    peaks: list[float] = Field(default_factory=list)


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
    processing: RunProcessingConfigResponse
    status: str
    progress: float
    status_message: str
    error_message: str | None
    output_directory: str | None
    created_at: datetime
    updated_at: datetime
    last_active_status: str | None = None
    dismissed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RunMixStemEntry(BaseModel):
    artifact_id: str
    gain_db: float = Field(default=0.0, ge=MIX_GAIN_DB_MIN, le=MIX_GAIN_DB_MAX)
    muted: bool = False


class RunMixState(BaseModel):
    stems: list[RunMixStemEntry] = Field(default_factory=list)
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
    source_peaks: list[float] = Field(default_factory=list)


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

    @field_validator("run_id")
    @classmethod
    def normalize_run_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class UpdateTrackRequest(BaseModel):
    title: str | None = None
    artist: str | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Title cannot be empty.")
        return cleaned

    @field_validator("artist")
    @classmethod
    def normalize_artist(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class BackfillMetricsResponse(BaseModel):
    updated_artifact_count: int


class QueueRunResponse(BaseModel):
    run: RunSummaryResponse
    track_id: str
    track_title: str
    track_artist: str | None


class BatchTrackIdsRequest(BaseModel):
    track_ids: list[str] = Field(default_factory=list)

    @field_validator("track_ids")
    @classmethod
    def validate_track_ids(cls, value: list[str]) -> list[str]:
        return normalize_unique_string_list(value, label="Track ids")


class BatchDeleteResponse(BaseModel):
    deleted_track_count: int
    blocked_track_ids: list[str] = Field(default_factory=list)
    missing_track_ids: list[str] = Field(default_factory=list)
