import json

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.core.config import get_runtime_settings


class Base(DeclarativeBase):
    pass


runtime_settings = get_runtime_settings()
engine = create_engine(
    runtime_settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


_COLUMN_ADDITIONS: tuple[tuple[str, str, str], ...] = (
    ("tracks", "keeper_run_id", "VARCHAR(32) NULL"),
    ("run_artifacts", "metrics_json", "JSON NULL"),
    ("runs", "last_active_status", "VARCHAR(32) NULL"),
    ("runs", "dismissed_at", "DATETIME NULL"),
    ("runs", "mix_json", "JSON NULL"),
    ("app_settings", "uploads_directory", "VARCHAR(512) NULL"),
    ("app_settings", "exports_directory", "VARCHAR(512) NULL"),
    ("app_settings", "temp_directory", "VARCHAR(512) NULL"),
    ("app_settings", "temp_max_age_hours", "INTEGER NULL"),
    ("app_settings", "export_bundle_max_age_days", "INTEGER NULL"),
)


_PRESET_KEY_RENAMES: dict[str, str] = {
    "fast-preview": "preview",
    "balanced": "standard",
    "clean-instrumental": "high",
    "maximum": "high",
}

_PRESET_LABEL_RENAMES: dict[str, str] = {
    "Fast Preview": "Preview",
    "Balanced": "Standard",
    "Clean Instrumental": "High",
    "Maximum": "High",
}


def _existing_columns(connection, table: str) -> set[str]:
    rows = connection.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return {row[1] for row in rows}


def _apply_schema_migrations(engine: Engine) -> None:
    with engine.begin() as connection:
        for table, column, definition in _COLUMN_ADDITIONS:
            if column in _existing_columns(connection, table):
                continue
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))


def _migrate_preset_keys(engine: Engine) -> None:
    with engine.begin() as connection:
        for legacy, current in _PRESET_KEY_RENAMES.items():
            connection.execute(
                text("UPDATE runs SET preset = :current WHERE preset = :legacy"),
                {"current": current, "legacy": legacy},
            )
            connection.execute(
                text("UPDATE app_settings SET default_preset = :current WHERE default_preset = :legacy"),
                {"current": current, "legacy": legacy},
            )

        rows = connection.exec_driver_sql(
            "SELECT id, metadata_json FROM runs WHERE metadata_json IS NOT NULL"
        ).fetchall()
        for run_id, raw_metadata in rows:
            if raw_metadata in (None, "", "null"):
                continue
            try:
                metadata = json.loads(raw_metadata) if isinstance(raw_metadata, str) else raw_metadata
            except (TypeError, ValueError):
                continue
            if not isinstance(metadata, dict):
                continue
            processing = metadata.get("processing")
            if not isinstance(processing, dict):
                continue
            changed = False
            legacy_key = processing.get("profile_key")
            if isinstance(legacy_key, str) and legacy_key in _PRESET_KEY_RENAMES:
                processing["profile_key"] = _PRESET_KEY_RENAMES[legacy_key]
                changed = True
            legacy_label = processing.get("profile_label")
            if isinstance(legacy_label, str) and legacy_label in _PRESET_LABEL_RENAMES:
                processing["profile_label"] = _PRESET_LABEL_RENAMES[legacy_label]
                changed = True
            if not changed:
                continue
            metadata["processing"] = processing
            connection.execute(
                text("UPDATE runs SET metadata_json = :metadata WHERE id = :id"),
                {"metadata": json.dumps(metadata), "id": run_id},
            )


def init_database() -> None:
    from backend.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _apply_schema_migrations(engine)
    _migrate_preset_keys(engine)
