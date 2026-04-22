import { useEffect, useState } from 'react'

import type {
  CachedModel,
  ProcessingProfile,
  RevealFolderInput,
  RunMixStemEntry,
  RunProcessingConfigInput,
  TrackDetail,
} from '../types'
import { CUSTOM_PROFILE_KEY } from '../types'
import { isStemKind } from '../stems'
import { CompareView } from './CompareView'
import { ConfirmInline } from './feedback/ConfirmInline'
import { ProgressBar } from './feedback/ProgressBar'
import { RunStepper } from './feedback/RunStepper'
import { Skeleton } from './feedback/Skeleton'
import { Spinner } from './feedback/Spinner'
import { MixPanel } from './mix/MixPanel'
import { OutputIntentPicker } from './mix/OutputIntent'
import { ModelPicker, isValidModelFilename } from './ModelPicker'
import { RUN_STATUS_SHORT_LABELS } from './runStatus'

const RUN_NOTE_MAX_LENGTH = 280

type RunFilter = 'all' | 'completed' | 'failed'

type TrackDetailPanelProps = {
  track: TrackDetail | null
  selectedRunId: string | null
  compareRunId: string | null
  profiles: ProcessingProfile[]
  cachedModels: CachedModel[]
  defaultProfileKey: string
  hasFirstSync: boolean
  tracksCount: number
  creatingRun: boolean
  cancellingRunId: string | null
  retryingRunId: string | null
  settingKeeper: boolean
  savingNoteRunId: string | null
  savingMixRunId: string | null
  updatingTrack: boolean
  onSelectRun: (runId: string) => void
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<void>
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<void>
  onSetKeeper: (trackId: string, runId: string | null) => Promise<void>
  onPurgeNonKeepers: (trackId: string) => void
  onSetRunNote: (runId: string, note: string) => Promise<void>
  onSaveMix: (trackId: string, runId: string, stems: RunMixStemEntry[]) => Promise<void>
  onUpdateTrack: (trackId: string, payload: { title?: string; artist?: string | null }) => Promise<void>
  onDeleteTrack: (trackId: string) => void
  onToggleCompare: (runId: string) => void
  onOpenExport: () => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
}

const ACTIVE_RUN_STATUSES = new Set(['queued', 'preparing', 'separating', 'exporting'])
const RETRYABLE_RUN_STATUSES = new Set(['failed', 'cancelled'])

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
  return RUN_STATUS_SHORT_LABELS[status] ?? status
}

function resolveSelectedRun(track: TrackDetail, selectedRunId: string | null) {
  if (!track.runs.length) return null
  if (selectedRunId) {
    const matchingRun = track.runs.find((run) => run.id === selectedRunId)
    if (matchingRun) return matchingRun
  }
  return track.runs[0]
}

