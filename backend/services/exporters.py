from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def bundle_files(export_path: Path, files: list[Path]) -> None:
    export_path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(export_path, "w", compression=ZIP_DEFLATED) as archive:
        for file_path in files:
            archive.write(file_path, arcname=file_path.name)
