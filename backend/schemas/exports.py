from enum import StrEnum

from pydantic import BaseModel, Field


class ExportRunSelector(StrEnum):
    keeper = "keeper"
    latest = "latest"


class ExportArtifactKind(StrEnum):
    instrumental_wav = "instrumental-wav"
    instrumental_mp3 = "instrumental-mp3"
    vocals_wav = "vocals-wav"
    mix_wav = "mix-wav"
    mix_mp3 = "mix-mp3"
    source = "source"
    metadata = "metadata"


class ExportOutputMode(StrEnum):
    single_bundle = "single-bundle"
    zip_per_track = "zip-per-track"


class ExportBundleRequest(BaseModel):
    track_ids: list[str] = Field(min_length=1)
    run_selector: ExportRunSelector = ExportRunSelector.keeper
    artifacts: list[ExportArtifactKind] = Field(min_length=1)
    mode: ExportOutputMode = ExportOutputMode.single_bundle


class ExportBundleSkip(BaseModel):
    track_id: str
    track_title: str
    reason: str


class ExportBundleResponse(BaseModel):
    job_id: str
    download_url: str
    filename: str
    byte_count: int
    included_track_count: int
    skipped: list[ExportBundleSkip] = []


class ExportPlanRequest(BaseModel):
    track_ids: list[str] = Field(min_length=1)
    run_selector: ExportRunSelector = ExportRunSelector.keeper
    artifacts: list[ExportArtifactKind] = Field(min_length=1)
    mode: ExportOutputMode = ExportOutputMode.single_bundle


class ExportPlanArtifact(BaseModel):
    kind: ExportArtifactKind
    present: bool
    size_bytes: int | None = None
    missing_reason: str | None = None


class ExportPlanTrack(BaseModel):
    track_id: str
    track_title: str
    run_id: str | None
    run_selector_used: ExportRunSelector | None
    fallback_to_latest: bool
    artifacts: list[ExportPlanArtifact]
    skip_reason: str | None = None


class ExportPlanResponse(BaseModel):
    tracks: list[ExportPlanTrack]
    included_track_count: int
    total_bytes: int
    skipped_track_count: int
    tracks_using_keeper: int
    tracks_using_latest_fallback: int
