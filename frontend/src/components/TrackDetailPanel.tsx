import { useState } from 'react'

import type { ProcessingProfile, RunArtifact, RunDetail, RunProcessingConfigInput, TrackDetail } from '../types'
import { WaveformPreview } from './WaveformPreview'

type TrackDetailPanelProps = {
  track: TrackDetail | null
  selectedRunId: string | null
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  defaultMp3Bitrate: string
  creatingRun: boolean
  onSelectRun: (runId: string) => void
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<void>
}

type DraftState<T> = {
  sourceKey: string
  values: T
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString()
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function canPreview(kind: string) {
  return ['instrumental', 'export-audio-mp3', 'source', 'vocals'].includes(kind)
}

function resolveSelectedRun(track: TrackDetail, selectedRunId: string | null) {
  if (!track.runs.length) {
    return null
  }

  if (selectedRunId) {
    const matchingRun = track.runs.find((run) => run.id === selectedRunId)
    if (matchingRun) {
      return matchingRun
    }
  }

  return track.runs[0]
}

function getPreviewArtifacts(run: RunDetail | null) {
  const artifactOrder = ['instrumental', 'export-audio-mp3', 'source', 'vocals']
  return [...(run?.artifacts.filter((artifact) => canPreview(artifact.kind)) ?? [])].sort(
    (left, right) => artifactOrder.indexOf(left.kind) - artifactOrder.indexOf(right.kind),
  )
}

function resolveProfile(profiles: ProcessingProfile[], profileKey: string) {
  return profiles.find((profile) => profile.key === profileKey) ?? null
}

export function TrackDetailPanel({
  track,
  selectedRunId,
  profiles,
  defaultProfileKey,
  defaultMp3Bitrate,
  creatingRun,
  onSelectRun,
  onCreateRun,
}: TrackDetailPanelProps) {
  const processingKey = `${defaultProfileKey}|${defaultMp3Bitrate}`
  const [nextProcessingState, setNextProcessingState] = useState<DraftState<RunProcessingConfigInput>>({
    sourceKey: processingKey,
    values: {
      profile_key: defaultProfileKey,
      export_mp3_bitrate: defaultMp3Bitrate,
    },
  })
  const nextProcessing =
    nextProcessingState.sourceKey === processingKey
      ? nextProcessingState.values
      : {
          profile_key: defaultProfileKey,
          export_mp3_bitrate: defaultMp3Bitrate,
        }

  if (!track) {
    return (
      <section className="section empty-panel">
        Select a track to inspect source audio, run history, and export artifacts.
      </section>
    )
  }

  const selectedRun = resolveSelectedRun(track, selectedRunId)
  const previewArtifacts = getPreviewArtifacts(selectedRun)
  const trackId = track.id
  const nextProfile = resolveProfile(profiles, nextProcessing.profile_key)
  const selectedProfile = selectedRun ? resolveProfile(profiles, selectedRun.processing.profile_key) : null

  async function handleCreateRun() {
    await onCreateRun(trackId, nextProcessing)
  }

  return (
    <section className="section">
      <div className="track-detail-head">
        <div>
          <h2>{track.title}</h2>
          <p>
            {track.artist ?? 'Unknown artist'} · {formatDuration(track.duration_seconds)} · {track.source_filename}
          </p>
        </div>

        <div className="rerun-controls">
          <label className="field">
            <span>Profile</span>
            <select
              value={nextProcessing.profile_key}
              onChange={(event) =>
                setNextProcessingState({
                  sourceKey: processingKey,
                  values: { ...nextProcessing, profile_key: event.target.value },
                })
              }
            >
              {profiles.map((profile) => (
                <option key={profile.key} value={profile.key}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>MP3 bitrate</span>
            <input
              type="text"
              value={nextProcessing.export_mp3_bitrate}
              onChange={(event) =>
                setNextProcessingState({
                  sourceKey: processingKey,
                  values: { ...nextProcessing, export_mp3_bitrate: event.target.value },
                })
              }
            />
          </label>

          <button type="button" className="button-primary" disabled={creatingRun} onClick={() => void handleCreateRun()}>
            {creatingRun ? 'Queueing…' : 'New run'}
          </button>
        </div>
      </div>

      {nextProfile ? (
        <p className="profile-meta" style={{ marginBottom: 'var(--space-md)' }}>
          {nextProfile.description} <code>{nextProfile.model_filename}</code>
        </p>
      ) : null}

      <div className="metric-line" style={{ marginBottom: 'var(--space-md)' }}>
        <div>
          <span>Runs</span>
          <strong>{track.runs.length}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{track.source_type === 'youtube' ? 'YouTube' : track.source_format}</strong>
        </div>
        <div>
          <span>Created</span>
          <strong>{formatTimestamp(track.created_at)}</strong>
        </div>
      </div>

      {track.runs.length ? (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <p className="subsection-label">Run history</p>
          <div className="run-selector">
            {track.runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className={`run-chip ${selectedRun?.id === run.id ? 'run-chip-active' : ''}`}
                onClick={() => onSelectRun(run.id)}
              >
                <span>{run.processing.profile_label}</span>
                <strong>{Math.round(run.progress * 100)}%</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selectedRun ? (
        <>
          <div className="metric-line" style={{ marginBottom: 'var(--space-md)' }}>
            <div>
              <span>Profile</span>
              <strong>{selectedRun.processing.profile_label}</strong>
            </div>
            <div>
              <span>Model</span>
              <strong>{selectedRun.processing.model_filename}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{selectedRun.status_message}</strong>
            </div>
            <div>
              <span>MP3</span>
              <strong>{selectedRun.processing.export_mp3_bitrate}</strong>
            </div>
            <div>
              <span>Updated</span>
              <strong>{formatTimestamp(selectedRun.updated_at)}</strong>
            </div>
            <div>
              <span>Output</span>
              <strong>{selectedRun.output_directory ?? 'Pending'}</strong>
            </div>
          </div>

          {selectedProfile ? (
            <p className="profile-meta" style={{ marginBottom: 'var(--space-md)' }}>
              {selectedProfile.description}
              {selectedRun.status === 'failed' ? ' Try another model profile or bitrate.' : ''}
            </p>
          ) : null}

          {selectedRun.error_message ? <p className="error-message">{selectedRun.error_message}</p> : null}

          {previewArtifacts.length ? (
            <div className="preview-stack" style={{ marginBottom: 'var(--space-md)' }}>
              {previewArtifacts.map((artifact) => (
                <WaveformPreview key={artifact.id} title={artifact.label} url={artifact.download_url} />
              ))}
            </div>
          ) : (
            <p className="empty-state" style={{ marginBottom: 'var(--space-md)' }}>
              No previewable artifacts yet for this run.
            </p>
          )}

          {selectedRun.artifacts.length ? (
            <div>
              <p className="subsection-label">Artifacts</p>
              <div className="row-list">
                {selectedRun.artifacts.map((artifact) => (
                  <RunArtifactRow key={artifact.id} artifact={artifact} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="empty-state">This track does not have any runs yet.</p>
      )}
    </section>
  )
}

function RunArtifactRow({ artifact }: { artifact: RunArtifact }) {
  return (
    <article className="row-line">
      <div>
        <strong>{artifact.label}</strong>
        <p>
          {artifact.kind} · {artifact.format}
        </p>
      </div>
      <a className="button-secondary" href={artifact.download_url} target="_blank" rel="noreferrer">
        Open
      </a>
    </article>
  )
}
