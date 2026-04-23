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
  onBackToLibrary: () => void
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
  if (seconds === null) return '—'
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
          <p>Import a song to start splitting.</p>
        </section>
      )
    }
    if (hasFirstSync) {
      return (
        <section className="section track-detail-empty">
          <h2>Select a song to keep working.</h2>
          <p>
            Pick any song from the library to review its splits, tune the current result, or
            export it.
          </p>
          <p className="track-detail-empty-hint">
            Tip: the library filters are organized by what needs action next, so blocked work and
            completed results are easier to find.
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
  onBackToLibrary,
}: TrackDetailContentProps) {
  const [runFilter, setRunFilter] = useState<RunFilter>('all')
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [artistDraft, setArtistDraft] = useState('')
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
      ? 'Choose a profile when you are ready to create the first split.'
      : isActiveRun
        ? 'The selected split is still processing. You can keep browsing the library while it finishes.'
        : isFailedRun
          ? 'This split needs attention before the result tools become useful.'
          : runMode === 'completed-empty'
            ? 'This split finished, but it did not produce mixable stems.'
            : 'This split is ready to shape, compare, and turn into a final version.'
  const selectedRunMeta = selectedRun
    ? `${selectedRun.processing.profile_label} · ${statusLabel(selectedRun.status)}`
    : 'No split selected'
  const finalRenderSummary = keeperRunId ? 'Final version selected' : 'No final version yet'
  const setupProfileLabel =
    nextProcessing.profile_key === CUSTOM_PROFILE_KEY
      ? nextProcessing.model_filename?.trim()
        ? `Custom model · ${nextProcessing.model_filename.trim()}`
        : 'Custom model'
      : profiles.find((profile) => profile.key === nextProcessing.profile_key)?.label ?? 'Shared default'
  const decisionAvailable = !!selectedRun && selectedRun.status === 'completed'
  const [runHistoryOpen, setRunHistoryOpen] = useState(false)
  const [songSettingsOpen, setSongSettingsOpen] = useState(false)
  const [renderSetupOpen, setRenderSetupOpen] = useState(
    hasNoRuns || runMode === 'failed' || runMode === null,
  )
  const [manualMixOpen, setManualMixOpen] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(!keeperRunId)
  const primaryAction =
    runMode === 'failed' && selectedRun
      ? {
          label: retryingRunId === selectedRun.id ? 'Retrying…' : 'Retry Split',
          action: () => void onRetryRun(selectedRun.id),
          disabled: retryingRunId === selectedRun.id,
        }
      : runMode === 'completed-mixable' && selectedRun && keeperRunId === selectedRun.id
        ? {
            label: 'Export Final Version',
            action: () =>
              onOpenExport({
                initialPreset: 'final-mix',
                contextTitle: `Export ${track.title}`,
                contextDescription: 'Using the selected final version for this song.',
              }),
          }
        : !renderSetupOpen
          ? {
              label: hasNoRuns ? 'Start First Split' : 'Queue Another Split',
              action: () => {
                setRenderSetupOpen(true)
              },
            }
          : null

  async function handleCreateRun() {
    const payload: RunProcessingConfigInput = {
      profile_key: nextProcessing.profile_key,
    }
    if (nextProcessing.profile_key === CUSTOM_PROFILE_KEY) {
      payload.model_filename = (nextProcessing.model_filename ?? '').trim()
    }
    await onCreateRun(trackId, payload)
  }

  async function handleToggleKeeper(runId: string) {
    if (settingKeeper) return
    await onSetKeeper(trackId, keeperRunId === runId ? null : runId)
  }

  function startEditing() {
    setTitleDraft(track.title)
    setArtistDraft(track.artist ?? '')
    setSongSettingsOpen(true)
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
    setRenderSetupOpen(true)
  }

  function handleCompareTargetChange(nextRunId: string) {
    if (compareRunId && compareRunId !== nextRunId) onToggleCompare(compareRunId)
    if (!nextRunId) return
    if (compareRunId !== nextRunId) onToggleCompare(nextRunId)
  }

  const workflowCopy =
    runMode === 'active' && selectedRun
      ? {
          title: 'Split in progress',
          description: selectedRun.status_message || 'Processing continues in the background.',
        }
      : runMode === 'failed' && selectedRun
        ? {
            title: selectedRun.status === 'cancelled' ? 'Split cancelled' : 'Split needs attention',
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
                title: 'Split finished without mixable stems',
                description: 'Try a different model to get usable stems for mixing.',
              }
            : {
                title: 'Choose how this song should be split',
                description: 'Start a split, then come back here to review the result and choose the final version.',
              }

  return (
    <section className="section track-detail">
      <div className="track-detail-head">
        <div className="track-detail-head-meta">
          <button type="button" className="track-detail-back" onClick={onBackToLibrary}>
            Back to library
          </button>
          <h2>{track.title}</h2>
          <p className="track-detail-subtitle">
            {track.artist ?? 'Unknown artist'} · {formatDuration(track.duration_seconds)} ·{' '}
            {track.source_type === 'youtube' ? 'YouTube' : track.source_format}
          </p>
          <div className="track-detail-status">
            <strong>{workflowCopy.title}</strong>
            <span className="track-detail-status-meta">{selectedRunMeta}</span>
          </div>
          <p className="track-detail-status-copy">{workflowCopy.description}</p>
        </div>

        {primaryAction ? (
          <div className="track-detail-head-actions">
            <button
              type="button"
              className="button-primary"
              disabled={primaryAction.disabled}
              onClick={primaryAction.action}
            >
              {primaryAction.label}
            </button>
          </div>
        ) : null}
      </div>

      {selectedRun ? (
        <div className="track-detail-current">
          <div className="track-detail-current-copy">
            <strong>Selected split</strong>
            <p>
              {selectedRun.processing.profile_label} · {statusLabel(selectedRun.status)}
              {selectedRun.status === 'completed' ? ` · ${formatTimestampShort(selectedRun.updated_at)}` : ''}
            </p>
          </div>
          {track.runs.length > 1 ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => setRunHistoryOpen((current) => !current)}
            >
              {runHistoryOpen ? 'Hide other splits' : `Browse splits (${track.runs.length})`}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="track-workflow">
        {runMode === 'active' && selectedRun ? (
          <div className="workflow-step-block">
            <div className="track-detail-section-head">
              <h3 className="subsection-head">Current split</h3>
              <p>Processing continues in the background. You can leave this song selected while it finishes.</p>
            </div>
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
                label="Cancel Split"
                pendingLabel="Cancelling…"
                confirmLabel="Cancel split"
                cancelLabel="Keep running"
                prompt="Cancel this split?"
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
                {selectedRun.status === 'cancelled' ? 'This split was cancelled' : 'This split failed'}
              </span>
              <button
                type="button"
                className="button-primary"
                disabled={retryingRunId === selectedRun.id}
                onClick={() => void onRetryRun(selectedRun.id)}
              >
                {retryingRunId === selectedRun.id ? <><Spinner /> Retrying…</> : 'Retry Split'}
              </button>
            </div>
            {selectedRun.error_message ? (
              <p className="run-failure-message">{selectedRun.error_message}</p>
            ) : null}
            <p className="run-failure-next">
              {selectedRun.status === 'cancelled'
                ? 'Retry keeps the same settings, or choose a different model below.'
                : 'Retry keeps the same settings. If this keeps failing, choose a different model below.'}
            </p>
          </div>
        ) : null}

        {resultModeAvailable && selectedRun ? (
          <div className="track-detail-section">
            <div className="track-detail-section-head">
              <h3 className="subsection-head">Shape the result</h3>
              <p>
                {runMode === 'completed-mixable'
                  ? 'Start with the outcome you want, then open the full mixer only if you need more control.'
                  : 'This split finished, but it does not have usable stems for shaping.'}
              </p>
            </div>

            {runMode === 'completed-mixable' ? (
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
                  saving={savingMixRunId === selectedRun.id}
                />

                <details className="track-advanced" open={manualMixOpen}>
                  <summary
                    className="track-advanced-summary"
                    onClick={(event) => {
                      event.preventDefault()
                      setManualMixOpen((current) => !current)
                    }}
                  >
                    <div>
                      <strong>Fine-tune stems manually</strong>
                      <p>Open the full mixer only when the quick result still needs work.</p>
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
                <p>No stems are available for this split. Queue another split if you want a mixable result.</p>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => setRenderSetupOpen(true)}
                >
                  Queue Another Split
                </button>
              </div>
            )}
          </div>
        ) : null}

        {decisionAvailable && selectedRun ? (
          <div className="track-detail-section">
            <div className="track-detail-section-head">
              <h3 className="subsection-head">Compare completed results</h3>
              <p>Use comparison only when you need help choosing between two finished splits.</p>
            </div>

            {compareCandidates.length > 0 ? (
              <>
                <label className="field field-inline track-detail-compare-picker">
                  <span>Compare with</span>
                  <select
                    value={compareRunId ?? ''}
                    onChange={(event) => handleCompareTargetChange(event.target.value)}
                  >
                    <option value="">Choose another completed split</option>
                    {compareCandidates.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.processing.profile_label} · {formatTimestampShort(run.updated_at)}
                      </option>
                    ))}
                  </select>
                </label>

                {bothCompleted && compareRun ? (
                  <CompareView
                    runA={selectedRun}
                    runB={compareRun}
                    metricsReady={bothCompleted}
                  />
                ) : (
                  <div className="workflow-step-blocked">
                    <p>Choose a second completed split to compare waveform overlays and metrics.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="workflow-step-blocked">
                <p>Create a second completed split before you compare alternatives.</p>
              </div>
            )}
          </div>
        ) : null}

        {decisionAvailable && selectedRun ? (
          <details className="track-advanced track-detail-disclosure" open={finalizeOpen}>
            <summary
              className="track-advanced-summary"
              onClick={(event) => {
                event.preventDefault()
                setFinalizeOpen((current) => !current)
              }}
            >
              <div>
                <strong>Choose the final version</strong>
                <p>Mark the selected split as the one to keep, then export it or clean up the rest.</p>
              </div>
              <span>{finalRenderSummary}</span>
            </summary>
            <div className="track-detail-disclosure-body">
              <div className="selected-render-actions">
                <button
                  type="button"
                  className={`button-secondary ${keeperRunId === selectedRun.id ? 'button-secondary-active' : ''}`}
                  disabled={settingKeeper || selectedRun.status !== 'completed'}
                  onClick={() => void handleToggleKeeper(selectedRun.id)}
                >
                  {keeperRunId === selectedRun.id ? 'Clear Final Version' : 'Set as Final Version'}
                </button>
              </div>

              <details className="track-advanced" open={Boolean(selectedRun.note.trim())}>
                <summary className="track-advanced-summary">
                  <div>
                    <strong>Keep a note with this split</strong>
                    <p>Use this only if you want to remember why this version won.</p>
                  </div>
                  <span>{selectedRun.note.trim() ? 'Note saved' : 'Optional'}</span>
                </summary>
                <div className="track-advanced-body">
                  <RunNoteEditor
                    key={`${selectedRun.id}:${selectedRun.note}`}
                    runId={selectedRun.id}
                    note={selectedRun.note}
                    saving={savingNoteRunId === selectedRun.id}
                    onSave={onSetRunNote}
                  />
                </div>
              </details>

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
                    label="Remove Other Splits"
                    pendingLabel="Cleaning…"
                    confirmLabel="Delete other splits"
                    cancelLabel="Keep them"
                    prompt="Delete every non-final split for this song?"
                    onConfirm={() => onPurgeNonKeepers(trackId)}
                  />
                </div>
              ) : null}
            </div>
          </details>
        ) : null}

        {track.runs.length ? (
          <details className="track-advanced track-detail-disclosure" open={runHistoryOpen}>
            <summary
              className="track-advanced-summary"
              onClick={(event) => {
                event.preventDefault()
                setRunHistoryOpen((current) => !current)
              }}
            >
              <div>
                <strong>Other splits</strong>
                <p>Swap between completed, failed, and in-progress attempts without crowding the main workflow.</p>
              </div>
              <span>{track.runs.length} total · {activeRunCount} active</span>
            </summary>
            <div className="track-detail-disclosure-body">
              <div className="run-history">
                <div className="run-history-head">
                  <div className="track-detail-section-head">
                    <h3 className="subsection-head">Split history</h3>
                    <p>{completedRunCount} completed · {failedRunCount} need attention</p>
                  </div>
                  <div className="run-history-head-actions">
                    <select
                      aria-label="Filter splits"
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
                  <p className="empty-state run-history-empty">No splits match this filter.</p>
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
        ) : (
          <div className="workflow-step-blocked">
            <p>No splits yet. Start with a model below to create the first result.</p>
          </div>
        )}

        <details className="track-advanced track-detail-disclosure" open={renderSetupOpen}>
          <summary
            className="track-advanced-summary"
            onClick={(event) => {
              event.preventDefault()
              setRenderSetupOpen((current) => !current)
            }}
          >
            <div>
              <strong>{hasNoRuns ? 'Split setup' : 'Queue another split'}</strong>
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
                  {creatingRun ? <><Spinner /> Queueing…</> : hasNoRuns ? 'Start Split' : 'Queue Another Split'}
                </button>
                {!hasNoRuns ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setRenderSetupOpen(false)}
                  >
                    Hide split setup
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </details>

        <details className="track-advanced track-detail-disclosure" open={songSettingsOpen || editing}>
          <summary
            className="track-advanced-summary"
            onClick={(event) => {
              event.preventDefault()
              setSongSettingsOpen((current) => !current)
            }}
          >
            <div>
              <strong>Song settings</strong>
              <p>Rename the song or remove it from the library.</p>
            </div>
            <span>{track.source_type === 'youtube' ? 'YouTube' : track.source_format}</span>
          </summary>
          <div className="track-detail-disclosure-body">
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
              <div className="track-settings-actions">
                <button type="button" className="button-secondary" onClick={startEditing}>
                  Rename
                </button>
                <ConfirmInline
                  label="Delete"
                  pendingLabel="Deleting…"
                  confirmLabel="Delete track"
                  cancelLabel="Keep it"
                  prompt={`Delete "${track.title}" and all its splits?`}
                  onConfirm={() => onDeleteTrack(trackId)}
                />
              </div>
            )}
          </div>
        </details>
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
        placeholder="Add context about why this split is the one to keep."
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
