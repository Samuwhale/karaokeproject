from __future__ import annotations

from pathlib import Path

from backend.core.config import RuntimeSettings
from backend.core.constants import MODEL_FILENAME_SUFFIXES, PRESET_DEFINITIONS
from backend.schemas.models import CachedModelResponse, CachedModelsResponse


def list_cached_models(runtime_settings: RuntimeSettings) -> CachedModelsResponse:
    directory = Path(runtime_settings.model_cache_dir)
    preset_filenames = {preset.model_filename for preset in PRESET_DEFINITIONS}

    items: list[CachedModelResponse] = []
    if directory.is_dir():
        for entry in directory.iterdir():
            if not entry.is_file():
                continue
            if entry.suffix.lower() not in MODEL_FILENAME_SUFFIXES:
                continue
            items.append(
                CachedModelResponse(
                    filename=entry.name,
                    size_bytes=entry.stat().st_size,
                    is_preset=entry.name in preset_filenames,
                )
            )

    items.sort(key=lambda item: item.filename.lower())
    return CachedModelsResponse(directory=str(directory), items=items)
