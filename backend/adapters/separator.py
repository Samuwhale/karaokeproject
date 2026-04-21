from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from backend.core.binaries import resolve_binary
from backend.core.config import RuntimeSettings


class SeparationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SeparationResult:
    instrumental_path: Path
    vocals_path: Path
    extra_paths: tuple[Path, ...]


class AudioSeparatorAdapter:
    def __init__(self, runtime_settings: RuntimeSettings):
        self.binary = resolve_binary(runtime_settings.separator_binary)

    def run(
        self,
        source_path: Path,
        output_dir: Path,
        model_cache_dir: Path,
        model_filename: str,
    ) -> SeparationResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        model_cache_dir.mkdir(parents=True, exist_ok=True)
        try:
            completed = subprocess.run(
                [
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
                ],
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError as error:
            raise SeparationError(f"Missing separator binary '{self.binary}' on PATH.") from error
        if completed.returncode != 0:
            raise SeparationError(completed.stderr.strip() or completed.stdout.strip())

        generated_audio = sorted(
            path
            for path in output_dir.iterdir()
            if path.is_file() and path.suffix.lower() in {".wav", ".flac", ".mp3", ".m4a"}
        )
        if not generated_audio:
            raise SeparationError("audio-separator completed without writing any output stems.")

        instrumental_path = self._find_stem(generated_audio, ("instrumental", "karaoke", "other"))
        vocals_path = self._find_stem(generated_audio, ("vocals", "voice"))
        extra_paths = tuple(
            path
            for path in generated_audio
            if path not in {instrumental_path, vocals_path}
        )

        if instrumental_path is None or vocals_path is None:
            raise SeparationError(
                "audio-separator did not produce recognisable instrumental and vocal stem filenames."
            )

        return SeparationResult(
            instrumental_path=instrumental_path,
            vocals_path=vocals_path,
            extra_paths=extra_paths,
        )

    @staticmethod
    def _find_stem(paths: list[Path], keywords: tuple[str, ...]) -> Path | None:
        for path in paths:
            lower_name = path.name.lower()
            if any(keyword in lower_name for keyword in keywords):
                return path
        return None

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
