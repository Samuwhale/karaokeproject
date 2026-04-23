import { QueueList } from '../QueueList'
import { StagedImportsPanel } from '../StagedImportsPanel'
import {
  SONG_BROWSE_SORT_OPTIONS,
  applySongBrowse,
  filterReadyTracks,
  trackStageSummary,
} from '../trackListView'
import { isActiveRunStatus } from '../runStatus'
import type { SongsView } from '../../routes'
import type {
  ProcessingProfile,
  QueueRunEntry,
  RunProcessingConfigInput,
  StagedImport,
  TrackSummary,
  UpdateImportDraftInput,
} from '../../types'

type SongsPageProps = {
  view: SongsView
  tracks: TrackSummary[]
  currentTrackId: string | null
  stagedImports: StagedImport[]
  queueRuns: QueueRunEntry[]
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  confirmingDrafts: boolean
  cancellingRunId: string | null
  retryingRunId: string | null
  onViewChange: (view: SongsView) => void
  onOpenTrack: (track: TrackSummary, options?: { runId?: string | null; runStatus?: string | null }) => void
  onAddSongs: () => void
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<void>
  onDismissRun: (runId: string) => Promise<void>
  onUpdateStagedImport: (draftId: string, payload: UpdateImportDraftInput) => Promise<void>
  onDiscardStagedImport: (draftId: string) => Promise<void>
  onConfirmStagedImports: (payload: {
    draft_ids: string[]
    queue: boolean
    processing?: RunProcessingConfigInput
    processing_overrides?: Record<string, RunProcessingConfigInput>
  }) => Promise<unknown>
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remaining = (total % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

function artistLine(track: TrackSummary) {
  return track.artist ?? 'Unknown artist'
}

function sectionCopy(view: SongsView['mode']) {
  switch (view) {
    case 'needs-attention':
      return 'Resolve imports and active split work here before you move back into Mix.'
    case 'ready':
      return 'Finished songs stay light here so you can move straight into the mixer.'
    default:
      return 'Search the full song library and reopen any workspace from one list.'
  }
}

function rowStatusCopy(track: TrackSummary) {
  const stage = trackStageSummary(track)
  if (stage.key === 'ready' || stage.key === 'final') {
    return track.has_custom_mix ? 'Saved balance ready' : 'Default balance ready'
  }
  return stage.description
}

function SongRow({
  track,
  currentTrackId,
  onOpen,
}: {
  track: TrackSummary
  currentTrackId: string | null
  onOpen: (track: TrackSummary) => void
}) {
  const stage = trackStageSummary(track)
  const initials = track.title.trim().slice(0, 1).toUpperCase() || 'S'
  const metadata = [
    artistLine(track),
    formatDuration(track.duration_seconds),
    track.run_count === 0 ? 'No versions' : `${track.run_count} version${track.run_count === 1 ? '' : 's'}`,
  ].join(' · ')

  return (
    <article className={`kp-song-row ${currentTrackId === track.id ? 'kp-song-row-active' : ''}`}>
      <button type="button" className="kp-song-row-button" onClick={() => onOpen(track)}>
        <span className="kp-song-art" aria-hidden>
          {track.thumbnail_url ? <img src={track.thumbnail_url} alt="" loading="lazy" /> : initials}
        </span>
        <span className="kp-song-copy">
          <strong>{track.title}</strong>
          <span>{metadata}</span>
        </span>
        <span className="kp-song-status">
          <strong>{stage.label}</strong>
          <span>{rowStatusCopy(track)}</span>
        </span>
        <span className="kp-song-action">{stage.actionLabel}</span>
      </button>
    </article>
  )
}

export function SongsPage({
  view,
  tracks,
  currentTrackId,
  stagedImports,
  queueRuns,
  profiles,
  defaultProfileKey,
  confirmingDrafts,
  cancellingRunId,
  retryingRunId,
  onViewChange,
  onOpenTrack,
  onAddSongs,
  onCancelRun,
  onRetryRun,
  onDismissRun,
  onUpdateStagedImport,
  onDiscardStagedImport,
  onConfirmStagedImports,
}: SongsPageProps) {
  const browseTracks = applySongBrowse(tracks, { search: view.search, sort: view.sort })
  const readyTracks = filterReadyTracks(browseTracks)
  const activeEntries = queueRuns.filter((entry) => isActiveRunStatus(entry.run.status))
  const blockedEntries = queueRuns.filter(
    (entry) => entry.run.status === 'failed' || entry.run.status === 'cancelled',
  )
  const attentionEntries = [...activeEntries, ...blockedEntries]
  const attentionCount = stagedImports.length + attentionEntries.length
  const readyCount = filterReadyTracks(tracks).length

  return (
    <section className="kp-page kp-songs-page">
      <header className="kp-page-header kp-songs-header">
        <div>
          <h1>Songs</h1>
          <p>{sectionCopy(view.mode)}</p>
        </div>
        <button type="button" className="button-primary" onClick={onAddSongs}>
          Add songs
        </button>
      </header>

      <div className="kp-songs-toolbar">
        <div className="kp-segmented-control" role="tablist" aria-label="Song worklist views">
          <button
            type="button"
            role="tab"
            aria-selected={view.mode === 'needs-attention'}
            className={view.mode === 'needs-attention' ? 'kp-segmented-active' : ''}
            onClick={() => onViewChange({ ...view, mode: 'needs-attention' })}
          >
            Needs Attention ({attentionCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view.mode === 'ready'}
            className={view.mode === 'ready' ? 'kp-segmented-active' : ''}
            onClick={() => onViewChange({ ...view, mode: 'ready' })}
          >
            Ready ({readyCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view.mode === 'library'}
            className={view.mode === 'library' ? 'kp-segmented-active' : ''}
            onClick={() => onViewChange({ ...view, mode: 'library' })}
          >
            Library ({tracks.length})
          </button>
        </div>

        {view.mode === 'library' ? (
          <div className="kp-library-controls">
            <input
              type="search"
              className="kp-search-field"
              placeholder="Search title or artist"
              aria-label="Search songs by title or artist"
              value={view.search}
              onChange={(event) => onViewChange({ ...view, search: event.target.value })}
            />
            <select
              aria-label="Sort songs"
              value={view.sort}
              onChange={(event) =>
                onViewChange({ ...view, sort: event.target.value as SongsView['sort'] })
              }
            >
              {SONG_BROWSE_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {view.mode === 'needs-attention' ? (
        <div className="kp-songs-flow">
          {stagedImports.length > 0 ? (
            <section className="kp-songs-section">
              <header className="kp-section-header">
                <div>
                  <h2>Import review</h2>
                  <p>Clean the metadata once, resolve duplicates, then decide whether to split immediately.</p>
                </div>
              </header>
              <StagedImportsPanel
                stagedImports={stagedImports}
                profiles={profiles}
                defaultProfileKey={defaultProfileKey}
                confirming={confirmingDrafts}
                onUpdateStagedImport={onUpdateStagedImport}
                onDiscardStagedImport={onDiscardStagedImport}
                onConfirmStagedImports={onConfirmStagedImports}
              />
            </section>
          ) : null}

          {attentionEntries.length > 0 ? (
            <section className="kp-songs-section">
              <header className="kp-section-header">
                <div>
                  <h2>Processing</h2>
                  <p>Keep running splits and failures visible without letting them crowd the rest of the library.</p>
                </div>
              </header>
              <QueueList
                showHeader={false}
                entries={attentionEntries}
                onSelectRun={(trackId, runId) => {
                  const track = tracks.find((item) => item.id === trackId)
                  if (!track) return
                  const runStatus = attentionEntries.find((entry) => entry.run.id === runId)?.run.status ?? null
                  onOpenTrack(track, { runId, runStatus })
                }}
                onCancelRun={onCancelRun}
                onRetryRun={onRetryRun}
                onDismissRun={onDismissRun}
                cancellingRunId={cancellingRunId}
                retryingRunId={retryingRunId}
              />
            </section>
          ) : null}

          {stagedImports.length === 0 && attentionEntries.length === 0 ? (
            <p className="empty-state">Nothing needs attention right now. Open Ready when a split finishes, or add more songs.</p>
          ) : null}
        </div>
      ) : null}

      {view.mode === 'ready' ? (
        readyTracks.length > 0 ? (
          <div className="kp-song-list">
            {readyTracks.map((track) => (
              <SongRow
                key={track.id}
                track={track}
                currentTrackId={currentTrackId}
                onOpen={(nextTrack) => onOpenTrack(nextTrack)}
              />
            ))}
          </div>
        ) : (
          <p className="empty-state">No finished songs are ready to reopen in Mix yet.</p>
        )
      ) : null}

      {view.mode === 'library' ? (
        browseTracks.length > 0 ? (
          <div className="kp-song-list">
            {browseTracks.map((track) => (
              <SongRow
                key={track.id}
                track={track}
                currentTrackId={currentTrackId}
                onOpen={(nextTrack) => onOpenTrack(nextTrack)}
              />
            ))}
          </div>
        ) : tracks.length > 0 ? (
          <p className="empty-state">No songs match this search.</p>
        ) : (
          <p className="empty-state">No songs yet. Add files or a YouTube link to stage the first batch.</p>
        )
      ) : null}
    </section>
  )
}
