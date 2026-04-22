from pydantic import BaseModel

from backend.schemas.tracks import ProcessingProfileResponse


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