export function TrackDetailPanel({
  track,
  selectedRunId,
  compareRunId,
  profiles,
  cachedModels,
  defaultProfileKey,
  hasFirstSync,
  tracksCount,
  creatingRun,
  cancellingRunId,
  retryingRunId,
  settingKeeper,
  savingNoteRunId,
  savingMixRunId,
  updatingTrack,
  onSelectRun,
  onCreateRun,
  onCancelRun,
  onRetryRun,
  onSetKeeper,
  onPurgeNonKeepers,
  onSetRunNote,
  onSaveMix,
  onUpdateTrack,
  onDeleteTrack,
  onToggleCompare,
  onOpenExport,
  onReveal,
}: TrackDetailPanelProps) {
  const [runFilter, setRunFilter] = useState<RunFilter>('completed')
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [artistDraft, setArtistDraft] = useState('')
  const [renderFormOpen, setRenderFormOpen] = useState(false)

  useEffect(() => {
    setEditing(false)
    setRenderFormOpen(false)
  }, [track?.id])

  const [nextProcessingState, setNextProcessingState] = useState<DraftState<RunProcessingConfigInput>>({
    sourceKey: defaultProfileKey,
    values: {
      profile_key: defaultProfileKey,
      model_filename: '',
    },
  })
  const nextProcessing =
    nextProcessingState.sourceKey === defaultProfileKey
      ? nextProcessingState.values
      : {
          profile_key: defaultProfileKey,
          model_filename: '',
        }

  if (!track) {
    if (hasFirstSync && tracksCount === 0) {
      return (
        <section className="section track-detail-empty">
          <h2>Nothing to review yet</h2>
          <p>
            Once you import sources, this panel shows track details, render history, results, mix controls, and export files for the selected track.
          </p>
        </section>
      )
    }
    return <TrackDetailSkeleton />
  }

  const selectedRun = resolveSelectedRun(track, selectedRunId)
  const trackId = track.id
  const isCustomProfile = nextProcessing.profile_key === CUSTOM_PROFILE_KEY
  const customModelValid = !isCustomProfile || isValidModelFilename(nextProcessing.model_filename ?? '')
  const canSubmit = customModelValid && !creatingRun
  const isActiveRun = selectedRun ? ACTIVE_RUN_STATUSES.has(selectedRun.status) : false
  const isFailedRun = selectedRun ? RETRYABLE_RUN_STATUSES.has(selectedRun.status) : false
  const selectedRunMixable = selectedRun
    ? selectedRun.artifacts.some((artifact) => isStemKind(artifact.kind))
    : false

  const keeperRunId = track.keeper_run_id
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
  const compareCandidates = selectedRun
    ? track.runs.filter((run) => run.status === 'completed' && run.id !== selectedRun.id)
    : []

  const hasNoRuns = track.runs.length === 0
  const renderFormExpanded = hasNoRuns || renderFormOpen

  async function handleCreateRun() {
    const payload: RunProcessingConfigInput = {
      profile_key: nextProcessing.profile_key,
    }
    if (nextProcessing.profile_key === CUSTOM_PROFILE_KEY) {
      payload.model_filename = (nextProcessing.model_filename ?? '').trim()
    }
    await onCreateRun(trackId, payload)
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

  async function handleApplyIntent(stems: RunMixStemEntry[]) {
    if (!selectedRun) return
    await onSaveMix(trackId, selectedRun.id, stems)
  }

  function handleRerunWithProfile(profileKey: string) {
    setNextProcessingState({
      sourceKey: defaultProfileKey,
      values: { profile_key: profileKey, model_filename: '' },
    })
    setRenderFormOpen(true)
  }

  function handleCompareTargetChange(nextRunId: string) {
    if (compareRunId && compareRunId !== nextRunId) onToggleCompare(compareRunId)
    if (!nextRunId) return
    if (compareRunId !== nextRunId) onToggleCompare(nextRunId)
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
                New Render
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
              prompt={`Delete "${track.title}" and all its renders?`}
              onConfirm={() => onDeleteTrack(trackId)}
            />
          </div>
        ) : null}
      </div>

      {renderFormExpanded ? (
        <div className="render-form track-detail-section">
          <div className="track-detail-section-head">
            <h3 className="subsection-head">Render Setup</h3>
            <p>Choose the model for the next render of this track.</p>
          </div>
          <ModelPicker
            profileKey={nextProcessing.profile_key}
            modelFilename={nextProcessing.model_filename ?? ''}
            profiles={profiles}
            cachedModels={cachedModels}
            labelId="render-form"
            onProfileChange={(nextKey) =>
              setNextProcessingState({
                sourceKey: defaultProfileKey,
                values: { ...nextProcessing, profile_key: nextKey },
              })
            }
            onModelFilenameChange={(next) =>
              setNextProcessingState({
                sourceKey: defaultProfileKey,
                values: { ...nextProcessing, model_filename: next },
              })
            }
          />
          <div className="render-form-actions">
            <button
              type="button"
              className="button-primary"
              disabled={!canSubmit}
              onClick={() => void handleCreateRun()}
            >
              {creatingRun ? <><Spinner /> Queueing</> : hasNoRuns ? 'Queue First Render' : 'Queue Render'}
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
        </div>
      ) : null}

      <div className="metric-line track-detail-summary">
        <div>
          <span>Renders</span>
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
        <div className="run-history track-detail-section">
          <div className="run-history-head">
            <h3 className="subsection-head">Render History</h3>
            <select
              aria-label="Filter renders"
              className="run-filter"
              value={runFilter}
              onChange={(event) => setRunFilter(event.target.value as RunFilter)}
            >
              <option value="all">All renders</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          {filteredRuns.length === 0 ? (
            <p className="empty-state run-history-empty">No renders match this filter.</p>
          ) : null}
          <div className="run-selector">
            {filteredRuns.map((run, index) => {
              const isActive = selectedRun?.id === run.id
              const isKeeper = keeperRunId === run.id
              const isCompareTarget = compareRunId === run.id
              const isCompleted = run.status === 'completed'
              const shortcutDigit = index < 9 ? index + 1 : null
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
                    title={shortcutDigit ? `Press ${shortcutDigit}` : undefined}
                  >
                    <strong>
                      {shortcutDigit ? (
                        <kbd className="run-chip-key" aria-hidden>
                          {shortcutDigit}
                        </kbd>
                      ) : null}
                      {run.processing.profile_label}
                    </strong>
                    <span>
                      {isCompleted
                        ? formatTimestampShort(run.updated_at)
                        : statusLabel(run.status)}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {selectedRun ? (
        <>
          <div className="track-detail-section">
            <div className="track-detail-section-head">
              <h3 className="subsection-head">Selected Render</h3>
              <p>
                {selectedRun.processing.profile_label} ·{' '}
                {selectedRun.status === 'completed'
                  ? `Updated ${formatTimestampShort(selectedRun.updated_at)}`
                  : statusLabel(selectedRun.status)}
              </p>
            </div>
            <div className="selected-render-actions">
              <button
                type="button"
                className={`button-secondary ${keeperRunId === selectedRun.id ? 'button-secondary-active' : ''}`}
                disabled={settingKeeper || selectedRun.status !== 'completed'}
                onClick={() => void handleToggleKeeper(selectedRun.id)}
              >
                {keeperRunId === selectedRun.id ? 'Clear Final Render' : 'Mark Final Render'}
              </button>
              {compareCandidates.length > 0 ? (
                <label className="field field-inline">
                  <span>Compare Against</span>
                  <select
                    value={compareRunId ?? ''}
                    onChange={(event) => handleCompareTargetChange(event.target.value)}
                  >
                    <option value="">No comparison</option>
                    {compareCandidates.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.processing.profile_label} · {formatTimestampShort(run.updated_at)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>

          <RunNoteEditor
            runId={selectedRun.id}
            note={selectedRun.note}
            saving={savingNoteRunId === selectedRun.id}
            onSave={onSetRunNote}
          />

          <div className="run-stepper-wrap">
            <RunStepper
              status={selectedRun.status}
              lastActiveStatus={selectedRun.last_active_status}
            />
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
                    ? 'This render was cancelled'
                    : 'This render failed'}
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
                    'Render Again'
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
                  ? 'Queue another render to pick up where you left off, or change the render setup above.'
                  : 'Retry keeps the same settings. If this keeps failing, open Render Setup above and try a different model.'}
              </p>
            </div>
          ) : null}

          {isActiveRun ? (
            <div className="run-actions">
              <ConfirmInline
                label="Cancel render"
                pendingLabel="Cancelling…"
                confirmLabel="Cancel render"
                cancelLabel="Keep running"
                prompt="Cancel this render?"
                pending={cancellingRunId === selectedRun.id}
                onConfirm={() => onCancelRun(selectedRun.id)}
              />
            </div>
          ) : null}

          {selectedRunMixable ? (
            <OutputIntentPicker
              run={selectedRun}
              profiles={profiles}
              onApplyTemplate={handleApplyIntent}
              onRerunWithProfile={handleRerunWithProfile}
              onExport={onOpenExport}
              onReveal={() => void onReveal({ kind: 'track-outputs', track_id: trackId })}
            />
          ) : null}

          {selectedRunMixable ? (
            <MixPanel
              run={selectedRun}
              saving={savingMixRunId === selectedRun.id}
              onSave={(stems) => onSaveMix(trackId, selectedRun.id, stems)}
            />
          ) : null}

          {!selectedRunMixable && !isActiveRun ? (
            <p className="empty-state preview-empty">
              No stems yet for this render.
            </p>
          ) : null}

          {bothCompleted && compareRun ? (
            <CompareView
              runA={selectedRun}
              runB={compareRun}
              keeperRunId={keeperRunId}
              settingKeeper={settingKeeper}
              onSetKeeper={(runId) => onSetKeeper(trackId, runId)}
            />
          ) : null}

          {keeperRunId ? (
            <div className="bookmark-actions">
              <ConfirmInline
                label="Purge non-final renders"
                pendingLabel="Cleaning…"
                confirmLabel="Delete other renders"
                cancelLabel="Keep them"
                prompt="Delete every non-final render for this track?"
                onConfirm={() => onPurgeNonKeepers(trackId)}
              />
            </div>
          ) : null}
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
        placeholder="Note — why keep this final render? What sounded off?"
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
