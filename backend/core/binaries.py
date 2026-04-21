import shutil
import sys
from pathlib import Path


def find_binary(binary_name: str) -> str | None:
    resolved = shutil.which(binary_name)
    if resolved:
        return resolved

    sibling = Path(sys.executable).parent / binary_name
    if sibling.exists():
        return str(sibling)

    return None


def resolve_binary(binary_name: str) -> str:
    return find_binary(binary_name) or binary_name
