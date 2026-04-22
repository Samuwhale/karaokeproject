import { useEffect, useState } from 'react'

import type { ProcessingProfile, RunArtifact, RunDetail, RunProcessingConfigInput, TrackDetail } from '../types'
import { CompareView } from './CompareView'
import { ConfirmInline } from './feedback/ConfirmInline'
import { ProgressBar } from './feedback/ProgressBar'
import { RunStepper } from './feedback/RunStepper'
import { Skeleton } from './feedback/Skeleton'
import { Spinner } from './feedback/Spinner'
import { formatSize } from './metrics'
import { RUN_STATUS_LABELS } from './runStatus'
import { WaveformPreview } from './WaveformPreview'

const RUN_NOTE_MAX_LENGTH = 280

type RunFilter = 'all' | 'completed' | 'failed'

type TrackDetailPanelProps = {
  track: TrackDetail | null
  selectedRunId: string | null
  compareRunId: string | null
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  defaultMp3Bitrate: string
  hasFirstSync: boolean
  tracksCount: number
  creatingRun: boolean
  cancellingRunId: string | null
  retryingRunId: string | null
  settingKeeper: boolean
  purgingNonKeepers: boolean
  savingNoteRunId: string | null
  updatingTrack: boolean
  deletingTrack: boolean
  onSelectRun: (runId: string) => void
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<void>
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<void>
  onSetKeeper: (trackId: string, runId: string | null) => Promise<void>
  onPurgeNonKeepers: (trackId: string) => Promise<void>
  onSetRunNote: (runId: string, note: string) => Promise<void>
  onUpdateTrack: (trackId: string, payload: { title?: string; artist?: string | null }) => Promise<void>
  onDeleteTrack: (trackId: string) => Promise<void>
  onToggleCompare: (runId: string) => void
  onOpenExport: () => void
}

const ACTIVE_RUN_STATUSES = new Set(['queued', 'preparing', 'separating', 'exporting'])
const RETRYABLE_RUN_STATUSES = new Set(['failed', 'cancelled'])
const BITRATE_PATTERN = /^\d{2,3}k$/
const BITRATE_HINT = 'Use a value like 192k or 320k.'

type DraftState<T> = {
  sourceKey: string
  values: T
}

