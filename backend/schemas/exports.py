from enum import StrEnum

from pydantic import BaseModel, Field, field_validator

from backend.core.stems import (
    EXPORT_STEM_MP3_PREFIX,
    EXPORT_STEM_WAV_PREFIX,
    STEM_NAME_PATTERN,
)


STATIC_ARTIFACT_KINDS: frozenset[str] = frozenset({
    "source",
    "metadata",
    "mix-wav",
    "mix-mp3",
})


def validate_export_artifact_kind(value: str) -> str:
    if value in STATIC_ARTIFACT_KINDS:
        return value
    for prefix in (EXPORT_STEM_WAV_PREFIX, EXPORT_STEM_MP3_PREFIX):
        if value.startswith(prefix):
            stem_name = value[len(prefix):]
            if not STEM_NAME_PATTERN.match(stem_name):
                raise ValueError(f"Invalid stem name in export artifact kind: {value!r}")
            return value
    raise ValueError(f"Unsupported export artifact kind: {value!r}")


ExportArtifactKind = str


class ExportOutputMode(StrEnum):
    single_bundle = "single-bundle"
    zip_per_track = "zip-per-track"


def _validate_bitrate(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("bitrate must be a value like '192k' or '320k'.")
    return cleaned


class ExportBundleRequest(BaseModel):
    track_ids: list[str] = Field(min_length=1)
    # Optional map {track_id: run_id} to override per-track run selection.
    # Tracks not in the map use their latest completed run.
    run_ids: dict[str, str] = Field(default_factory=dict)
    artifacts: list[str] = Field(min_length=1)
    mode: ExportOutputMode = ExportOutputMode.single_bundle
    bitrate: str = "320k"

    @field_validator("artifacts")
    @classmethod
    def _validate_artifacts(cls, value: list[str]) -> list[str]:
        return [validate_export_artifact_kind(item) for item in value]

    @field_validator("bitrate")
    @classmethod
    def _validate_bitrate_field(cls, value: str) -> str:
        return _validate_bitrate(value)


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
    run_ids: dict[str, str] = Field(default_factory=dict)
    artifacts: list[str] = Field(min_length=1)
    mode: ExportOutputMode = ExportOutputMode.single_bundle
    bitrate: str = "320k"

    @field_validator("artifacts")
    @classmethod
    def _validate_artifacts(cls, value: list[str]) -> list[str]:
        return [validate_export_artifact_kind(item) for item in value]

    @field_validator("bitrate")
    @classmethod
    def _validate_bitrate_field(cls, value: str) -> str:
        return _validate_bitrate(value)


class ExportPlanArtifact(BaseModel):
    kind: str
    present: bool
    size_bytes: int | None = None
    missing_reason: str | None = None


class ExportPlanTrack(BaseModel):
    track_id: str
    track_title: str
    run_id: str | None
    artifacts: list[ExportPlanArtifact]
    skip_reason: str | None = None


class ExportPlanResponse(BaseModel):
    tracks: list[ExportPlanTrack]
    included_track_count: int
    total_bytes: int
    skipped_track_count: int


class ExportStemsRequest(BaseModel):
    track_ids: list[str] = Field(min_length=1)
    run_ids: dict[str, str] = Field(default_factory=dict)


class ExportStemOption(BaseModel):
    name: str
    label: str
    track_count: int


class ExportStemsResponse(BaseModel):
    stems: list[ExportStemOption]
