from pathlib import Path

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.core.config import RuntimeSettings
from backend.core.constants import DEFAULT_PROFILE_KEY, PROFILE_LOOKUP
from backend.db.models import AppSettings
from backend.schemas.settings import (
    RetentionSettingsResponse,
    SettingsResponse,
    SettingsUpdateRequest,
    StorageSettingsResponse,
)
from backend.services.processing import serialize_processing_profiles
from backend.services.storage import resolve_storage_paths

DEFAULT_TEMP_MAX_AGE_HOURS = 24
DEFAULT_EXPORT_BUNDLE_MAX_AGE_DAYS = 7


def get_or_create_settings(session: Session, runtime_settings: RuntimeSettings) -> AppSettings:
    settings = session.get(AppSettings, 1)
    if settings is None:
        settings = AppSettings(
            id=1,
            outputs_directory=str(runtime_settings.output_dir.resolve()),
            uploads_directory=str(runtime_settings.uploads_dir.resolve()),
            exports_directory=str(runtime_settings.exports_dir.resolve()),
            temp_directory=str(runtime_settings.temp_dir.resolve()),
            model_cache_directory=str(runtime_settings.model_cache_dir.resolve()),
            temp_max_age_hours=DEFAULT_TEMP_MAX_AGE_HOURS,
            export_bundle_max_age_days=DEFAULT_EXPORT_BUNDLE_MAX_AGE_DAYS,
            default_profile=DEFAULT_PROFILE_KEY,
            export_mp3_bitrate="320k",
        )
        session.add(settings)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            settings = session.get(AppSettings, 1)
            if settings is None:
                raise
        else:
            session.refresh(settings)
    if _backfill_settings(settings, runtime_settings):
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


def _backfill_settings(settings: AppSettings, runtime_settings: RuntimeSettings) -> bool:
    changed = False
    defaults = {
        "uploads_directory": str(runtime_settings.uploads_dir.resolve()),
        "outputs_directory": str(runtime_settings.output_dir.resolve()),
        "exports_directory": str(runtime_settings.exports_dir.resolve()),
        "temp_directory": str(runtime_settings.temp_dir.resolve()),
        "model_cache_directory": str(runtime_settings.model_cache_dir.resolve()),
        "temp_max_age_hours": DEFAULT_TEMP_MAX_AGE_HOURS,
        "export_bundle_max_age_days": DEFAULT_EXPORT_BUNDLE_MAX_AGE_DAYS,
    }
    for field_name, value in defaults.items():
        if getattr(settings, field_name) is None:
            setattr(settings, field_name, value)
            changed = True
    # Keep settings pinned to the current canonical split keys.
    if settings.default_profile not in PROFILE_LOOKUP:
        settings.default_profile = DEFAULT_PROFILE_KEY
        changed = True
    return changed


def serialize_settings(settings: AppSettings, runtime_settings: RuntimeSettings) -> SettingsResponse:
    storage = StorageSettingsResponse(
        database_path=str(runtime_settings.database_path.resolve()),
        uploads_directory=settings.uploads_directory or "",
        outputs_directory=settings.outputs_directory,
        exports_directory=settings.exports_directory or "",
        temp_directory=settings.temp_directory or "",
        model_cache_directory=settings.model_cache_directory,
    )
    return SettingsResponse(
        storage=storage,
        retention=RetentionSettingsResponse(
            temp_max_age_hours=settings.temp_max_age_hours or DEFAULT_TEMP_MAX_AGE_HOURS,
            export_bundle_max_age_days=settings.export_bundle_max_age_days or DEFAULT_EXPORT_BUNDLE_MAX_AGE_DAYS,
        ),
        default_profile=settings.default_profile,
        export_mp3_bitrate=settings.export_mp3_bitrate,
        profiles=serialize_processing_profiles(),
    )


def update_settings(
    session: Session,
    runtime_settings: RuntimeSettings,
    payload: SettingsUpdateRequest,
) -> SettingsResponse:
    if payload.default_profile not in PROFILE_LOOKUP:
        raise ValueError(f"Unknown profile '{payload.default_profile}'.")
    if payload.retention.temp_max_age_hours < 1:
        raise ValueError("Temp retention must be at least 1 hour.")
    if payload.retention.export_bundle_max_age_days < 1:
        raise ValueError("Export bundle retention must be at least 1 day.")

    settings = get_or_create_settings(session, runtime_settings)
    settings.uploads_directory = str(Path(payload.storage.uploads_directory).expanduser().resolve())
    settings.outputs_directory = str(Path(payload.storage.outputs_directory).expanduser().resolve())
    settings.exports_directory = str(Path(payload.storage.exports_directory).expanduser().resolve())
    settings.temp_directory = str(Path(payload.storage.temp_directory).expanduser().resolve())
    settings.model_cache_directory = str(Path(payload.storage.model_cache_directory).expanduser().resolve())
    settings.temp_max_age_hours = payload.retention.temp_max_age_hours
    settings.export_bundle_max_age_days = payload.retention.export_bundle_max_age_days
    settings.default_profile = payload.default_profile
    settings.export_mp3_bitrate = payload.export_mp3_bitrate.strip() or "320k"

    resolve_storage_paths(runtime_settings, settings)

    session.add(settings)
    session.commit()
    session.refresh(settings)
    return serialize_settings(settings, runtime_settings)
