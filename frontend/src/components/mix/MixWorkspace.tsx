import { useEffect, useState } from 'react'

import { CompareView } from '../CompareView'
import { ConfirmInline } from '../feedback/ConfirmInline'
import { ProgressBar } from '../feedback/ProgressBar'
import { RunStepper } from '../feedback/RunStepper'
import { Spinner } from '../feedback/Spinner'
import { MixPanel } from './MixPanel'
import { OutputIntentPicker } from './OutputIntent'
import { ModelPicker } from '../ModelPicker'
import { isValidModelFilename } from '../modelPickerShared'
import { ExportBuilder, type ExportPreset } from '../export/ExportBuilder'
import { RUN_STATUS_SHORT_LABELS, isActiveRunStatus } from '../runStatus'
import { resolveSelectedRun } from '../../runSelection'
import { CUSTOM_PROFILE_KEY } from '../../types'
import { isStemKind } from '../../stems'
import type {
  CachedModel,
  ProcessingProfile,
  RevealFolderInput,
  RunDetail,
  RunMixStemEntry,
  RunProcessingConfigInput,
  TrackDetail,
  TrackSummary,
} from '../../types'

const RETRYABLE_RUN_STATUSES = new Set(['failed', 'cancelled'])

type DraftState<T> = {
  sourceKey: string
  values: T
}

