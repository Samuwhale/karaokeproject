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
)


def _existing_columns(connection, table: str) -> set[str]:
    rows = connection.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return {row[1] for row in rows}


def _apply_schema_migrations(engine: Engine) -> None:
    with engine.begin() as connection:
        for table, column, definition in _COLUMN_ADDITIONS:
            if column in _existing_columns(connection, table):
                continue
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))


def init_database() -> None:
    from backend.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _apply_schema_migrations(engine)