function formatTimestampShort(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function statusLabel(status: string) {
  return RUN_STATUS_LABELS[status] ?? status
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

function getPackageArtifact(run: RunDetail | null): RunArtifact | null {
  return run?.artifacts.find((artifact) => artifact.kind === 'package') ?? null
}

function resolveProfile(profiles: ProcessingProfile[], profileKey: string) {
  return profiles.find((profile) => profile.key === profileKey) ?? null
}

function totalRunBytes(run: RunDetail) {
  return run.artifacts.reduce((total, artifact) => total + (artifact.metrics?.size_bytes ?? 0), 0)
}

function resolveKeeperLabel(track: TrackDetail | null) {
  if (!track?.keeper_run_id) return null
  const keeper = track.runs.find((run) => run.id === track.keeper_run_id)
  return keeper?.processing.profile_label ?? null
}

export function TrackDetailPanel({
  track,
  selectedRunId,
  compareRunId,
  profiles,
  defaultProfileKey,
  defaultMp3Bitrate,
  hasFirstSync,
  tracksCount,
  creatingRun,
  cancellingRunId,
  retryingRunId,
  settingKeeper,
  purgingNonKeepers,
  savingNoteRunId,
  updatingTrack,
  deletingTrack,
  onSelectRun,
  onCreateRun,
  onCancelRun,
  onRetryRun,
  onSetKeeper,
  onPurgeNonKeepers,
  onSetRunNote,
  onUpdateTrack,
  onDeleteTrack,
  onToggleCompare,
  onOpenExport,
}: TrackDetailPanelProps) {
  const [runFilter, setRunFilter] = useState<RunFilter>('all')
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [artistDraft, setArtistDraft] = useState('')
  const [renderFormOpen, setRenderFormOpen] = useState(false)

  useEffect(() => {
    setEditing(false)
    setRenderFormOpen(false)
  }, [track?.id])

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
    if (hasFirstSync && tracksCount === 0) {
      return (
        <section className="section track-detail-empty">
          <h2>Nothing to review yet</h2>
          <p>
            Once you add sources and queue a render, this panel shows the run history, previews,
            and export controls for the selected track.
          </p>
        </section>
      )
    }
    return <TrackDetailSkeleton />
  }

  const selectedRun = resolveSelectedRun(track, selectedRunId)
  const previewArtifacts = getPreviewArtifacts(selectedRun)
  const packageArtifact = getPackageArtifact(selectedRun)
  const trackId = track.id
  const nextProfile = resolveProfile(profiles, nextProcessing.profile_key)
  const bitrateValid = BITRATE_PATTERN.test(nextProcessing.export_mp3_bitrate)
  const canSubmit = bitrateValid && !creatingRun
  const isActiveRun = selectedRun ? ACTIVE_RUN_STATUSES.has(selectedRun.status) : false
  const isFailedRun = selectedRun ? RETRYABLE_RUN_STATUSES.has(selectedRun.status) : false

  const keeperRunId = track.keeper_run_id
  const keeperLabel = resolveKeeperLabel(track)
  const filteredRuns = track.runs.filter((run) => {
    if (runFilter === 'completed') return run.status === 'completed'
    if (runFilter === 'failed') return run.status === 'failed'
    return true
  })
  const compareRun = compareRunId && selectedRun && compareRunId !== selectedRun.id
    ? track.runs.find((run) => run.id === compareRunId) ?? null
    : null
  const bothCompleted =
    !!selectedRun && !!compareRun && selectedRun.status === 'completed' && compareRun.status === 'completed'
  const nonKeeperTerminal = keeperRunId
    ? track.runs.filter(
        (run) => run.id !== keeperRunId && (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled'),
      )
    : []
  const reclaimBytes = nonKeeperTerminal.reduce((total, run) => total + totalRunBytes(run), 0)
  const reclaimLabel = reclaimBytes > 0 ? ` · ${formatSize(reclaimBytes)}` : ''

  const hasNoRuns = track.runs.length === 0
  const renderFormExpanded = hasNoRuns || renderFormOpen
  const completedRunCount = track.runs.filter((run) => run.status === 'completed').length
  const showFinalCta = completedRunCount > 0 && !keeperRunId

  async function handleCreateRun() {
    await onCreateRun(trackId, nextProcessing)
    setRenderFormOpen(false)
  }

  async function handleToggleKeeper(runId: string) {
    if (settingKeeper) return
    await onSetKeeper(trackId, keeperRunId === runId ? null : runId)
  }

  function startEditing() {
    setTitleDraft(track?.title ?? '')
    setArtistDraft(track?.artist ?? '')
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
  }

  async function handleSaveEdits() {
    const nextTitle = titleDraft.trim()
    if (!nextTitle) return
    try {
      await onUpdateTrack(trackId, {
        title: nextTitle,
        artist: artistDraft.trim() ? artistDraft.trim() : null,
      })
      setEditing(false)
    } catch {
      // error surfaced via toast; stay in edit mode
    }
  }

  return (
    <section className="section track-detail">
      <div className="track-detail-head">
        {editing ? (
          <div className="track-detail-edit">
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                autoFocus
              />
            </label>
            <label className="field">
              <span>Artist</span>
              <input
                type="text"
                placeholder="Optional"
                value={artistDraft}
                onChange={(event) => setArtistDraft(event.target.value)}
              />
            </label>
            <div className="track-detail-edit-actions">
              <button
                type="button"
                className="button-primary"
                disabled={updatingTrack || !titleDraft.trim()}
                onClick={() => void handleSaveEdits()}
              >
                {updatingTrack ? <><Spinner /> Saving</> : 'Save'}
              </button>
              <button type="button" className="button-secondary" onClick={cancelEditing}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="track-detail-head-meta">
            <h2>{track.title}</h2>
            <p className="track-detail-subtitle">
              {track.artist ?? 'Unknown artist'} · {formatDuration(track.duration_seconds)} · {track.source_type === 'youtube' ? 'YouTube' : track.source_format}
            </p>
          </div>
        )}

        {!editing ? (
          <div className="track-detail-head-actions">
            {!renderFormExpanded ? (
              <button
                type="button"
                className="button-primary"
                onClick={() => setRenderFormOpen(true)}
              >
                New render
              </button>
            ) : null}
            <button type="button" className="button-secondary" onClick={startEditing}>
              Rename
            </button>
            <ConfirmInline
              label="Delete"
              pendingLabel="Deleting…"
              confirmLabel="Delete track"
              cancelLabel="Keep it"
              prompt={`Delete "${track.title}" and all its runs?`}
              pending={deletingTrack}
              onConfirm={() => onDeleteTrack(trackId)}
            />
          </div>
        ) : null}
      </div>

      {renderFormExpanded ? (
        <div className="render-form">
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
              placeholder="e.g. 320k"
              value={nextProcessing.export_mp3_bitrate}
              aria-invalid={!bitrateValid}
              onChange={(event) =>
                setNextProcessingState({
                  sourceKey: processingKey,
                  values: { ...nextProcessing, export_mp3_bitrate: event.target.value },
                })
              }
            />
            {!bitrateValid ? <span className="field-error">{BITRATE_HINT}</span> : null}
          </label>
          <div className="render-form-actions">
            <button
              type="button"
              className="button-primary"
              disabled={!canSubmit}
              onClick={() => void handleCreateRun()}
            >
              {creatingRun ? <><Spinner /> Queueing</> : hasNoRuns ? 'Start first render' : 'Queue render'}
            </button>
            {!hasNoRuns ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => setRenderFormOpen(false)}
              >
                Cancel
              </button>
            ) : null}
          </div>
          {nextProfile ? <p className="profile-meta">{nextProfile.description}</p> : null}
        </div>
      ) : null}

      {keeperRunId ? (
        <div className="final-row">
          <div className="final-row-meta">
            <span className="final-row-label">Final</span>
            <strong>{keeperLabel ?? '—'}</strong>
          </div>
          <div className="final-row-actions">
            <button type="button" className="button-primary" onClick={onOpenExport}>
              Export…
            </button>
            {nonKeeperTerminal.length ? (
              <ConfirmInline
                label={`Delete ${nonKeeperTerminal.length} other${nonKeeperTerminal.length === 1 ? '' : 's'}${reclaimLabel}`}
                pendingLabel="Cleaning…"
                confirmLabel="Delete other runs"
                cancelLabel="Keep them"
                prompt={`Delete ${nonKeeperTerminal.length} non-final run${nonKeeperTerminal.length === 1 ? '' : 's'}?`}
                pending={purgingNonKeepers}
                onConfirm={() => onPurgeNonKeepers(trackId)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="metric-line track-detail-summary">
        <div>
          <span>Runs</span>
          <strong>{track.runs.length}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{track.source_type === 'youtube' ? 'YouTube' : track.source_format}</strong>
        </div>
        <div>
          <span>Imported</span>
          <strong>{formatTimestampShort(track.created_at)}</strong>
        </div>
      </div>

      {track.runs.length ? (
        <div className="run-history">
          <div className="run-history-head">
            <h3 className="subsection-head">Runs</h3>
            <div className="run-history-head-actions">
              {showFinalCta ? (
                <span className="inline-hint">Star a run to mark it final</span>
              ) : null}
              <select
                aria-label="Filter runs"
                className="run-filter"
                value={runFilter}
                onChange={(event) => setRunFilter(event.target.value as RunFilter)}
              >
                <option value="all">All runs</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
          {filteredRuns.length === 0 ? (
            <p className="empty-state run-history-empty">No runs match this filter.</p>
          ) : null}
          <div className="run-selector">
            {filteredRuns.map((run) => {
              const isActive = selectedRun?.id === run.id
              const isKeeper = keeperRunId === run.id
              const isCompareTarget = compareRunId === run.id
              const isCompleted = run.status === 'completed'
              const keeperDisabled = settingKeeper || !isCompleted
              const compareDisabled = !isCompleted || isActive
              return (
                <div
                  key={run.id}
                  className={`run-chip ${isActive ? 'run-chip-active' : ''} ${
                    isKeeper ? 'run-chip-keeper' : ''
                  } ${isCompareTarget ? 'run-chip-compare' : ''}`}
                >
                  <button
                    type="button"
                    className="run-chip-select"
                    onClick={() => onSelectRun(run.id)}
                  >
                    <strong>{run.processing.profile_label}</strong>
                    <span>
                      {isCompleted
                        ? formatTimestampShort(run.updated_at)
                        : statusLabel(run.status)}
                    </span>
                  </button>
                  <div className="run-chip-actions">
                    <button
                      type="button"
                      className="run-chip-star"
                      title={isKeeper ? 'Clear final' : 'Mark as final'}
                      aria-label={isKeeper ? 'Clear final' : 'Mark as final'}
                      disabled={keeperDisabled}
                      onClick={() => void handleToggleKeeper(run.id)}
                    >
                      {isKeeper ? '★' : '☆'}
                    </button>
                    <button
                      type="button"
                      className={`run-chip-compare-toggle ${isCompareTarget ? 'active' : ''}`}
                      title={isCompareTarget ? 'Stop comparing' : 'Compare with selected run'}
                      aria-label={isCompareTarget ? 'Stop comparing' : 'Compare with selected run'}
                      disabled={compareDisabled}
                      onClick={() => onToggleCompare(run.id)}
                    >
                      A|B
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {selectedRun ? (
        <>
          <RunNoteEditor
            runId={selectedRun.id}
            note={selectedRun.note}
            saving={savingNoteRunId === selectedRun.id}
            onSave={onSetRunNote}
          />

          <div className="run-stepper-wrap">
            <RunStepper status={selectedRun.status} />
          </div>

          {isActiveRun ? (
            <div className="run-progress">
              <ProgressBar value={selectedRun.progress} label={selectedRun.status_message} />
            </div>
          ) : null}

          {isFailedRun ? (
            <div className="run-failure">
              <div className="run-failure-head">
                <span className="run-failure-title">
                  {selectedRun.status === 'cancelled'
                    ? 'This run was cancelled'
                    : 'This run failed'}
                </span>
                <button
                  type="button"
                  className="button-primary"
                  disabled={retryingRunId === selectedRun.id}
                  onClick={() => void onRetryRun(selectedRun.id)}
                >
                  {retryingRunId === selectedRun.id ? (
                    <><Spinner /> Retrying</>
                  ) : selectedRun.status === 'cancelled' ? (
                    'Run again'
                  ) : (
                    'Retry'
                  )}
                </button>
              </div>
              {selectedRun.error_message ? (
                <p className="run-failure-message">{selectedRun.error_message}</p>
              ) : null}
              <p className="run-failure-next">
                {selectedRun.status === 'cancelled'
                  ? 'Run again to pick up where you left off, or start a new render with different settings above.'
                  : 'Retry keeps the same settings. If this keeps failing, open New render above and try a different profile or bitrate.'}
              </p>
            </div>
          ) : null}

          {isActiveRun ? (
            <div className="run-actions">
              <ConfirmInline
                label="Cancel run"
                pendingLabel="Cancelling…"
                confirmLabel="Cancel run"
                cancelLabel="Keep running"
                prompt="Cancel run?"
                pending={cancellingRunId === selectedRun.id}
                onConfirm={() => onCancelRun(selectedRun.id)}
              />
            </div>
          ) : null}

          {packageArtifact ? (
            <div className="exports-row">
              <span className="exports-row-label">Export</span>
              <a
                className="button-secondary"
                href={packageArtifact.download_url}
                target="_blank"
                rel="noreferrer"
              >
                Download {packageArtifact.label}
              </a>
            </div>
          ) : null}

          {previewArtifacts.length ? (
            <div className="preview-stack">
              {previewArtifacts.map((artifact) => (
                <WaveformPreview
                  key={artifact.id}
                  title={artifact.label}
                  url={artifact.download_url}
                  peaks={artifact.metrics?.peaks}
                  metrics={artifact.metrics ?? null}
                />
              ))}
            </div>
          ) : (
            <p className="empty-state preview-empty">
              {isActiveRun
                ? 'Previews will appear once the run finishes separating audio.'
                : 'No previewable artifacts yet for this run.'}
            </p>
          )}

          {bothCompleted && compareRun ? <CompareView runA={selectedRun} runB={compareRun} /> : null}
        </>
      ) : null}
    </section>
  )
}

function TrackDetailSkeleton() {
  return (
    <section className="section">
      <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
        <Skeleton width="55%" height={22} />
        <Skeleton width="80%" height={12} />
        <div style={{ display: 'grid', gridAutoFlow: 'column', gap: 'var(--space-sm)' }}>
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
        <Skeleton height={2} />
        <Skeleton width="100%" height={60} />
      </div>
    </section>
  )
}

type RunNoteEditorProps = {
  runId: string
  note: string
  saving: boolean
  onSave: (runId: string, note: string) => Promise<void>
}

function RunNoteEditor({ runId, note, saving, onSave }: RunNoteEditorProps) {
  const [draft, setDraft] = useState(note)

  useEffect(() => {
    setDraft(note)
    // Sync on run switch only — dashboard polling updates `note` continuously,
    // and re-syncing there would clobber the user's in-flight typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const trimmed = draft.trim()
  const dirty = trimmed !== note.trim()

  function handleBlur() {
    if (!dirty || saving) return
    void onSave(runId, trimmed).catch(() => undefined)
  }

  return (
    <label className="run-note">
      <textarea
        value={draft}
        placeholder="Note — why keep this run? What sounded off?"
        maxLength={RUN_NOTE_MAX_LENGTH}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleBlur}
      />
      <span className="run-note-status">
        {saving ? (
          <>
            <Spinner /> saving
          </>
        ) : dirty ? (
          `${draft.length}/${RUN_NOTE_MAX_LENGTH} · unsaved`
        ) : (
          `${draft.length}/${RUN_NOTE_MAX_LENGTH}`
        )}
      </span>
    </label>
  )
}
