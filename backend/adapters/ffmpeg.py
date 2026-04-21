from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from backend.core.binaries import resolve_binary
from backend.core.config import RuntimeSettings


class FfmpegCommandError(RuntimeError):
    pass


@dataclass(frozen=True)
class AudioMetadata:
    duration_seconds: float | None
    sample_rate: int | None
    channels: int | None


class FfmpegAdapter:
    def __init__(self, runtime_settings: RuntimeSettings):
        self.ffmpeg_binary = resolve_binary(runtime_settings.ffmpeg_binary)
        self.ffprobe_binary = resolve_binary(runtime_settings.ffprobe_binary)

    def _run(self, command: list[str]) -> subprocess.CompletedProcess[str]:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise FfmpegCommandError(completed.stderr.strip() or completed.stdout.strip())
        return completed

    def probe(self, source_path: Path) -> AudioMetadata:
        completed = self._run(
            [
                self.ffprobe_binary,
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_streams",
                "-show_format",
                str(source_path),
            ]
        )
        payload = json.loads(completed.stdout)
        audio_stream = next(
            (stream for stream in payload.get("streams", []) if stream.get("codec_type") == "audio"),
            {},
        )
        duration_raw = payload.get("format", {}).get("duration")
        sample_rate_raw = audio_stream.get("sample_rate")
        channels_raw = audio_stream.get("channels")
        return AudioMetadata(
            duration_seconds=float(duration_raw) if duration_raw else None,
            sample_rate=int(sample_rate_raw) if sample_rate_raw else None,
            channels=int(channels_raw) if channels_raw else None,
        )

    def normalize(self, source_path: Path, destination_path: Path) -> None:
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        self._run(
            [
                self.ffmpeg_binary,
                "-y",
                "-i",
                str(source_path),
                "-vn",
                "-ac",
                "2",
                "-ar",
                "44100",
                "-c:a",
                "pcm_s16le",
                str(destination_path),
            ]
        )

    def convert_to_mp3(self, source_path: Path, destination_path: Path, bitrate: str) -> None:
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        self._run(
            [
                self.ffmpeg_binary,
                "-y",
                "-i",
                str(source_path),
                "-codec:a",
                "libmp3lame",
                "-b:a",
                bitrate,
                str(destination_path),
            ]
        )

    def version(self, binary_name: str) -> str | None:
        completed = subprocess.run(
            [binary_name, "-version"],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            return None
        first_line = completed.stdout.splitlines()
        return first_line[0] if first_line else None
