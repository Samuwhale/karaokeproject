import { useState } from 'react'

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
import type { ExportPreset } from './ExportModal'
import { ConfirmInline } from './feedback/ConfirmInline'
import { ProgressBar } from './feedback/ProgressBar'
import { RunStepper } from './feedback/RunStepper'
import { Skeleton } from './feedback/Skeleton'
import { Spinner } from './feedback/Spinner'
import { MixPanel } from './mix/MixPanel'
import { OutputIntentPicker } from './mix/OutputIntent'
import { ModelPicker } from './ModelPicker'
import { isValidModelFilename } from './modelPickerShared'
import { RUN_STATUS_SHORT_LABELS, isActiveRunStatus } from './runStatus'

const RUN_NOTE_MAX_LENGTH = 280
const RETRYABLE_RUN_STATUSES = new Set(['failed', 'cancelled'])

type RunFilter = 'all' | 'completed' | 'failed'
type WorkbenchMode = 'render' | 'result' | 'finalize'
type ExportRequest = {
  initialPreset?: ExportPreset
  lockPreset?: boolean
  contextTitle?: string
  contextDescription?: string
}

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
  onOpenExport: (request?: ExportRequest) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
}

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

function matchesRunFilter(status: string, filter: RunFilter) {
  if (filter === 'completed') return status === 'completed'
  if (filter === 'failed') return status === 'failed'
  return true
}

function resolveSelectedRun(track: TrackDetail, selectedRunId: string | null) {
  if (!track.runs.length) return null
  if (selectedRunId) {
    const matchingRun = track.runs.find((run) => run.id === selectedRunId)
    if (matchingRun) return matchingRun
  }
  return track.runs[0]
}

function mixPanelStateKey(trackId: string, run: TrackDetail['runs'][number]) {
  const artifactKey = run.artifacts.map((artifact) => `${artifact.id}:${artifact.kind}`).join('|')
  const mixKey = run.mix.stems
    .map((stem) => `${stem.artifact_id}:${Math.round(stem.gain_db * 10) / 10}:${stem.muted ? 1 : 0}`)
    .join('|')
  return `${trackId}::${run.id}::${artifactKey}::${mixKey}`
}

export function TrackDetailPanel({
  track,
  ...props
}: TrackDetailPanelProps) {
  const { hasFirstSync, tracksCount } = props

  if (!track) {
    if (hasFirstSync && tracksCount === 0) {
      return (
        <section className="section track-detail-empty">
          <p>Import a song to start rendering.</p>
        </section>
      )
    }
    if (hasFirstSync) {
      return (
        <section className="section track-detail-empty">
          <h2>Select a song to keep working.</h2>
          <p>
            Pick any track from the library to review its renders, tune the current result, or
            export it.
          </p>
          <p className="track-detail-empty-hint">
            Tip: the library filters are now organized by workflow stage so attention and ready
            results are easier to find.
          </p>
        </section>
      )
    }
    return <TrackDetailSkeleton />
  }

  return <TrackDetailContent key={track.id} track={track} {...props} />
}

type TrackDetailContentProps = Omit<TrackDetailPanelProps, 'track'> & {
  track: TrackDetail
}