type MixWorkspaceProps = {
  track: TrackDetail | null
  selectedRunId: string | null
  profiles: ProcessingProfile[]
  cachedModels: CachedModel[]
  defaultProfileKey: string
  defaultBitrate: string
  creatingRun: boolean
  cancellingRunId: string | null
  retryingRunId: string | null
  deletingRunId: string | null
  settingKeeper: boolean
  savingMixRunId: string | null
  updatingTrack: boolean
  onBackToSongs: () => void
  onSelectRun: (runId: string) => void
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<unknown>
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<unknown>
  onDeleteRun: (runId: string) => Promise<void>
  onSetKeeper: (trackId: string, runId: string | null) => Promise<void>
  onSaveMix: (trackId: string, runId: string, stems: RunMixStemEntry[]) => Promise<void>
  onUpdateTrack: (trackId: string, payload: { title?: string; artist?: string | null }) => Promise<void>
  onDeleteTrack: (trackId: string) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  onError: (message: string) => void
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
  const minutes = Math.floor(total / 60)
  const remaining = (total % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

function statusLabel(status: string) {
  return RUN_STATUS_SHORT_LABELS[status] ?? status
}

function selectedRunSummary(run: RunDetail | null) {
  if (!run) return 'No version selected'
  return `${run.processing.profile_label} · ${statusLabel(run.status)}`
}

function stemCount(run: RunDetail) {
  return run.artifacts.filter((artifact) => isStemKind(artifact.kind)).length
}

function isMixableRun(run: RunDetail) {
  return run.status === 'completed' && run.artifacts.some((artifact) => isStemKind(artifact.kind))
}

function buildTrackSummary(track: TrackDetail, run: RunDetail): TrackSummary {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    source_type: track.source_type,
    source_url: track.source_url,
    thumbnail_url: track.thumbnail_url,
    source_filename: track.source_filename,
    duration_seconds: track.duration_seconds,
    created_at: track.created_at,
    updated_at: track.updated_at,
    latest_run: track.runs[0] ?? null,
    run_count: track.runs.length,
    keeper_run_id: track.keeper_run_id,
    has_custom_mix: !run.mix.is_default,
  }
}

function MixExportPanel({
  track,
  run,
  defaultBitrate,
  onReveal,
  onError,
}: {
  track: TrackDetail
  run: RunDetail | null
  defaultBitrate: string
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  onError: (message: string) => void
}) {
  const [preset, setPreset] = useState<ExportPreset>('final-mix')

  useEffect(() => {
    setPreset('final-mix')
  }, [run?.id, track.id])

  if (!run || run.status !== 'completed') {
    return <p className="kp-inspector-copy">Export unlocks after the selected version finishes.</p>
  }

  const summary =
    preset === 'final-mix'
      ? 'Current mix uses the saved stem balance from this version.'
      : preset === 'stems-for-editing'
        ? 'All stems exports the raw separated files. Mix changes do not alter those stems.'
        : 'Mix + stems includes both the saved mix and the raw separated stems from this version.'

  return (
    <div className="kp-mix-export-panel">
      <div className="kp-export-choice-list" role="group" aria-label="Single-song export presets">
        <button
          type="button"
          className={preset === 'final-mix' ? 'kp-export-choice kp-export-choice-active' : 'kp-export-choice'}
          onClick={() => setPreset('final-mix')}
        >
          <strong>Current mix</strong>
          <span>Saved balance only</span>
        </button>
        <button
          type="button"
          className={
            preset === 'stems-for-editing' ? 'kp-export-choice kp-export-choice-active' : 'kp-export-choice'
          }
          onClick={() => setPreset('stems-for-editing')}
        >
          <strong>All stems</strong>
          <span>Raw separated files</span>
        </button>
        <button
          type="button"
          className={preset === 'full-package' ? 'kp-export-choice kp-export-choice-active' : 'kp-export-choice'}
          onClick={() => setPreset('full-package')}
        >
          <strong>Mix + stems</strong>
          <span>Saved mix plus raw stems</span>
        </button>
      </div>

      <ExportBuilder
        key={`${track.id}:${run.id}:${preset}`}
        tracks={[buildTrackSummary(track, run)]}
        selectedTrackIds={[track.id]}
        defaultBitrate={defaultBitrate}
        runIds={{ [track.id]: run.id }}
        initialPreset={preset}
        lockPreset
        hidePackaging
        forceMode="single-bundle"
        mixSummary={summary}
        onError={onError}
        onReveal={onReveal}
      />
    </div>
  )
}

export function MixWorkspace({
  track,
  selectedRunId,
  profiles,
  cachedModels,
  defaultProfileKey,
  defaultBitrate,
  creatingRun,
  cancellingRunId,
  retryingRunId,
  deletingRunId,
  settingKeeper,
  savingMixRunId,
  updatingTrack,
  onBackToSongs,
  onSelectRun,
  onCreateRun,
  onCancelRun,
  onRetryRun,
  onDeleteRun,
  onSetKeeper,
  onSaveMix,
  onUpdateTrack,
  onDeleteTrack,
  onReveal,
  onError,
}: MixWorkspaceProps) {
  const [compareRunId, setCompareRunId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!track) return
    setCompareRunId(null)
    setEditing(false)
    setTitleDraft(track.title)
    setArtistDraft(track.artist ?? '')
    setNextProcessingState({
      sourceKey: defaultProfileKey,
      values: {
        profile_key: defaultProfileKey,
        model_filename: '',
      },
    })
  }, [defaultProfileKey, track])

  if (!track) {
    return (
      <section className="kp-mix-route kp-page">
        <div className="kp-mix-empty">
          <strong>No song selected</strong>
          <p>Choose a song from Songs to open its mix workspace.</p>
        </div>
      </section>
    )
  }

  const currentTrack = track
  const selectedRun = resolveSelectedRun(currentTrack, selectedRunId)
  const completedRuns = currentTrack.runs.filter((run) => run.status === 'completed')
  const compareRun =
    compareRunId && selectedRun && compareRunId !== selectedRun.id
      ? currentTrack.runs.find((run) => run.id === compareRunId) ?? null
      : null
  const mixable = selectedRun ? isMixableRun(selectedRun) : false
  const keeperSelected = !!selectedRun && currentTrack.keeper_run_id === selectedRun.id
  const splitQueueRuns = currentTrack.runs.filter((run) => run.status !== 'completed')
  const nextProcessing =
    nextProcessingState.sourceKey === defaultProfileKey
      ? nextProcessingState.values
      : { profile_key: defaultProfileKey, model_filename: '' }
  const isCustomProfile = nextProcessing.profile_key === CUSTOM_PROFILE_KEY
  const customModelValid = !isCustomProfile || isValidModelFilename(nextProcessing.model_filename ?? '')
  const canDeleteSelectedRun =
    !!selectedRun &&
    selectedRun.id !== currentTrack.keeper_run_id &&
    !isActiveRunStatus(selectedRun.status)

  async function handleCreate() {
    const result = await onCreateRun(currentTrack.id, nextProcessing)
    if (result && typeof result === 'object' && 'run' in result) {
      onSelectRun((result as { run: { id: string } }).run.id)
    }
  }

  async function handleSaveEdits() {
    await onUpdateTrack(currentTrack.id, {
      title: titleDraft.trim(),
      artist: artistDraft.trim() ? artistDraft.trim() : null,
    })
    setEditing(false)
  }

  return (
    <section className="kp-mix-route kp-page kp-mix-route-live">
      <div className="kp-mix-workspace">
        <div className="kp-mix-canvas">
          <header className="kp-mix-session-bar kp-mix-session-bar-minimal">
            <button type="button" className="kp-back-link" onClick={onBackToSongs}>
              Songs
            </button>
            <div className="kp-mix-session-copy">
              <h1>{track.title}</h1>
              <p>
                {currentTrack.artist ?? 'Unknown artist'} · {formatDuration(currentTrack.duration_seconds)} ·{' '}
                {selectedRun ? selectedRunSummary(selectedRun) : 'Choose or queue a version'}
              </p>
            </div>
          </header>

          {selectedRun ? (
            mixable ? (
              <MixPanel
                key={`${track.id}:${selectedRun.id}`}
                run={selectedRun}
                saving={savingMixRunId === selectedRun.id}
                onSave={(stems) => onSaveMix(track.id, selectedRun.id, stems)}
              />
            ) : (
              <section className="kp-mix-blocked">
                <strong>{selectedRunSummary(selectedRun)}</strong>
                {isActiveRunStatus(selectedRun.status) ? (
                  <>
                    <p>The selected version is still processing. Mixing unlocks here as soon as the split finishes.</p>
                    <RunStepper status={selectedRun.status} lastActiveStatus={selectedRun.last_active_status} />
                    <ProgressBar value={selectedRun.progress} label={selectedRun.status_message} />
                  </>
                ) : RETRYABLE_RUN_STATUSES.has(selectedRun.status) ? (
                  <>
                    <p>{selectedRun.error_message || 'Retry this version or queue a cleaner split from the version panel.'}</p>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => void onRetryRun(selectedRun.id)}
                    >
                      {retryingRunId === selectedRun.id ? 'Retrying…' : 'Retry split'}
                    </button>
                  </>
                ) : (
                  <p>This version finished without mixable stems. Queue another split from the inspector.</p>
                )}
              </section>
            )
          ) : (
            <section className="kp-mix-blocked">
              <strong>No version selected</strong>
              <p>Queue the first split from the inspector, then come back here when the version is ready.</p>
            </section>
          )}
        </div>

        <aside className="kp-mix-inspector">
          <section className="kp-inspector-section">
            <header className="kp-section-header">
              <div>
                <h2>Version</h2>
                <p>Keep version choice, compare, reruns, and session completion in one place.</p>
              </div>
            </header>

            {selectedRun ? (
              <div className="kp-inspector-summary">
                <strong>{selectedRun.processing.profile_label}</strong>
                <span>{statusLabel(selectedRun.status)} · Updated {formatTimestampShort(selectedRun.updated_at)}</span>
              </div>
            ) : (
              <p className="kp-inspector-copy">No version selected yet.</p>
            )}

            {selectedRun ? (
              <div className="kp-version-list" role="list" aria-label="Song versions">
                {track.runs.map((run) => {
                  const selected = selectedRun.id === run.id
                  const finalVersion = track.keeper_run_id === run.id
                  return (
                    <button
                      key={run.id}
                      type="button"
                      role="listitem"
                      className={selected ? 'kp-version-row kp-version-row-active' : 'kp-version-row'}
                      onClick={() => onSelectRun(run.id)}
                    >
                      <span>
                        <strong>{run.processing.profile_label}</strong>
                        <small>
                          {statusLabel(run.status)}
                          {finalVersion ? ' · Final' : ''}
                        </small>
                      </span>
                      <span>{stemCount(run)} stems</span>
                    </button>
                  )
                })}
              </div>
            ) : null}

            {selectedRun && isActiveRunStatus(selectedRun.status) ? (
              <div className="kp-version-state">
                <ProgressBar value={selectedRun.progress} label={selectedRun.status_message} />
                <ConfirmInline
                  label="Cancel split"
                  pendingLabel="Cancelling…"
                  confirmLabel="Cancel version"
                  cancelLabel="Keep running"
                  prompt="Cancel this version?"
                  pending={cancellingRunId === selectedRun.id}
                  onConfirm={() => onCancelRun(selectedRun.id)}
                />
              </div>
            ) : null}

            {selectedRun && RETRYABLE_RUN_STATUSES.has(selectedRun.status) ? (
              <div className="kp-version-state">
                <p className="kp-inline-error">{selectedRun.error_message || 'This split needs attention before it can be mixed.'}</p>
                <button type="button" className="button-primary" onClick={() => void onRetryRun(selectedRun.id)}>
                  {retryingRunId === selectedRun.id ? 'Retrying…' : 'Retry split'}
                </button>
              </div>
            ) : null}

            {selectedRun && mixable ? (
              <OutputIntentPicker
                run={selectedRun}
                profiles={profiles}
                saving={savingMixRunId === selectedRun.id}
                onApplyTemplate={(stems) => onSaveMix(track.id, selectedRun.id, stems)}
                onRerunWithProfile={(profileKey) => onCreateRun(track.id, { profile_key: profileKey })}
              />
            ) : null}

            {selectedRun && completedRuns.length > 1 ? (
              <>
                <label className="field">
                  <span>Compare with</span>
                  <select
                    value={compareRunId ?? ''}
                    onChange={(event) => setCompareRunId(event.target.value || null)}
                  >
                    <option value="">No compare target</option>
                    {completedRuns
                      .filter((run) => run.id !== selectedRun.id)
                      .map((run) => (
                        <option key={run.id} value={run.id}>
                          {run.processing.profile_label} · {formatTimestampShort(run.updated_at)}
                        </option>
                      ))}
                  </select>
                </label>

                {compareRun ? (
                  <details className="kp-disclosure">
                    <summary>Compare versions</summary>
                    <div className="kp-disclosure-body">
                      <CompareView
                        runA={selectedRun}
                        runB={compareRun}
                        metricsReady
                        currentIsFinal={currentTrack.keeper_run_id === selectedRun.id}
                        comparedIsFinal={currentTrack.keeper_run_id === compareRun.id}
                        onUseCurrent={() => void onSetKeeper(currentTrack.id, selectedRun.id)}
                        onUseCompared={() => void onSetKeeper(currentTrack.id, compareRun.id)}
                      />
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}

            <details className="kp-disclosure" open>
              <summary>Queue another split</summary>
              <div className="kp-disclosure-body">
                {splitQueueRuns.length > 0 ? (
                  <div className="kp-inline-run-list">
                    {splitQueueRuns.map((run) => (
                      <article key={run.id} className="kp-inline-run-row">
                        <span>
                          <strong>{run.processing.profile_label}</strong>
                          <small>{statusLabel(run.status)}</small>
                        </span>
                        <span>
                          {isActiveRunStatus(run.status)
                            ? `${Math.round(run.progress)}%`
                            : formatTimestampShort(run.updated_at)}
                        </span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="kp-inspector-copy">No other versions are running right now.</p>
                )}

                <div className="kp-render-form">
                  <ModelPicker
                    profileKey={nextProcessing.profile_key}
                    modelFilename={nextProcessing.model_filename ?? ''}
                    profiles={profiles}
                    cachedModels={cachedModels}
                    labelId="mix-workspace-render-form"
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
                  <button
                    type="button"
                    className="button-primary"
                    disabled={!customModelValid || creatingRun}
                    onClick={() => void handleCreate()}
                  >
                    {creatingRun ? (
                      <>
                        <Spinner /> Queueing…
                      </>
                    ) : currentTrack.runs.length === 0 ? (
                      'Start split'
                    ) : (
                      'Queue version'
                    )}
                  </button>
                </div>
              </div>
            </details>

            {selectedRun ? (
              <div className="kp-version-actions">
                <button
                  type="button"
                  className="button-primary"
                  disabled={settingKeeper}
                  onClick={() => void onSetKeeper(currentTrack.id, keeperSelected ? null : selectedRun.id)}
                >
                  {keeperSelected ? 'Clear final version' : 'Mark this as final'}
                </button>
                {canDeleteSelectedRun ? (
                  <ConfirmInline
                    label="Delete version"
                    pendingLabel="Deleting…"
                    confirmLabel="Delete version"
                    cancelLabel="Keep it"
                    prompt="Delete this version and its output files?"
                    pending={deletingRunId === selectedRun.id}
                    onConfirm={() => onDeleteRun(selectedRun.id)}
                  />
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="kp-inspector-section">
            <header className="kp-section-header">
              <div>
                <h2>Export</h2>
                <p>Choose the output intent first, then open more settings only if you need them.</p>
              </div>
            </header>
            <MixExportPanel
              track={currentTrack}
              run={selectedRun}
              defaultBitrate={defaultBitrate}
              onReveal={onReveal}
              onError={onError}
            />
          </section>

          <section className="kp-inspector-section">
            <header className="kp-section-header">
              <div>
                <h2>Song</h2>
                <p>Keep metadata and source context tidy without crowding the mix surface.</p>
              </div>
            </header>

            <div className="kp-song-facts">
              <strong>{currentTrack.source_filename}</strong>
              <span>
                {currentTrack.source_type === 'youtube' ? 'YouTube source' : currentTrack.source_format} ·{' '}
                {formatDuration(currentTrack.duration_seconds)}
              </span>
            </div>

            {editing ? (
              <div className="kp-edit-form">
                <label className="field">
                  <span>Title</span>
                  <input type="text" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
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
                <div className="kp-inline-actions">
                  <button
                    type="button"
                    className="button-primary"
                    disabled={updatingTrack || !titleDraft.trim()}
                    onClick={() => void handleSaveEdits()}
                  >
                    {updatingTrack ? (
                      <>
                        <Spinner /> Saving…
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                  <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="kp-inline-actions">
                <button type="button" className="button-secondary" onClick={() => setEditing(true)}>
                  Rename
                </button>
                <ConfirmInline
                  label="Delete song"
                  pendingLabel="Deleting…"
                  confirmLabel="Delete song"
                  cancelLabel="Keep it"
                  prompt={`Delete "${currentTrack.title}" and all its versions?`}
                  onConfirm={() => onDeleteTrack(currentTrack.id)}
                />
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}
