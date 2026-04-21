from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from backend.adapters.ffmpeg import FfmpegAdapter
from backend.adapters.separator import AudioSeparatorAdapter
from backend.adapters.youtube import YtDlpAdapter
from backend.core.binaries import find_binary
from backend.core.config import RuntimeSettings
from backend.schemas.system import BinaryStatusResponse, DiagnosticsResponse
from backend.services.settings import get_or_create_settings


def collect_diagnostics(session: Session, runtime_settings: RuntimeSettings) -> DiagnosticsResponse:
    application_settings = get_or_create_settings(session, runtime_settings)
    ffmpeg_adapter = FfmpegAdapter(runtime_settings)
    separator_adapter = AudioSeparatorAdapter(runtime_settings)
    yt_dlp_adapter = YtDlpAdapter(runtime_settings)

    binary_rows = [
        _build_binary_status(
            name="ffmpeg",
            binary=runtime_settings.ffmpeg_binary,
            required=True,
            version_provider=lambda: ffmpeg_adapter.version(runtime_settings.ffmpeg_binary),
        ),
        _build_binary_status(
            name="ffprobe",
            binary=runtime_settings.ffprobe_binary,
            required=True,
            version_provider=lambda: ffmpeg_adapter.version(runtime_settings.ffprobe_binary),
        ),
        _build_binary_status(
            name="audio-separator",
            binary=runtime_settings.separator_binary,
            required=True,
            version_provider=separator_adapter.version,
        ),
        _build_binary_status(
            name="yt-dlp",
            binary=runtime_settings.yt_dlp_binary,
            required=True,
            version_provider=yt_dlp_adapter.version,
        ),
        _build_binary_status(
            name="whisper",
            binary=runtime_settings.whisper_binary,
            required=False,
            version_provider=lambda: None,
        ),
    ]

    env_info = separator_adapter.env_info()
    acceleration = "cpu"
    if env_info:
        lowered = env_info.lower()
        if "cudaexecutionprovider" in lowered:
            acceleration = "cuda"
        elif "coremlexecutionprovider" in lowered:
            acceleration = "coreml"
        elif "cpuexecutionprovider" in lowered:
            acceleration = "cpu"

    issues = [
        f"Required binary missing: {row.name}"
        for row in binary_rows
        if row.required and not row.available
    ]
    if not Path(application_settings.output_directory).exists():
        issues.append("Configured output directory does not exist.")
    if not Path(application_settings.model_cache_directory).exists():
        issues.append("Configured model cache directory does not exist.")

    disk_usage = shutil.disk_usage(runtime_settings.data_root)
    return DiagnosticsResponse(
        app_ready=not any(row.required and not row.available for row in binary_rows),
        acceleration=acceleration,
        free_disk_gb=round(disk_usage.free / (1024**3), 2),
        binaries=binary_rows,
        issues=issues,
        data_directories={
            "uploads": str(runtime_settings.uploads_dir.resolve()),
            "outputs": application_settings.output_directory,
            "exports": str(runtime_settings.exports_dir.resolve()),
            "temp": str(runtime_settings.temp_dir.resolve()),
            "model_cache": application_settings.model_cache_directory,
        },
        url_import_ready=all(
            row.available for row in binary_rows if row.name in {"ffmpeg", "ffprobe", "audio-separator", "yt-dlp"}
        ),
    )


def _build_binary_status(name: str, binary: str, required: bool, version_provider) -> BinaryStatusResponse:
    resolved_path = find_binary(binary)
    return BinaryStatusResponse(
        name=name,
        required=required,
        available=resolved_path is not None,
        path=resolved_path,
        version=version_provider() if resolved_path else None,
    )
