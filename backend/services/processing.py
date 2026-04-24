from __future__ import annotations

from typing import Any

from backend.core.constants import (
    DEFAULT_PROFILE_KEY,
    PROFILE_DEFINITIONS,
    PROFILE_LOOKUP,
    resolve_profile_key,
)
from backend.db.models import AppSettings, Run
from backend.schemas.tracks import (
    ProcessingProfileResponse,
    RunProcessingConfigRequest,
    RunProcessingConfigResponse,
)

DEFAULT_MP3_BITRATE = "320k"


def normalize_export_bitrate(value: str | None, fallback: str = DEFAULT_MP3_BITRATE) -> str:
    normalized = (value or "").strip()
    return normalized or fallback


def build_processing_config(profile_key: str) -> dict[str, Any]:
    resolved_key = resolve_profile_key(profile_key)
    if resolved_key not in PROFILE_LOOKUP:
        raise ValueError(f"Unknown processing profile '{profile_key}'.")

    profile = PROFILE_LOOKUP[resolved_key]
    config: dict[str, Any] = {
        "profile_key": profile.key,
        "profile_label": profile.label,
        "model_filename": profile.model_filename,
    }
    if profile.followup is not None:
        config["followup"] = {
            "input_stem": profile.followup.input_stem,
            "model_filename": profile.followup.model_filename,
        }
    return config


def build_processing_from_request(
    request: RunProcessingConfigRequest | None,
    settings: AppSettings,
) -> dict[str, Any]:
    if request is None:
        return build_processing_config(settings.default_profile)
    return build_processing_config(request.profile_key)


def resolve_run_processing(run: Run) -> dict[str, Any]:
    metadata = run.metadata_json or {}
    processing = metadata.get("processing")
    if isinstance(processing, dict):
        profile_key = str(processing.get("profile_key") or run.profile_key or DEFAULT_PROFILE_KEY)
    else:
        profile_key = run.profile_key or DEFAULT_PROFILE_KEY
    try:
        return build_processing_config(profile_key)
    except ValueError:
        return build_processing_config(DEFAULT_PROFILE_KEY)


def serialize_processing_config(config: dict[str, Any]) -> RunProcessingConfigResponse:
    return RunProcessingConfigResponse(
        profile_key=str(config["profile_key"]),
        profile_label=str(config["profile_label"]),
    )


def serialize_processing_profiles() -> list[ProcessingProfileResponse]:
    return [
        ProcessingProfileResponse(
            key=profile.key,
            label=profile.label,
            strength=profile.strength,
            best_for=profile.best_for,
            tradeoff=profile.tradeoff,
            stems=list(profile.stems),
        )
        for profile in PROFILE_DEFINITIONS
    ]
