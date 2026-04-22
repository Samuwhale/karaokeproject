from __future__ import annotations

from typing import Any

from backend.core.constants import (
    CUSTOM_PRESET_KEY,
    DEFAULT_PRESET_KEY,
    MODEL_FILENAME_SUFFIXES,
    PRESET_DEFINITIONS,
    PRESET_LOOKUP,
)
from backend.db.models import AppSettings, Run
from backend.schemas.tracks import ProcessingProfileResponse, RunProcessingConfigRequest, RunProcessingConfigResponse

DEFAULT_MP3_BITRATE = "320k"

CUSTOM_PROFILE_LABEL = "Custom model"


def normalize_export_bitrate(value: str | None, fallback: str = DEFAULT_MP3_BITRATE) -> str:
    normalized = (value or "").strip()
    return normalized or fallback


def _validate_custom_model_filename(value: str | None) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise ValueError("Custom model filename is required when profile_key is 'custom'.")
    if "/" in cleaned or "\\" in cleaned or cleaned.startswith("."):
        raise ValueError("Custom model filename must be a bare filename, not a path.")
    if not cleaned.lower().endswith(MODEL_FILENAME_SUFFIXES):
        suffixes = ", ".join(MODEL_FILENAME_SUFFIXES)
        raise ValueError(f"Custom model filename must end with one of: {suffixes}.")
    return cleaned


def build_processing_config(
    profile_key: str,
    export_mp3_bitrate: str | None,
    model_filename: str | None = None,
) -> dict[str, str]:
    bitrate = normalize_export_bitrate(export_mp3_bitrate)

    if profile_key == CUSTOM_PRESET_KEY:
        resolved_model = _validate_custom_model_filename(model_filename)
        return {
            "profile_key": CUSTOM_PRESET_KEY,
            "profile_label": CUSTOM_PROFILE_LABEL,
            "model_filename": resolved_model,
            "export_mp3_bitrate": bitrate,
        }

    if profile_key not in PRESET_LOOKUP:
        raise ValueError(f"Unknown processing profile '{profile_key}'.")

    profile = PRESET_LOOKUP[profile_key]
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
    if request is None:
        return build_processing_config(settings.default_preset, settings.export_mp3_bitrate)
    bitrate = request.export_mp3_bitrate or settings.export_mp3_bitrate
    return build_processing_config(request.profile_key, bitrate, request.model_filename)


def resolve_run_processing(run: Run) -> dict[str, str]:
    metadata = run.metadata_json or {}
    processing = metadata.get("processing")
    if isinstance(processing, dict):
        profile_key = str(processing.get("profile_key") or run.preset or DEFAULT_PRESET_KEY)
        bitrate = str(processing.get("export_mp3_bitrate") or DEFAULT_MP3_BITRATE)
        stored_model = processing.get("model_filename")
        model_filename = str(stored_model) if isinstance(stored_model, str) else None
        return build_processing_config(profile_key, bitrate, model_filename)

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
            strength=profile.strength,
            description=profile.description,
            model_filename=profile.model_filename,
            quality_tier=profile.quality_tier,
            speed_tier=profile.speed_tier,
        )
        for profile in PRESET_DEFINITIONS
    ]
