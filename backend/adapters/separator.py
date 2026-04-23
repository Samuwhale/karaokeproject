from __future__ import annotations

import re
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from backend.core.binaries import resolve_binary
from backend.core.config import RuntimeSettings
from backend.core.stems import detect_stem_name


class SeparationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SeparationResult:
    stems: dict[str, Path]


# audio-separator drives each pass through a tqdm progress bar that rewrites
# itself via carriage returns — e.g. "\r 42%|████▌     | 42/100 [00:12<00:15]".
# We split the raw byte stream on both \r and \n so we surface intermediate
# ticks while the model is still running.
_PROGRESS_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*\|")
_PROGRESS_REPORT_STEP = 0.01
_STREAM_READ_SIZE = 4096


class AudioSeparatorAdapter:
    def __init__(self, runtime_settings: RuntimeSettings):
        self.binary = resolve_binary(runtime_settings.separator_binary)

    def run(
        self,
        source_path: Path,
        output_dir: Path,
        model_cache_dir: Path,
        model_filename: str,
        progress_callback: Callable[[float], None] | None = None,
    ) -> SeparationResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        model_cache_dir.mkdir(parents=True, exist_ok=True)
        command = [
            self.binary,
            str(source_path),
            "--model_filename",
            model_filename,
            "--output_dir",
            str(output_dir),
            "--model_file_dir",
            str(model_cache_dir),
            "--output_format",
            "WAV",
        ]
        # Binary mode + stderr merged into stdout so tqdm's \r-rewritten lines
        # arrive byte-for-byte without TextIOWrapper line buffering delaying them.
        try:
            popen = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
        except FileNotFoundError as error:
            raise SeparationError(f"Missing separator binary '{self.binary}' on PATH.") from error

        with popen as process:
            try:
                tail = _stream_progress(process, progress_callback)
            except Exception:
                _stop_process(process)
                raise
            returncode = process.wait()
        if returncode != 0:
            raise SeparationError(tail.strip() or f"audio-separator exited with code {returncode}.")

        generated_audio = sorted(
            path
            for path in output_dir.iterdir()
            if path.is_file() and path.suffix.lower() in {".wav", ".flac", ".mp3", ".m4a"}
        )
        if not generated_audio:
            raise SeparationError("audio-separator completed without writing any output stems.")

        stems: dict[str, Path] = {}
        fallback_index = 1
        for path in generated_audio:
            name = detect_stem_name(path.name, fallback_index=fallback_index)
            if name.startswith("stem-"):
                fallback_index += 1
            # Distinct files that resolve to the same canonical name (e.g. two
            # "other" outputs) keep both by suffixing the second one.
            if name in stems:
                collision_index = 2
                while f"{name}-{collision_index}" in stems:
                    collision_index += 1
                name = f"{name}-{collision_index}"
            stems[name] = path

        return SeparationResult(stems=stems)

    def env_info(self) -> str | None:
        try:
            completed = subprocess.run(
                [self.binary, "--env_info"],
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError:
            return None
        if completed.returncode != 0:
            return None
        return "\n".join(line for line in (completed.stdout, completed.stderr) if line).strip()

    def version(self) -> str | None:
        try:
            completed = subprocess.run(
                [self.binary, "--version"],
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError:
            return None
        if completed.returncode != 0:
            return None
        return next((line for line in completed.stdout.splitlines() if line.strip()), None)


def _stream_progress(
    process: subprocess.Popen[bytes],
    progress_callback: Callable[[float], None] | None,
) -> str:
    """Consume merged stdout/stderr, emit progress ticks, return the tail for error messages."""
    stream = process.stdout
    assert stream is not None
    buffer = bytearray()
    tail: list[str] = []
    last_reported = -1.0

    def flush() -> None:
        nonlocal last_reported
        if not buffer:
            return
        chunk = buffer.decode("utf-8", errors="replace").strip()
        buffer.clear()
        if not chunk:
            return
        tail.append(chunk)
        if len(tail) > 40:
            del tail[:-40]
        if progress_callback is None:
            return
        match = _PROGRESS_PATTERN.search(chunk)
        if match is None:
            return
        fraction = max(0.0, min(1.0, float(match.group(1)) / 100.0))
        # Throttle to visible changes so we don't commit once per tqdm tick.
        if fraction - last_reported < _PROGRESS_REPORT_STEP and fraction < 1.0:
            return
        last_reported = fraction
        progress_callback(fraction)

    for chunk in iter(lambda: stream.read(_STREAM_READ_SIZE), b""):
        for byte in chunk:
            if byte in (13, 10):
                flush()
            else:
                buffer.append(byte)
    flush()
    return "\n".join(tail)


def _stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
