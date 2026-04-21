from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.session import Base


def new_identifier() -> str:
    return uuid4().hex


class RunStatus(StrEnum):
    queued = "queued"
    preparing = "preparing"
    separating = "separating"
    exporting = "exporting"
    completed = "completed"
    failed = "failed"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class AppSettings(TimestampMixin, Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    output_directory: Mapped[str] = mapped_column(String(512))
    model_cache_directory: Mapped[str] = mapped_column(String(512))
    default_preset: Mapped[str] = mapped_column(String(64))
    export_mp3_bitrate: Mapped[str] = mapped_column(String(32), default="320k")


class Track(TimestampMixin, Base):
    __tablename__ = "tracks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_identifier)
    title: Mapped[str] = mapped_column(String(255))
    artist: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_filename: Mapped[str] = mapped_column(String(255))
    source_path: Mapped[str] = mapped_column(String(512))
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    runs: Mapped[list[Run]] = relationship(
        back_populates="track",
        cascade="all, delete-orphan",
        order_by=lambda: Run.created_at.desc(),
    )


class Run(TimestampMixin, Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_identifier)
    track_id: Mapped[str] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"))
    preset: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default=RunStatus.queued.value)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    status_message: Mapped[str] = mapped_column(String(255), default="Queued for processing")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_directory: Mapped[str | None] = mapped_column(String(512), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    track: Mapped[Track] = relationship(back_populates="runs")
    artifacts: Mapped[list[RunArtifact]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by=lambda: RunArtifact.created_at,
    )


class RunArtifact(Base):
    __tablename__ = "run_artifacts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_identifier)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(255))
    format: Mapped[str] = mapped_column(String(32))
    path: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)

    run: Mapped[Run] = relationship(back_populates="artifacts")
