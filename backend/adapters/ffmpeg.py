from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from backend.core.binaries import resolve_binary
from backend.core.config import RuntimeSettings


class FfmpegCommandError(RuntimeError):
    pass


@dataclass(frozen=True)
class AudioMetadata:
    duration_seconds: float | None
    sample_rate: int | None
    channels: int | None


_INTEGRATED_LOUDNESS_RE = re.compile(r"Integrated loudness:.*?I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", re.DOTALL)
_TRUE_PEAK_RE = re.compile(r"True peak:.*?Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS", re.DOTALL)


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

    def measure_loudness(self, source_path: Path) -> tuple[float | None, float | None]:
        completed = subprocess.run(
            [
                self.ffmpeg_binary,
                "-nostats",
                "-hide_banner",
                "-i",
                str(source_path),
                "-af",
                "ebur128=peak=true",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise FfmpegCommandError(completed.stderr.strip() or completed.stdout.strip())

        stderr = completed.stderr
        integrated = None
        peak = None
        match = _INTEGRATED_LOUDNESS_RE.search(stderr)
        if match:
            value = float(match.group(1))
            integrated = None if value <= -70.0 else value
        match = _TRUE_PEAK_RE.search(stderr)
        if match:
            peak = float(match.group(1))
        return integrated, peak

    def extract_peaks(self, source_path: Path, buckets: int = 512) -> list[float]:
        completed = subprocess.run(
            [
                self.ffmpeg_binary,
                "-nostats",
                "-hide_banner",
                "-i",
                str(source_path),
                "-ac",
                "1",
                "-ar",
                "22050",
                "-f",
                "f32le",
                "-",
            ],
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            stderr = completed.stderr.decode("utf-8", errors="replace").strip()
            raise FfmpegCommandError(stderr or "ffmpeg failed to extract peaks")

        raw = completed.stdout
        if not raw:
            return [0.0] * buckets

        aligned_length = len(raw) - (len(raw) % 4)
        if aligned_length == 0:
            return [0.0] * buckets
        samples = np.frombuffer(raw[:aligned_length], dtype=np.float32)
        if samples.size == 0:
            return [0.0] * buckets

        if samples.size < buckets:
            peaks = np.zeros(buckets, dtype=np.float32)
            peaks[: samples.size] = np.abs(samples)
        else:
            bucket_size = samples.size // buckets
            trimmed = samples[: bucket_size * buckets]
            grid = trimmed.reshape(buckets, bucket_size)
            peaks = np.max(np.abs(grid), axis=1)

        maximum = float(peaks.max())
        if maximum > 0.0:
            peaks = peaks / maximum
        return [float(value) for value in peaks]

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
