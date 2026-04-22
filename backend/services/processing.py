from __future__ import annotations

from typing import Any

from backend.core.constants import DEFAULT_PRESET_KEY, PRESET_DEFINITIONS, PRESET_LOOKUP
from backend.db.models import AppSettings, Run
from backend.schemas.tracks import ProcessingProfileResponse, RunProcessingConfigRequest, RunProcessingConfigResponse

DEFAULT_MP3_BITRATE = "320k"


def normalize_export_bitrate(value: str | None, fallback: str = DEFAULT_MP3_BITRATE) -> str:
    normalized = (value or "").strip()
    return normalized or fallback


def build_processing_config(profile_key: str, export_mp3_bitrate: str | None) -> dict[str, str]:
    if profile_key not in PRESET_LOOKUP:
        raise ValueError(f"Unknown processing profile '{profile_key}'.")

    profile = PRESET_LOOKUP[profile_key]
    bitrate = normalize_export_bitrate(export_mp3_bitrate)
    return {
        "profile_key": profile.key,
        "profile_label": profile.label,
        "model_filename": profile.model_filename,
        "export_mp3_bitrate": bitrate,
    }


def build_processing_from_request(
    request: RunProcessingConfigRequest | None,
    settings: AppSettings,
) -> dict[str, str]:
    profile_key = request.profile_key if request else settings.default_preset
    bitrate = request.export_mp3_bitrate if request else settings.export_mp3_bitrate
    return build_processing_config(profile_key, bitrate or settings.export_mp3_bitrate)


def resolve_run_processing(run: Run) -> dict[str, str]:
    metadata = run.metadata_json or {}
    processing = metadata.get("processing")
    if isinstance(processing, dict):
        profile_key = str(processing.get("profile_key") or run.preset or DEFAULT_PRESET_KEY)
        bitrate = str(processing.get("export_mp3_bitrate") or DEFAULT_MP3_BITRATE)
        return build_processing_config(profile_key, bitrate)

    fallback_preset = run.preset or DEFAULT_PRESET_KEY
    return build_processing_config(fallback_preset, DEFAULT_MP3_BITRATE)


def serialize_processing_config(config: dict[str, Any]) -> RunProcessingConfigResponse:
    return RunProcessingConfigResponse(
        profile_key=str(config["profile_key"]),
        profile_label=str(config["profile_label"]),
        model_filename=str(config["model_filename"]),
        export_mp3_bitrate=str(config["export_mp3_bitrate"]),
    )


def serialize_processing_profiles() -> list[ProcessingProfileResponse]:
    return [
        ProcessingProfileResponse(
            key=profile.key,
            label=profile.label,
            description=profile.description,
            model_filename=profile.model_filename,
            quality_tier=profile.quality_tier,
        )
        for profile in PRESET_DEFINITIONS
    ]
