import type { TrackSummary } from '../types'

type TrackListProps = {
  tracks: TrackSummary[]
  selectedTrackId: string | null
  onSelect: (trackId: string) => void
}

function formatStatus(status: string | null) {
  return status ? status.replace('-', ' ') : 'no runs'
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function TrackList({ tracks, selectedTrackId, onSelect }: TrackListProps) {
  return (
    <div className="track-list-wrap">
      <div className="section-head">
        <h2>Library</h2>
        <span className="section-head-meta">{tracks.length}</span>
      </div>

      {tracks.length === 0 ? (
        <p className="empty-state" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
          No tracks yet. Import local files or resolve a YouTube URL below.
        </p>
      ) : (
        <div className="track-list">
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              className={`track-card ${selectedTrackId === track.id ? 'track-card-active' : ''}`}
              onClick={() => onSelect(track.id)}
            >
              <div className="track-card-header">
                <div>
                  <strong>{track.title}</strong>
                  <p>{track.artist ?? track.source_filename}</p>
                </div>
                <span className={`badge badge-${track.latest_run?.status ?? 'idle'}`}>
                  {formatStatus(track.latest_run?.status ?? null)}
                </span>
              </div>
              <div className="track-card-footer">
                <span>
                  {track.source_type === 'youtube' ? 'youtube' : 'local'} · {formatDuration(track.duration_seconds)}
                </span>
                <span>{track.run_count} runs</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
