from __future__ import annotations

from typing import Any

from backend.core.constants import (
    CUSTOM_PROFILE_KEY,
    DEFAULT_PROFILE_KEY,
    MODEL_FILENAME_SUFFIXES,
    PROFILE_DEFINITIONS,
    PROFILE_LOOKUP,
)
from backend.db.models import AppSettings, Run
from backend.schemas.tracks import (
    ProcessingProfileResponse,
    RunProcessingConfigRequest,
    RunProcessingConfigResponse,
)

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
    model_filename: str | None = None,
) -> dict[str, Any]:
    if profile_key == CUSTOM_PROFILE_KEY:
        resolved_model = _validate_custom_model_filename(model_filename)
        return {
            "profile_key": CUSTOM_PROFILE_KEY,
            "profile_label": CUSTOM_PROFILE_LABEL,
            "model_filename": resolved_model,
        }

    if profile_key not in PROFILE_LOOKUP:
        raise ValueError(f"Unknown processing profile '{profile_key}'.")

    profile = PROFILE_LOOKUP[profile_key]
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
    return build_processing_config(request.profile_key, request.model_filename)


def resolve_run_processing(run: Run) -> dict[str, Any]:
    """Reconstruct the run's processing config from stored metadata.

    Live profiles are the source of truth for the `followup` chain — storing
    it on the run as well would mean legacy runs could pin themselves to a
    dropped followup model. Instead, look up the current profile and attach
    its followup if present.
    """
    metadata = run.metadata_json or {}
    processing = metadata.get("processing")
    profile_key: str
    model_filename: str | None
    if isinstance(processing, dict):
        profile_key = str(processing.get("profile_key") or run.profile_key or DEFAULT_PROFILE_KEY)
        stored_model = processing.get("model_filename")
        model_filename = str(stored_model) if isinstance(stored_model, str) else None
    else:
        profile_key = run.profile_key or DEFAULT_PROFILE_KEY
        model_filename = None

    config = build_processing_config(profile_key, model_filename)
    # If metadata pinned a specific model filename (e.g. a custom profile), use
    # it — build_processing_config already preserved it for custom; for known
    # profiles we keep the profile's canonical filename.
    return config


def serialize_processing_config(config: dict[str, Any]) -> RunProcessingConfigResponse:
    return RunProcessingConfigResponse(
        profile_key=str(config["profile_key"]),
        profile_label=str(config["profile_label"]),
        model_filename=str(config["model_filename"]),
    )


def serialize_processing_profiles() -> list[ProcessingProfileResponse]:
    return [
        ProcessingProfileResponse(
            key=profile.key,
            label=profile.label,
            strength=profile.strength,
            best_for=profile.best_for,
            tradeoff=profile.tradeoff,
            model_filename=profile.model_filename,
            stems=list(profile.stems),
        )
        for profile in PROFILE_DEFINITIONS
    ]
