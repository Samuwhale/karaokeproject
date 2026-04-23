import { useState } from 'react'

import { CUSTOM_PROFILE_KEY } from '../../types'
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
import type { StudioTab } from '../../routes'
import { resolveSelectedRun } from '../../runSelection'
import { isStemKind } from '../../stems'
import { ExportBuilder } from '../export/ExportBuilder'
import { ConfirmInline } from '../feedback/ConfirmInline'
import { ProgressBar } from '../feedback/ProgressBar'
import { RunStepper } from '../feedback/RunStepper'
import { Skeleton } from '../feedback/Skeleton'
import { Spinner } from '../feedback/Spinner'
import { MixPanel } from '../mix/MixPanel'
import { OutputIntentPicker } from '../mix/OutputIntent'
import { ModelPicker } from '../ModelPicker'
import { isValidModelFilename } from '../modelPickerShared'
import { RUN_STATUS_SHORT_LABELS, isActiveRunStatus } from '../runStatus'

const RETRYABLE_RUN_STATUSES = new Set(['failed', 'cancelled'])

type StudioPageProps = {
  track: TrackDetail | null
  tab: StudioTab
  selectedRunId: string | null
  compareRunId: string | null
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
  onBackToLibrary: () => void
  onChangeTab: (tab: StudioTab) => void
  onSelectRun: (runId: string) => void
  onSelectCompare: (runId: string | null) => void
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<unknown>
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<unknown>
  onDeleteRun: (runId: string) => Promise<void>
  onSetKeeper: (trackId: string, runId: string | null) => Promise<void>
  onPurgeNonKeepers: (trackId: string) => void
  onSaveMix: (trackId: string, runId: string, stems: RunMixStemEntry[]) => Promise<void>
  onUpdateTrack: (trackId: string, payload: { title?: string; artist?: string | null }) => Promise<void>
  onDeleteTrack: (trackId: string) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  onError: (message: string) => void
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
  const minutes = Math.floor(total / 60)
  const remaining = (total % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

function statusLabel(status: string) {
  return RUN_STATUS_SHORT_LABELS[status] ?? status
}

function mixPanelStateKey(trackId: string, run: TrackDetail['runs'][number]) {
  const artifactKey = run.artifacts.map((artifact) => `${artifact.id}:${artifact.kind}`).join('|')
  const mixKey = run.mix.stems
    .map((stem) => `${stem.artifact_id}:${Math.round(stem.gain_db * 10) / 10}:${stem.muted ? 1 : 0}`)
    .join('|')
  return `${trackId}::${run.id}::${artifactKey}::${mixKey}`
}

function selectedRunSummary(run: RunDetail | null) {
  if (!run) return 'No version selected'
  return `${run.processing.profile_label} · ${statusLabel(run.status)}`
}

function stemCount(run: RunDetail) {
  return run.artifacts.filter((artifact) => isStemKind(artifact.kind)).length
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

function isMixableRun(run: RunDetail) {
  return run.status === 'completed' && run.artifacts.some((artifact) => isStemKind(artifact.kind))
}

function artifactSummary(run: RunDetail) {
  const mixableArtifacts = run.artifacts.filter((artifact) => isStemKind(artifact.kind)).slice(0, 4)
  if (mixableArtifacts.length === 0) {
    return [
      { label: 'Status', value: statusLabel(run.status), detail: 'Current version state' },
      { label: 'Updated', value: formatTimestampShort(run.updated_at), detail: 'Latest change' },
    ]
  }

  return mixableArtifacts.map((artifact) => ({
    label: artifact.label,
    value:
      artifact.metrics?.integrated_lufs !== null && artifact.metrics?.integrated_lufs !== undefined
        ? `${Math.round(Math.abs(artifact.metrics.integrated_lufs))} LUFS`
        : artifact.metrics?.true_peak_dbfs !== null && artifact.metrics?.true_peak_dbfs !== undefined
          ? `${Math.abs(artifact.metrics.true_peak_dbfs).toFixed(1)} dB peak`
          : artifact.metrics?.sample_rate !== null && artifact.metrics?.sample_rate !== undefined
            ? `${Math.round(artifact.metrics.sample_rate / 1000)} kHz`
            : 'Metrics ready',
    detail: artifact.format.toUpperCase(),
  }))
}

function StudioPageHeader({
  track,
  tab,
  selectedRun,
  onBackToLibrary,
  onChangeTab,
}: {
  track: TrackDetail
  tab: StudioTab
  selectedRun: RunDetail | null
  onBackToLibrary: () => void
  onChangeTab: (tab: StudioTab) => void
}) {
  return (
    <header className="kp-studio-header">
      <div className="kp-studio-header-main">
        <button type="button" className="kp-back-link" onClick={onBackToLibrary}>
          Songs
        </button>
        <div>
          <h1>{track.title}</h1>
          <p>
            {track.artist ?? 'Unknown artist'} · {formatDuration(track.duration_seconds)} ·{' '}
            {track.source_type === 'youtube' ? 'YouTube' : track.source_format}
          </p>
        </div>
      </div>

      <div className="kp-studio-header-side">
        <div>
          <strong>{selectedRun ? selectedRun.processing.profile_label : 'No version selected'}</strong>
          <span>
            {selectedRun
              ? `${statusLabel(selectedRun.status)} · ${formatTimestampShort(selectedRun.updated_at)}`
              : 'Choose a version to continue'}
          </span>
        </div>
        <div className="kp-tab-switcher" role="tablist" aria-label="Studio sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'versions'}
            className={tab === 'versions' ? 'kp-tab-switcher-active' : ''}
            onClick={() => onChangeTab('versions')}
          >
            Versions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mix'}
            className={tab === 'mix' ? 'kp-tab-switcher-active' : ''}
            onClick={() => onChangeTab('mix')}
          >
            Mix
          </button>
        </div>
      </div>
    </header>
  )
}

function StudioVersionList({
  runs,
  selectedRunId,
  keeperRunId,
  compareRunId,
  onSelectRun,
}: {
  runs: RunDetail[]
  selectedRunId: string | null
  keeperRunId: string | null
  compareRunId: string | null
  onSelectRun: (runId: string) => void
}) {
  if (runs.length === 0) {
    return <p className="empty-state">No versions yet. Queue the first split to unlock Studio.</p>
  }

  return (
    <div className="kp-version-list" role="list" aria-label="Song versions">
      {runs.map((run) => {
        const selected = selectedRunId === run.id
        const finalVersion = keeperRunId === run.id
        const compareTarget = compareRunId === run.id
        const metadata = [
          run.status === 'completed' ? formatTimestampShort(run.updated_at) : statusLabel(run.status),
          finalVersion ? 'Final' : null,
          compareTarget ? 'Compare target' : null,
        ]
          .filter(Boolean)
          .join(' · ')

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
              <small>{metadata}</small>
            </span>
            <span>{stemCount(run)} stems</span>
          </button>
        )
      })}
    </div>
  )
}

function StudioMixTab({
  track,
  run,
  runs,
  selectedRunId,
  profiles,
  defaultBitrate,
  savingMix,
  settingKeeper,
  onSelectRun,
  onRetryRun,
  onChangeTab,
  onSetKeeper,
  onSaveMix,
  onCreateRun,
  onReveal,
  onError,
}: {
  track: TrackDetail
  run: RunDetail | null
  runs: RunDetail[]
  selectedRunId: string | null
  profiles: ProcessingProfile[]
  defaultBitrate: string
  savingMix: boolean
  settingKeeper: boolean
  onSelectRun: (runId: string) => void
  onRetryRun: (runId: string) => Promise<unknown>
  onChangeTab: (tab: StudioTab) => void
  onSetKeeper: (trackId: string, runId: string | null) => Promise<void>
  onSaveMix: (trackId: string, runId: string, stems: RunMixStemEntry[]) => Promise<void>
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<unknown>
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  onError: (message: string) => void
}) {
  const [activePanel, setActivePanel] = useState<'starting-point' | 'export' | null>(null)

  if (!run) {
    return (
      <div className="kp-studio-blocked">
        <strong>No version selected</strong>
        <p>Choose or queue a version first, then come back here when the split is ready for mixing.</p>
        <button type="button" className="button-primary" onClick={() => onChangeTab('versions')}>
          Open versions
        </button>
      </div>
    )
  }

  const mixable = isMixableRun(run)
  const failed = RETRYABLE_RUN_STATUSES.has(run.status)

  if (isActiveRunStatus(run.status)) {
    return (
      <div className="kp-studio-blocked">
        <strong>{selectedRunSummary(run)}</strong>
        <p>The selected version is still processing. Mixing unlocks as soon as this run finishes.</p>
        <RunStepper status={run.status} lastActiveStatus={run.last_active_status} />
        <ProgressBar value={run.progress} label={run.status_message} />
        <button type="button" className="button-secondary" onClick={() => onChangeTab('versions')}>
          Open versions
        </button>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="kp-studio-blocked kp-studio-blocked-danger">
        <strong>{run.status === 'cancelled' ? 'Split cancelled' : 'Split needs attention'}</strong>
        <p>{run.error_message || 'Retry this version or queue another one with a different setup.'}</p>
        <div className="kp-inline-actions">
          <button type="button" className="button-primary" onClick={() => void onRetryRun(run.id)}>
            Retry split
          </button>
          <button type="button" className="button-secondary" onClick={() => onChangeTab('versions')}>
            Review versions
          </button>
        </div>
      </div>
    )
  }

  if (!mixable) {
    return (
      <div className="kp-studio-blocked">
        <strong>This version finished without mixable stems.</strong>
        <p>Queue another version if you need a split that can be shaped in the mixer.</p>
        <button type="button" className="button-primary" onClick={() => onChangeTab('versions')}>
          Review versions
        </button>
      </div>
    )
  }

  const keeperSelected = track.keeper_run_id === run.id
  const trackSummary = buildTrackSummary(track, run)
  const mixSummary = run.mix.is_default
    ? 'Export the current balance as-is, or grab the stems from this version.'
    : 'Export the saved custom balance or download the stems from the same version.'

  return (
    <div className={`kp-studio-mix-shell ${activePanel ? 'kp-studio-mix-shell-drawer-open' : ''}`}>
      <aside className="kp-studio-mix-sidebar">
        <section className="kp-studio-side-panel">
          <header className="kp-section-header">
            <div>
              <h2>Versions</h2>
              <p>Keep the winning split close while you mix.</p>
            </div>
          </header>
          <StudioVersionList
            runs={runs}
            selectedRunId={selectedRunId}
            keeperRunId={track.keeper_run_id}
            compareRunId={null}
            onSelectRun={onSelectRun}
          />
          <button type="button" className="button-secondary" onClick={() => onChangeTab('versions')}>
            Review version details
          </button>
        </section>
      </aside>

      <section className="kp-studio-mix-main">
        <header className="kp-mix-workspace-head">
          <div className="kp-mix-workspace-copy">
            <strong>{run.processing.profile_label}</strong>
            <p>
              {keeperSelected
                ? 'This version is locked as the final result for this song.'
                : 'Balance this version first, then mark it final only if it wins.'}
            </p>
            <small>{selectedRunSummary(run)} · Updated {formatTimestampShort(run.updated_at)}</small>
          </div>
          <div className="kp-mix-workspace-actions">
            <button
              type="button"
              className={activePanel === 'starting-point' ? 'button-secondary button-secondary-active' : 'button-secondary'}
              onClick={() =>
                setActivePanel((current) => (current === 'starting-point' ? null : 'starting-point'))
              }
            >
              Starting point
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={settingKeeper}
              onClick={() => void onSetKeeper(track.id, keeperSelected ? null : run.id)}
            >
              {keeperSelected ? 'Clear final' : 'Mark final'}
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => setActivePanel((current) => (current === 'export' ? null : 'export'))}
            >
              Export
            </button>
          </div>
        </header>

        <MixPanel
          key={mixPanelStateKey(track.id, run)}
          run={run}
          saving={savingMix}
          onSave={(stems) => onSaveMix(track.id, run.id, stems)}
        />
      </section>

      {activePanel ? (
        <aside className="kp-studio-mix-drawer">
          <section className="kp-studio-side-panel">
            <header className="kp-section-header">
              <div>
                <h2>{activePanel === 'starting-point' ? 'Starting Point' : 'Export'}</h2>
                <p>
                  {activePanel === 'starting-point'
                    ? 'Use a starting balance or queue a more suitable split when this one is too coarse.'
                    : mixSummary}
                </p>
              </div>
              <button type="button" className="button-secondary" onClick={() => setActivePanel(null)}>
                Close
              </button>
            </header>

            {activePanel === 'starting-point' ? (
              <OutputIntentPicker
                run={run}
                profiles={profiles}
                saving={savingMix}
                onApplyTemplate={(stems) => onSaveMix(track.id, run.id, stems)}
                onRerunWithProfile={(profileKey) => onCreateRun(track.id, { profile_key: profileKey })}
              />
            ) : (
              <>
                <ExportBuilder
                  tracks={[trackSummary]}
                  selectedTrackIds={[track.id]}
                  defaultBitrate={defaultBitrate}
                  runIds={{ [track.id]: run.id }}
                  hidePackaging
                  forceMode="single-bundle"
                  mixSummary={mixSummary}
                  onError={onError}
                  onReveal={onReveal}
                />
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void onReveal({ kind: 'track-outputs', track_id: track.id })}
                >
                  Open outputs folder
                </button>
              </>
            )}
          </section>
        </aside>
      ) : null}
    </div>
  )
}

