from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ProcessingProfileResponse(BaseModel):
    key: str
    label: str
    description: str
    model_filename: str


class RunProcessingConfigRequest(BaseModel):
    profile_key: str
    export_mp3_bitrate: str | None = None


class RunProcessingConfigResponse(BaseModel):
    profile_key: str
    profile_label: str
    model_filename: str
    export_mp3_bitrate: str


class RunArtifactResponse(BaseModel):
    id: str
    kind: str
    label: str
    format: str
    path: str
    created_at: datetime
    download_url: str

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

    model_config = ConfigDict(from_attributes=True)


class RunDetailResponse(RunSummaryResponse):
    metadata_json: dict[str, Any]
    artifacts: list[RunArtifactResponse]


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


class ImportTracksResponse(BaseModel):
    tracks: list[TrackSummaryResponse]


class CreateRunRequest(BaseModel):
    processing: RunProcessingConfigRequest


class CreateRunResponse(BaseModel):
    run: RunSummaryResponse
