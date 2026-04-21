from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.orm import Session

from backend.adapters.youtube import YtDlpAdapter
from backend.core.config import RuntimeSettings
from backend.db.models import Track
from backend.schemas.imports import (
    ConfirmYouTubeImportItemRequest,
    ConfirmYouTubeImportRequest,
    ConfirmYouTubeImportResponse,
    ExistingTrackDuplicateResponse,
    ResolveYouTubeImportResponse,
    ResolvedYouTubeImportItemResponse,
)
from backend.services.processing import build_processing_from_request, serialize_processing_config, serialize_processing_profiles
from backend.services.settings import get_or_create_settings
from backend.services.tracks import create_run, create_track, list_track_library, serialize_track_summary


@dataclass(frozen=True)
class DuplicateLookup:
    by_video_id: dict[str, list[Track]]
    by_source_url: dict[str, list[Track]]


def resolve_youtube_import(
    session: Session,
    runtime_settings: RuntimeSettings,
    source_url: str,
) -> ResolveYouTubeImportResponse:
    application_settings = get_or_create_settings(session, runtime_settings)
    processing = build_processing_from_request(None, application_settings)
    adapter = YtDlpAdapter(runtime_settings)
    resolved = adapter.resolve(source_url)
    duplicates = _build_duplicate_lookup(list_track_library(session))

    items = [
        ResolvedYouTubeImportItemResponse(
            video_id=item.video_id,
            source_url=item.source_url,
            canonical_source_url=item.canonical_source_url,
            title=item.title,
            artist=item.artist,
            thumbnail_url=item.thumbnail_url,
            duration_seconds=item.duration_seconds,
            duplicate_tracks=_serialize_duplicate_tracks(_find_duplicates(duplicates, item.video_id, item.canonical_source_url)),
        )
        for item in resolved.items
    ]

    return ResolveYouTubeImportResponse(
        source_kind=resolved.source_kind,
        source_url=resolved.source_url,
        title=resolved.title,
        item_count=len(items),
        items=items,
        profiles=serialize_processing_profiles(),
        default_processing=serialize_processing_config(processing),
    )


def confirm_youtube_import(
    session: Session,
    runtime_settings: RuntimeSettings,
    payload: ConfirmYouTubeImportRequest,
) -> ConfirmYouTubeImportResponse:
    if not payload.items:
        raise ValueError("Select at least one YouTube item to import.")

    application_settings = get_or_create_settings(session, runtime_settings)
    processing = build_processing_from_request(payload.processing, application_settings)
    adapter = YtDlpAdapter(runtime_settings)
    duplicates = _build_duplicate_lookup(list_track_library(session))

    affected_tracks: list[Track] = []
    created_track_count = 0
    reused_track_count = 0

    for item in payload.items:
        matching_duplicates = _find_duplicates(duplicates, item.video_id, item.canonical_source_url)
        if item.duplicate_action == "reuse-existing":
            track = _reuse_existing_track(session, item, matching_duplicates, processing)
            reused_track_count += 1
        else:
            downloaded = adapter.download(
                source_url=item.source_url,
                destination_dir=runtime_settings.uploads_dir,
                filename_prefix=uuid4().hex,
            )
            track = create_track(
                session,
                source_path=downloaded.source_path,
                source_filename=downloaded.source_filename,
                title=item.title,
                artist=item.artist,
                processing=processing,
                source_metadata=_youtube_track_metadata(item),
            )
            created_track_count += 1
            _register_duplicate(duplicates, track)

        affected_tracks.append(track)

    session.commit()
    for track in affected_tracks:
        session.refresh(track)

    return ConfirmYouTubeImportResponse(
        tracks=[serialize_track_summary(track) for track in affected_tracks],
        created_track_count=created_track_count,
        reused_track_count=reused_track_count,
    )


def _reuse_existing_track(
    session: Session,
    item: ConfirmYouTubeImportItemRequest,
    matching_duplicates: list[Track],
    processing: dict[str, str],
) -> Track:
    if not matching_duplicates:
        raise ValueError(f"'{item.title}' does not have an exact source duplicate available to reuse.")

    if not item.existing_track_id:
        raise ValueError(f"Choose an existing track to reuse for '{item.title}'.")

    track = session.get(Track, item.existing_track_id)
    if track is None:
        raise ValueError(f"Existing track '{item.existing_track_id}' no longer exists.")

    if matching_duplicates and track.id not in {candidate.id for candidate in matching_duplicates}:
        raise ValueError(f"Track '{track.title}' is not an exact source duplicate for '{item.title}'.")

    create_run(track, processing)
    session.flush()
    return track


def _youtube_track_metadata(item: ConfirmYouTubeImportItemRequest) -> dict[str, str]:
    return {
        "source_type": "youtube",
        "source_url": item.canonical_source_url,
        "video_id": item.video_id,
        "thumbnail_url": item.thumbnail_url or "",
        "source_playlist_url": item.source_url,
    }


def _serialize_duplicate_tracks(tracks: list[Track]) -> list[ExistingTrackDuplicateResponse]:
    return [
        ExistingTrackDuplicateResponse(
            id=track.id,
            title=track.title,
            artist=track.artist,
            source_filename=track.source_filename,
        )
        for track in tracks
    ]


def _build_duplicate_lookup(tracks: list[Track]) -> DuplicateLookup:
    by_video_id: dict[str, list[Track]] = {}
    by_source_url: dict[str, list[Track]] = {}

    for track in tracks:
        metadata = track.metadata_json or {}
        video_id = metadata.get("video_id")
        if isinstance(video_id, str) and video_id:
            by_video_id.setdefault(video_id, []).append(track)

        source_url = metadata.get("source_url")
        if isinstance(source_url, str) and source_url:
            by_source_url.setdefault(source_url, []).append(track)

    return DuplicateLookup(by_video_id=by_video_id, by_source_url=by_source_url)


def _find_duplicates(lookup: DuplicateLookup, video_id: str, canonical_source_url: str) -> list[Track]:
    seen: dict[str, Track] = {}
    for track in lookup.by_video_id.get(video_id, []):
        seen[track.id] = track
    for track in lookup.by_source_url.get(canonical_source_url, []):
        seen[track.id] = track
    return list(seen.values())


def _register_duplicate(lookup: DuplicateLookup, track: Track) -> None:
    metadata = track.metadata_json or {}
    video_id = metadata.get("video_id")
    if isinstance(video_id, str) and video_id:
        lookup.by_video_id.setdefault(video_id, []).append(track)

    source_url = metadata.get("source_url")
    if isinstance(source_url, str) and source_url:
        lookup.by_source_url.setdefault(source_url, []).append(track)