function StudioVersionsTab({
  track,
  selectedRun,
  compareRun,
  compareRunId,
  completedRuns,
  profiles,
  cachedModels,
  defaultProfileKey,
  creatingRun,
  cancellingRunId,
  retryingRunId,
  deletingRunId,
  updatingTrack,
  onSelectRun,
  onSelectCompare,
  onCreateRun,
  onCancelRun,
  onRetryRun,
  onDeleteRun,
  onChangeTab,
  onPurgeNonKeepers,
  onUpdateTrack,
  onDeleteTrack,
}: {
  track: TrackDetail
  selectedRun: RunDetail | null
  compareRun: RunDetail | null
  compareRunId: string | null
  completedRuns: RunDetail[]
  profiles: ProcessingProfile[]
  cachedModels: CachedModel[]
  defaultProfileKey: string
  creatingRun: boolean
  cancellingRunId: string | null
  retryingRunId: string | null
  deletingRunId: string | null
  updatingTrack: boolean
  onSelectRun: (runId: string) => void
  onSelectCompare: (runId: string | null) => void
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<unknown>
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<unknown>
  onDeleteRun: (runId: string) => Promise<void>
  onChangeTab: (tab: StudioTab) => void
  onPurgeNonKeepers: (trackId: string) => void
  onUpdateTrack: (trackId: string, payload: { title?: string; artist?: string | null }) => Promise<void>
  onDeleteTrack: (trackId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(track.title)
  const [artistDraft, setArtistDraft] = useState(track.artist ?? '')
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
      : { profile_key: defaultProfileKey, model_filename: '' }
  const isCustomProfile = nextProcessing.profile_key === CUSTOM_PROFILE_KEY
  const customModelValid = !isCustomProfile || isValidModelFilename(nextProcessing.model_filename ?? '')
  const splitQueueRuns = track.runs.filter((run) => run.status !== 'completed')
  const selectedRunMixable = selectedRun ? isMixableRun(selectedRun) : false
  const canDeleteSelectedRun =
    !!selectedRun &&
    selectedRun.id !== track.keeper_run_id &&
    !isActiveRunStatus(selectedRun.status)

  async function handleCreate() {
    await onCreateRun(track.id, nextProcessing)
  }

  async function handleSaveEdits() {
    await onUpdateTrack(track.id, {
      title: titleDraft.trim(),
      artist: artistDraft.trim() ? artistDraft.trim() : null,
    })
    setEditing(false)
  }

  return (
    <div className="kp-studio-versions-shell">
      <section className="kp-studio-side-panel">
        <header className="kp-section-header">
          <div>
            <h2>Versions</h2>
            <p>Choose the split worth taking into the mixer.</p>
          </div>
          {track.keeper_run_id ? (
            <ConfirmInline
              label="Delete others"
              pendingLabel="Cleaning…"
              confirmLabel="Delete other versions"
              cancelLabel="Keep them"
              prompt="Delete every non-final version for this song?"
              onConfirm={() => onPurgeNonKeepers(track.id)}
            />
          ) : null}
        </header>
        <StudioVersionList
          runs={track.runs}
          selectedRunId={selectedRun?.id ?? null}
          keeperRunId={track.keeper_run_id}
          compareRunId={compareRunId}
          onSelectRun={onSelectRun}
        />
      </section>

      <section className="kp-studio-version-focus">
        {selectedRun ? (
          <>
            <header className="kp-section-header">
              <div>
                <h2>{selectedRun.processing.profile_label}</h2>
                <p>{selectedRunSummary(selectedRun)}</p>
              </div>
              <div className="kp-inline-actions">
                {selectedRunMixable ? (
                  <button type="button" className="button-primary" onClick={() => onChangeTab('mix')}>
                    Open mix
                  </button>
                ) : null}
                {isActiveRunStatus(selectedRun.status) ? (
                  <ConfirmInline
                    label="Cancel split"
                    pendingLabel="Cancelling…"
                    confirmLabel="Cancel version"
                    cancelLabel="Keep running"
                    prompt="Cancel this version?"
                    pending={cancellingRunId === selectedRun.id}
                    onConfirm={() => onCancelRun(selectedRun.id)}
                  />
                ) : null}
                {RETRYABLE_RUN_STATUSES.has(selectedRun.status) ? (
                  <button type="button" className="button-primary" onClick={() => void onRetryRun(selectedRun.id)}>
                    {retryingRunId === selectedRun.id ? 'Retrying…' : 'Retry split'}
                  </button>
                ) : null}
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
            </header>

            <div className="kp-preview-hero">
              <div>
                <strong>{stemCount(selectedRun)} stems available</strong>
                <p>
                  {selectedRun.mix.is_default
                    ? 'This version still uses the default balance.'
                    : 'A custom balance is already saved for this version.'}
                </p>
              </div>

              {selectedRun.status === 'completed' && completedRuns.length > 1 ? (
                <label className="field">
                  <span>Compare with</span>
                  <select value={compareRun?.id ?? ''} onChange={(event) => onSelectCompare(event.target.value || null)}>
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
              ) : null}
            </div>

            <div className="kp-stat-grid">
              {artifactSummary(selectedRun).map((item) => (
                <article key={item.label} className="kp-stat-block">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.detail}</small>
                </article>
              ))}
            </div>

            <div className="kp-wave-panel">
              <div>
                <strong>Ready to audition this version?</strong>
                <p>Open Mix to hear the real stem balance and make changes that save back to this version.</p>
              </div>
              <button
                type="button"
                className="button-primary"
                onClick={() => onChangeTab('mix')}
                disabled={!selectedRunMixable}
              >
                Open mix
              </button>
            </div>

            {compareRun ? (
              <section className="kp-compare-panel">
                <header className="kp-section-header">
                  <div>
                    <h2>Compare target</h2>
                    <p>{compareRun.processing.profile_label} · Updated {formatTimestampShort(compareRun.updated_at)}</p>
                  </div>
                </header>
                <div className="kp-stat-grid">
                  {artifactSummary(compareRun).map((item) => (
                    <article key={item.label} className="kp-stat-block">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.detail}</small>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div className="kp-studio-blocked">
            <strong>Select a version to continue.</strong>
            <p>Version details, comparison, and mix access appear here.</p>
          </div>
        )}
      </section>

      <aside className="kp-studio-versions-rail">
        <section className="kp-studio-side-panel">
          <header className="kp-section-header">
            <div>
              <h2>Queue another split</h2>
              <p>Use this only when the current separation is not good enough.</p>
            </div>
          </header>

          {splitQueueRuns.length > 0 ? (
            <div className="kp-inline-run-list">
              {splitQueueRuns.map((run) => (
                <article key={run.id} className="kp-inline-run-row">
                  <span>
                    <strong>{run.processing.profile_label}</strong>
                    <small>{statusLabel(run.status)}</small>
                  </span>
                  <span>{isActiveRunStatus(run.status) ? `${Math.round(run.progress)}%` : formatTimestampShort(run.updated_at)}</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="kp-muted-copy">No active or failed versions are waiting right now.</p>
          )}

          <div className="kp-render-form">
            <ModelPicker
              profileKey={nextProcessing.profile_key}
              modelFilename={nextProcessing.model_filename ?? ''}
              profiles={profiles}
              cachedModels={cachedModels}
              labelId="studio-render-form"
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
              ) : track.runs.length === 0 ? (
                'Start split'
              ) : (
                'Queue version'
              )}
            </button>
          </div>
        </section>

        <section className="kp-studio-side-panel">
          <header className="kp-section-header">
            <div>
              <h2>Song details</h2>
              <p>Keep the source tidy before you lock a final version.</p>
            </div>
          </header>

          <div className="kp-stat-grid kp-stat-grid-compact">
            <article className="kp-stat-block">
              <span>Source file</span>
              <strong>{track.source_filename}</strong>
              <small>{track.source_format}</small>
            </article>
            <article className="kp-stat-block">
              <span>Duration</span>
              <strong>{formatDuration(track.duration_seconds)}</strong>
              <small>{track.keeper_run_id ? 'Final chosen' : 'No final version set'}</small>
            </article>
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
                label="Delete"
                pendingLabel="Deleting…"
                confirmLabel="Delete track"
                cancelLabel="Keep it"
                prompt={`Delete "${track.title}" and all its versions?`}
                onConfirm={() => onDeleteTrack(track.id)}
              />
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}

export function StudioPage({
  track,
  tab,
  selectedRunId,
  compareRunId,
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
  onBackToLibrary,
  onChangeTab,
  onSelectRun,
  onSelectCompare,
  onCreateRun,
  onCancelRun,
  onRetryRun,
  onDeleteRun,
  onSetKeeper,
  onPurgeNonKeepers,
  onSaveMix,
  onUpdateTrack,
  onDeleteTrack,
  onReveal,
  onError,
}: StudioPageProps) {
  if (!track) {
    return (
      <section className="kp-page kp-studio-page">
        <div className="kp-studio-blocked">
          <strong>No song selected</strong>
          <p>Choose a song from Songs to open its dedicated Studio workspace.</p>
        </div>
      </section>
    )
  }

  const selectedRun = resolveSelectedRun(track, selectedRunId)
  const completedRuns = track.runs.filter((run) => run.status === 'completed')
  const compareRun =
    compareRunId && selectedRun && compareRunId !== selectedRun.id
      ? track.runs.find((run) => run.id === compareRunId) ?? null
      : null

  return (
    <section className={`kp-page kp-studio-page kp-studio-page-${tab}`}>
      <StudioPageHeader
        track={track}
        tab={tab}
        selectedRun={selectedRun}
        onBackToLibrary={onBackToLibrary}
        onChangeTab={onChangeTab}
      />

      <div className={tab === 'mix' ? 'kp-studio-body kp-studio-body-mix' : 'kp-studio-body'}>
        {tab === 'mix' ? (
          <StudioMixTab
            track={track}
            run={selectedRun}
            runs={track.runs}
            selectedRunId={selectedRun?.id ?? null}
            profiles={profiles}
            defaultBitrate={defaultBitrate}
            savingMix={selectedRun ? savingMixRunId === selectedRun.id : false}
            settingKeeper={settingKeeper}
            onSelectRun={onSelectRun}
            onRetryRun={onRetryRun}
            onChangeTab={onChangeTab}
            onSetKeeper={onSetKeeper}
            onSaveMix={onSaveMix}
            onCreateRun={onCreateRun}
            onReveal={onReveal}
            onError={onError}
          />
        ) : (
          <StudioVersionsTab
            track={track}
            selectedRun={selectedRun}
            compareRun={compareRun}
            compareRunId={compareRunId}
            completedRuns={completedRuns}
            profiles={profiles}
            cachedModels={cachedModels}
            defaultProfileKey={defaultProfileKey}
            creatingRun={creatingRun}
            cancellingRunId={cancellingRunId}
            retryingRunId={retryingRunId}
            deletingRunId={deletingRunId}
            updatingTrack={updatingTrack}
            onSelectRun={onSelectRun}
            onSelectCompare={onSelectCompare}
            onCreateRun={onCreateRun}
            onCancelRun={onCancelRun}
            onRetryRun={onRetryRun}
            onDeleteRun={onDeleteRun}
            onChangeTab={onChangeTab}
            onPurgeNonKeepers={onPurgeNonKeepers}
            onUpdateTrack={onUpdateTrack}
            onDeleteTrack={onDeleteTrack}
          />
        )}
      </div>
    </section>
  )
}

export function StudioPageSkeleton() {
  return (
    <section className="kp-page kp-studio-page">
      <div className="skeleton-detail">
        <Skeleton width="48%" height={22} />
        <Skeleton width="66%" height={12} />
        <div className="skeleton-row">
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
        <Skeleton height={120} />
      </div>
    </section>
  )
}
