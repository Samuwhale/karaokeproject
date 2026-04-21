from pathlib import Path

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.core.config import RuntimeSettings
from backend.core.constants import PRESET_LOOKUP
from backend.db.models import AppSettings
from backend.schemas.settings import SettingsResponse, SettingsUpdateRequest
from backend.services.processing import serialize_processing_profiles


def get_or_create_settings(session: Session, runtime_settings: RuntimeSettings) -> AppSettings:
    settings = session.get(AppSettings, 1)
    if settings is None:
        settings = AppSettings(
            id=1,
            output_directory=str(runtime_settings.output_dir.resolve()),
            model_cache_directory=str(runtime_settings.model_cache_dir.resolve()),
            default_preset="balanced",
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
    return settings


def serialize_settings(settings: AppSettings) -> SettingsResponse:
    return SettingsResponse(
        output_directory=settings.output_directory,
        model_cache_directory=settings.model_cache_directory,
        default_preset=settings.default_preset,
        export_mp3_bitrate=settings.export_mp3_bitrate,
        profiles=serialize_processing_profiles(),
    )


def update_settings(
    session: Session,
    runtime_settings: RuntimeSettings,
    payload: SettingsUpdateRequest,
) -> SettingsResponse:
    if payload.default_preset not in PRESET_LOOKUP:
        raise ValueError(f"Unknown preset '{payload.default_preset}'.")

    settings = get_or_create_settings(session, runtime_settings)
    settings.output_directory = str(Path(payload.output_directory).expanduser().resolve())
    settings.model_cache_directory = str(Path(payload.model_cache_directory).expanduser().resolve())
    settings.default_preset = payload.default_preset
    settings.export_mp3_bitrate = payload.export_mp3_bitrate.strip() or "320k"

    Path(settings.output_directory).mkdir(parents=True, exist_ok=True)
    Path(settings.model_cache_directory).mkdir(parents=True, exist_ok=True)

    session.add(settings)
    session.commit()
    session.refresh(settings)
    return serialize_settings(settings)