function TrackDetailContent({
  track,
  selectedRunId,
  compareRunId,
  profiles,
  cachedModels,
  defaultProfileKey,
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
}: TrackDetailContentProps) {
  const [runFilter, setRunFilter] = useState<RunFilter>('all')
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [artistDraft, setArtistDraft] = useState('')
  const [renderFormOpen, setRenderFormOpen] = useState(false)
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

  const selectedRun = resolveSelectedRun(track, selectedRunId)
  const effectiveRunFilter =
    selectedRun && !matchesRunFilter(selectedRun.status, runFilter)
      ? 'all'
      : runFilter
  const trackId = track.id
  const keeperRunId = track.keeper_run_id
  const hasNoRuns = track.runs.length === 0
  const renderFormExpanded = hasNoRuns || renderFormOpen
  const isCustomProfile = nextProcessing.profile_key === CUSTOM_PROFILE_KEY
  const customModelValid = !isCustomProfile || isValidModelFilename(nextProcessing.model_filename ?? '')
  const canSubmit = customModelValid && !creatingRun
  const isActiveRun = selectedRun ? isActiveRunStatus(selectedRun.status) : false
  const isFailedRun = selectedRun ? RETRYABLE_RUN_STATUSES.has(selectedRun.status) : false
  const selectedRunMixable = selectedRun
    ? selectedRun.artifacts.some((artifact) => isStemKind(artifact.kind))
    : false
  const filteredRuns = track.runs.filter((run) => matchesRunFilter(run.status, effectiveRunFilter))
  const compareRun =
    compareRunId && selectedRun && compareRunId !== selectedRun.id
      ? track.runs.find((run) => run.id === compareRunId) ?? null
      : null
  const bothCompleted =
    !!selectedRun && !!compareRun && selectedRun.status === 'completed' && compareRun.status === 'completed'
  const compareCandidates = selectedRun
    ? track.runs.filter((run) => run.status === 'completed' && run.id !== selectedRun.id)
    : []
  const runMode: 'active' | 'failed' | 'completed-mixable' | 'completed-empty' | null =
    hasNoRuns || !selectedRun
      ? null
      : isActiveRun
        ? 'active'
        : isFailedRun
          ? 'failed'
          : selectedRunMixable
            ? 'completed-mixable'
            : 'completed-empty'
  const resultModeAvailable = runMode === 'completed-mixable' || runMode === 'completed-empty'
  const activeRunCount = track.runs.filter((run) => isActiveRunStatus(run.status)).length
  const completedRunCount = track.runs.filter((run) => run.status === 'completed').length
  const failedRunCount = track.runs.filter((run) => RETRYABLE_RUN_STATUSES.has(run.status)).length
  const selectedRunStatusCopy =
    !selectedRun || hasNoRuns
      ? 'Choose a profile when you are ready to create the first render.'
      : isActiveRun
        ? 'The selected render is still processing. You can keep browsing the library while it finishes.'
        : isFailedRun
          ? 'This render needs attention before the result tools become useful.'
          : runMode === 'completed-empty'
            ? 'This render finished, but it did not produce mixable stems.'
            : 'This render is ready to shape, compare, and export.'
  const selectedRunMeta = selectedRun
    ? `${selectedRun.processing.profile_label} · ${statusLabel(selectedRun.status)}`
    : 'No render selected'
  const finalRenderSummary = keeperRunId ? 'Final version selected' : 'No final version yet'
  const setupProfileLabel =
    nextProcessing.profile_key === CUSTOM_PROFILE_KEY
      ? nextProcessing.model_filename?.trim()
        ? `Custom model · ${nextProcessing.model_filename.trim()}`
        : 'Custom model'
      : profiles.find((profile) => profile.key === nextProcessing.profile_key)?.label ?? 'Shared default'
  const runHistoryOpen = track.runs.length <= 2 || effectiveRunFilter !== 'all' || compareRunId !== null
  const renderSetupOpen = hasNoRuns || renderFormOpen
  const suggestedWorkbenchMode: WorkbenchMode =
    runMode === 'completed-mixable' || runMode === 'completed-empty'
      ? 'result'
      : 'render'
  const primaryAction =
    runMode === 'completed-mixable' || runMode === 'completed-empty'
      ? {
          label:
            selectedRun && keeperRunId === selectedRun.id
              ? 'Export Final Version'
              : 'Choose Final Version',
          action:
            selectedRun && keeperRunId === selectedRun.id
              ? () =>
                  onOpenExport({
                    initialPreset: 'final-mix',
                    contextTitle: `Export ${track.title}`,
                    contextDescription: 'Using the selected final version for this song.',
                  })
              : () => setWorkbenchMode('finalize'),
        }
      : runMode === 'failed' && selectedRun
        ? {
            label: retryingRunId === selectedRun.id ? 'Retrying…' : 'Retry Render',
            action: () => void onRetryRun(selectedRun.id),
            disabled: retryingRunId === selectedRun.id,
          }
        : !renderFormExpanded
          ? {
              label: hasNoRuns ? 'Start First Render' : 'Queue Another Render',
              action: () => setRenderFormOpen(true),
            }
          : null
  const [workbenchMode, setWorkbenchMode] = useState<WorkbenchMode>(suggestedWorkbenchMode)
  const resolvedWorkbenchMode =
    workbenchMode === 'result' && !resultModeAvailable
      ? 'render'
      : workbenchMode === 'finalize' && !selectedRun
        ? resultModeAvailable
          ? 'result'
          : 'render'
        : workbenchMode

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
    setTitleDraft(track.title)
    setArtistDraft(track.artist ?? '')
    setEditing(true)
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
      // error surfaced elsewhere; remain in edit mode
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

  const workflowCopy =
    runMode === 'active' && selectedRun
      ? {
          title: 'Render in progress',
          description: selectedRun.status_message || 'Processing continues in the background.',
        }
      : runMode === 'failed' && selectedRun
        ? {
            title: selectedRun.status === 'cancelled' ? 'Render cancelled' : 'Render needs attention',
            description:
              selectedRun.error_message ||
              'Retry with the same settings or choose a different model.',
          }
        : runMode === 'completed-mixable'
          ? {
              title: 'Result ready to shape',
              description: 'Pick the outcome you want, fine-tune the stems, then export.',
            }
          : runMode === 'completed-empty'
            ? {
                title: 'Render finished without mixable stems',
                description: 'Try a different model to get usable stems for mixing.',
              }
            : {
                title: 'Choose how this song should be split',
                description: 'Start a render, then come back here to compare and export the result.',
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
                {updatingTrack ? <><Spinner /> Saving…</> : 'Save'}
              </button>
              <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="track-detail-head-meta">
            <h2>{track.title}</h2>
            <p className="track-detail-subtitle">
              {track.artist ?? 'Unknown artist'} · {formatDuration(track.duration_seconds)} ·{' '}
              {track.source_type === 'youtube' ? 'YouTube' : track.source_format}
            </p>
            <div className="track-detail-hero">
              <span className="track-detail-hero-label">Current step</span>
              <strong>{workflowCopy.title}</strong>
              <p>{workflowCopy.description}</p>
              <span className="track-detail-hero-meta">{selectedRunMeta}</span>
            </div>
          </div>
        )}

        {!editing ? (
          <div className="track-detail-head-actions">
            {primaryAction ? (
              <button
                type="button"
                className="button-primary"
                disabled={primaryAction.disabled}
                onClick={primaryAction.action}
              >
                {primaryAction.label}
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

      <div className="track-workflow">
        <div className="workbench-mode-switch" role="tablist" aria-label="Song workspace">
          <button
            type="button"
            role="tab"
            aria-selected={resolvedWorkbenchMode === 'render'}
            className={`workbench-mode-tab ${resolvedWorkbenchMode === 'render' ? 'workbench-mode-tab-active' : ''}`}
            onClick={() => setWorkbenchMode('render')}
          >
            1. Render
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={resolvedWorkbenchMode === 'result'}
            className={`workbench-mode-tab ${resolvedWorkbenchMode === 'result' ? 'workbench-mode-tab-active' : ''}`}
            onClick={() => setWorkbenchMode('result')}
            disabled={!resultModeAvailable}
          >
            2. Shape & export
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={resolvedWorkbenchMode === 'finalize'}
            className={`workbench-mode-tab ${resolvedWorkbenchMode === 'finalize' ? 'workbench-mode-tab-active' : ''}`}
            onClick={() => setWorkbenchMode('finalize')}
            disabled={!selectedRun}
          >
            3. Compare & decide
          </button>
        </div>

        {resolvedWorkbenchMode === 'render' ? (
          <div className="track-detail-section">
            <div className="track-detail-section-head">
              <h3 className="subsection-head">Render</h3>
              <p>Choose the current render, then queue another one only when you need a different split.</p>
            </div>

            {track.runs.length === 0 ? (
              <div className="workflow-step-blocked">
                <p>No renders yet. Start with a model below to create the first result.</p>
              </div>
            ) : null}

            {track.runs.length ? (
              <details className="track-advanced track-detail-disclosure" open={runHistoryOpen}>
                <summary className="track-advanced-summary">
                  <div>
                    <strong>Render history</strong>
                    <p>{selectedRunMeta}</p>
                  </div>
                  <span>{track.runs.length} total · {activeRunCount} active</span>
                </summary>
                <div className="track-detail-disclosure-body">
                  <div className="run-history">
                    <div className="run-history-head">
                      <div className="track-detail-section-head">
                        <h4 className="subsection-head">Available renders</h4>
                        <p>Pick the version you want to work from right now.</p>
                      </div>
                      <div className="run-history-head-actions">
                        <span className="run-history-summary">
                          {completedRunCount} completed · {failedRunCount} needs attention
                        </span>
                        <select
                          aria-label="Filter renders"
                          className="run-filter"
                          value={effectiveRunFilter}
                          onChange={(event) => setRunFilter(event.target.value as RunFilter)}
                        >
                          <option value="all">All</option>
                          <option value="completed">Completed</option>
                          <option value="failed">Failed</option>
                        </select>
                      </div>
                    </div>
                    {filteredRuns.length === 0 ? (
                      <p className="empty-state run-history-empty">No renders match this filter.</p>
                    ) : null}
                    <div className="run-selector">
                      {filteredRuns.map((run, index) => {
                        const isActiveChip = selectedRun?.id === run.id
                        const isKeeper = keeperRunId === run.id
                        const isCompareTarget = compareRunId === run.id
                        const isCompleted = run.status === 'completed'
                        const shortcutDigit = index < 9 ? index + 1 : null

                        return (
                          <div
                            key={run.id}
                            className={`run-chip ${isActiveChip ? 'run-chip-active' : ''} ${isKeeper ? 'run-chip-keeper' : ''} ${isCompareTarget ? 'run-chip-compare' : ''}`}
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
                              <span>{isCompleted ? formatTimestampShort(run.updated_at) : statusLabel(run.status)}</span>
                              {isKeeper || isCompareTarget ? (
                                <em className="run-chip-meta">
                                  {isKeeper ? 'Final version' : null}
                                  {isKeeper && isCompareTarget ? ' · ' : null}
                                  {isCompareTarget ? 'Compare target' : null}
                                </em>
                              ) : null}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </details>
            ) : null}

            <details className="track-advanced track-detail-disclosure" open={renderSetupOpen}>
              <summary className="track-advanced-summary">
                <div>
                  <strong>Queue another render</strong>
                  <p>{selectedRunStatusCopy}</p>
                </div>
                <span>{setupProfileLabel}</span>
              </summary>
              <div className="track-detail-disclosure-body">
                <div className="render-form">
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
                      {creatingRun ? <><Spinner /> Queueing…</> : hasNoRuns ? 'Start Render' : 'Queue Another Render'}
                    </button>
                    {!hasNoRuns ? (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => setRenderFormOpen(false)}
                      >
                        Hide Setup
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </details>

            {runMode === 'active' && selectedRun ? (
              <div className="workflow-step-block">
                <div className="run-stepper-wrap">
                  <RunStepper
                    status={selectedRun.status}
                    lastActiveStatus={selectedRun.last_active_status}
                  />
                </div>
                <div className="run-progress">
                  <ProgressBar value={selectedRun.progress} label={selectedRun.status_message} />
                </div>
                <div className="run-actions">
                  <ConfirmInline
                    label="Cancel Render"
                    pendingLabel="Cancelling…"
                    confirmLabel="Cancel render"
                    cancelLabel="Keep running"
                    prompt="Cancel this render?"
                    pending={cancellingRunId === selectedRun.id}
                    onConfirm={() => onCancelRun(selectedRun.id)}
                  />
                </div>
              </div>
            ) : null}

            {runMode === 'failed' && selectedRun ? (
              <div className="run-failure">
                <div className="run-failure-head">
                  <span className="run-failure-title">
                    {selectedRun.status === 'cancelled' ? 'This render was cancelled' : 'This render failed'}
                  </span>
                  <button
                    type="button"
                    className="button-primary"
                    disabled={retryingRunId === selectedRun.id}
                    onClick={() => void onRetryRun(selectedRun.id)}
                  >
                    {retryingRunId === selectedRun.id ? <><Spinner /> Retrying…</> : 'Retry Render'}
                  </button>
                </div>
                {selectedRun.error_message ? (
                  <p className="run-failure-message">{selectedRun.error_message}</p>
                ) : null}
                <p className="run-failure-next">
                  {selectedRun.status === 'cancelled'
                    ? 'Retry keeps the same settings, or choose a different model above.'
                    : 'Retry keeps the same settings. If this keeps failing, choose a different model above.'}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {resolvedWorkbenchMode === 'result' ? (
          <div className="track-detail-section">
            <div className="track-detail-section-head">
              <h3 className="subsection-head">Shape & export</h3>
              <p>
                {runMode === 'completed-mixable'
                  ? 'Choose the listening outcome first, then export it or fine-tune the stems.'
                  : runMode === 'completed-empty'
                    ? 'This render finished, but it does not have usable stems for shaping.'
                    : hasNoRuns
                      ? 'Run this song once to unlock result and export tools.'
                      : 'Pick a completed render to unlock result and export tools.'}
              </p>
            </div>

            {resultModeAvailable && selectedRun ? (
              runMode === 'completed-mixable' ? (
                <>
                  <OutputIntentPicker
                    run={selectedRun}
                    profiles={profiles}
                    onApplyTemplate={handleApplyIntent}
                    onRerunWithProfile={handleRerunWithProfile}
                    onExport={() =>
                      onOpenExport({
                        initialPreset: 'final-mix',
                        lockPreset: true,
                        contextTitle: `Export current result for ${track.title}`,
                        contextDescription:
                          'The final mix preset is already chosen. Adjust format or packaging only if needed.',
                      })
                    }
                    onReveal={() => void onReveal({ kind: 'track-outputs', track_id: trackId })}
                  />
                  <details className="track-advanced">
                    <summary className="track-advanced-summary">
                      <div>
                        <strong>Fine-tune stems manually</strong>
                        <p>Open the full mixer only when the quick result needs manual balancing.</p>
                      </div>
                      <span>{selectedRun.mix.is_default ? 'Unity balance' : 'Custom balance saved'}</span>
                    </summary>
                    <div className="track-advanced-body">
                      <MixPanel
                        key={mixPanelStateKey(trackId, selectedRun)}
                        run={selectedRun}
                        saving={savingMixRunId === selectedRun.id}
                        onSave={(stems) => onSaveMix(trackId, selectedRun.id, stems)}
                      />
                    </div>
                  </details>
                </>
              ) : (
                <div className="workflow-step-blocked">
                  <p>No stems are available for this render.</p>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => setWorkbenchMode('render')}
                  >
                    Try Another Render
                  </button>
                </div>
              )
            ) : (
              <div className="workflow-step-blocked">
                <p>
                  {hasNoRuns
                    ? 'Start a render in the Render tab to create the first result.'
                    : 'Select a completed render in the Render tab to unlock export tools.'}
                </p>
              </div>
            )}
          </div>
        ) : null}

        {resolvedWorkbenchMode === 'finalize' ? (
          <div className="track-detail-section">
            <div className="track-detail-section-head">
              <h3 className="subsection-head">Compare & decide</h3>
              <p>Choose the final version, add context, and clean up the other renders only when you are sure.</p>
            </div>

            {selectedRun ? (
              <div className="track-advanced-body track-advanced-body-open">
                <div className="track-detail-decision-summary">
                  <strong>{finalRenderSummary}</strong>
                  <p>Use the selected render as the decision anchor, then compare it against another completed render if needed.</p>
                </div>

                <div className="selected-render-actions">
                  <button
                    type="button"
                    className={`button-secondary ${keeperRunId === selectedRun.id ? 'button-secondary-active' : ''}`}
                    disabled={settingKeeper || selectedRun.status !== 'completed'}
                    onClick={() => void handleToggleKeeper(selectedRun.id)}
                  >
                    {keeperRunId === selectedRun.id ? 'Clear Final Version' : 'Set as Final Version'}
                  </button>
                  {compareCandidates.length > 0 ? (
                    <label className="field field-inline">
                      <span>Compare with</span>
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

                {bothCompleted && compareRun ? (
                  <CompareView
                    runA={selectedRun}
                    runB={compareRun}
                    keeperRunId={keeperRunId}
                    settingKeeper={settingKeeper}
                    onSetKeeper={(runId) => onSetKeeper(trackId, runId)}
                  />
                ) : compareCandidates.length > 0 ? (
                  <div className="workflow-step-blocked">
                    <p>Choose a second completed render to compare waveform overlays and metrics.</p>
                  </div>
                ) : (
                  <div className="workflow-step-blocked">
                    <p>Create a second completed render before you compare alternatives.</p>
                  </div>
                )}

                <RunNoteEditor
                  key={`${selectedRun.id}:${selectedRun.note}`}
                  runId={selectedRun.id}
                  note={selectedRun.note}
                  saving={savingNoteRunId === selectedRun.id}
                  onSave={onSetRunNote}
                />

                {keeperRunId ? (
                  <div className="workflow-step-footer">
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() =>
                        onOpenExport({
                          initialPreset: 'final-mix',
                          contextTitle: `Export ${track.title}`,
                          contextDescription: 'Using the selected final version for this song.',
                        })
                      }
                    >
                      Export Final Version
                    </button>
                    <ConfirmInline
                      label="Remove Other Renders"
                      pendingLabel="Cleaning…"
                      confirmLabel="Delete other renders"
                      cancelLabel="Keep them"
                      prompt="Delete every non-final render for this track?"
                      onConfirm={() => onPurgeNonKeepers(trackId)}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="workflow-step-blocked">
                <p>Select a render in the Render tab first.</p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function TrackDetailSkeleton() {
  return (
    <section className="section">
      <div className="skeleton-detail">
        <Skeleton width="55%" height={22} />
        <Skeleton width="80%" height={12} />
        <div className="skeleton-row">
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
        placeholder="Add context about why this render is the one to keep."
        maxLength={RUN_NOTE_MAX_LENGTH}
        rows={3}
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
