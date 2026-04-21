from pydantic import BaseModel

from backend.schemas.tracks import ProcessingProfileResponse


class SettingsResponse(BaseModel):
    output_directory: str
    model_cache_directory: str
    default_preset: str
    export_mp3_bitrate: str
    profiles: list[ProcessingProfileResponse]


class SettingsUpdateRequest(BaseModel):
    output_directory: str
    model_cache_directory: str
    default_preset: str
    export_mp3_bitrate: str
