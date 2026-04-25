import re

from pydantic import BaseModel, field_validator

from backend.schemas.tracks import ProcessingProfileResponse


_BITRATE_PATTERN = re.compile(r"^\d{2,3}k$")


def _require_non_empty_path(value: str, *, field_label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_label} cannot be empty.")
    return cleaned


class StorageSettingsResponse(BaseModel):
    database_path: str
    uploads_directory: str
    outputs_directory: str
    exports_directory: str
    temp_directory: str
    model_cache_directory: str


class StorageSettingsUpdateRequest(BaseModel):
    uploads_directory: str
    outputs_directory: str
    exports_directory: str
    temp_directory: str
    model_cache_directory: str

    @field_validator(
        "uploads_directory",
        "outputs_directory",
        "exports_directory",
        "temp_directory",
        "model_cache_directory",
        mode="after",
    )
    @classmethod
    def validate_directory(cls, value: str, info) -> str:
        field_label = info.field_name.replace("_", " ")
        return _require_non_empty_path(value, field_label=field_label.capitalize())


class RetentionSettingsResponse(BaseModel):
    temp_max_age_hours: int
    export_bundle_max_age_days: int


class RetentionSettingsUpdateRequest(BaseModel):
    temp_max_age_hours: int
    export_bundle_max_age_days: int


class SettingsResponse(BaseModel):
    storage: StorageSettingsResponse
    retention: RetentionSettingsResponse
    default_profile: str
    export_mp3_bitrate: str
    profiles: list[ProcessingProfileResponse]


class SettingsUpdateRequest(BaseModel):
    storage: StorageSettingsUpdateRequest
    retention: RetentionSettingsUpdateRequest
    default_profile: str
    export_mp3_bitrate: str

    @field_validator("export_mp3_bitrate", mode="after")
    @classmethod
    def validate_export_mp3_bitrate(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not _BITRATE_PATTERN.match(cleaned):
            raise ValueError("Export MP3 bitrate must look like 192k or 320k.")
        return cleaned
