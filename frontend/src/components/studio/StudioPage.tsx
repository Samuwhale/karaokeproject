import { useState } from 'react'

import { CUSTOM_PROFILE_KEY } from '../../types'
import type {
  ArtifactMetrics,
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
import { MixScrubber } from '../mix/MixScrubber'
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

function artifactMetricsSummary(metrics: ArtifactMetrics | null) {
  if (!metrics) return 'Metrics pending'
  if (metrics.integrated_lufs !== null) return `${Math.round(Math.abs(metrics.integrated_lufs))} LUFS`
  if (metrics.true_peak_dbfs !== null) return `${Math.abs(metrics.true_peak_dbfs).toFixed(1)} dB peak`
  if (metrics.sample_rate !== null) return `${Math.round(metrics.sample_rate / 1000)} kHz`
  return 'Metrics ready'
}

function stemDescriptor(label: string) {
  switch (label.toLowerCase()) {
    case 'vocals':
      return 'Clarity'
    case 'drums':
      return 'Punch'
    case 'bass':
      return 'Depth'
    case 'other':
      return 'Texture'
    default:
      return 'Focus'
  }
}

function previewPeaks(run: RunDetail) {
  return run.artifacts.find((artifact) => (artifact.metrics?.peaks?.length ?? 0) > 0)?.metrics?.peaks ?? []
}

function previewDuration(run: RunDetail) {
  return (
    run.artifacts.find((artifact) => artifact.metrics?.duration_seconds !== null)?.metrics?.duration_seconds ??
    1
  )
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
      <section className="suite-page studio-page studio-empty">
        <div className="studio-empty-state">
          <h1>Studio</h1>
          <p>Pick a song from Songs to open its dedicated mixing workspace.</p>
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
    <section className={`suite-page studio-page studio-page-${tab}`}>
      <StudioHeader
        track={track}
        selectedRun={selectedRun}
        currentTab={tab}
        onBackToLibrary={onBackToLibrary}
        onOpenVersions={() => onChangeTab('versions')}
      />

      <StudioTabs currentTab={tab} onChangeTab={onChangeTab} />

      <div className={`studio-tab-panel studio-tab-panel-${tab}`}>
        {tab === 'mix' ? (
          <StudioMixTab
            track={track}
            run={selectedRun}
            profiles={profiles}
            defaultBitrate={defaultBitrate}
            savingMix={selectedRun ? savingMixRunId === selectedRun.id : false}
            settingKeeper={settingKeeper}
            onCreateRun={onCreateRun}
            onRetryRun={onRetryRun}
            onChangeTab={onChangeTab}
            onSetKeeper={onSetKeeper}
            onSaveMix={onSaveMix}
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
            updatingTrack={updatingTrack}
            onSelectRun={onSelectRun}
            onSelectCompare={onSelectCompare}
            onCreateRun={onCreateRun}
            onCancelRun={onCancelRun}
            onRetryRun={onRetryRun}
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

type StudioHeaderProps = {
  track: TrackDetail
  selectedRun: RunDetail | null
  currentTab: StudioTab
  onBackToLibrary: () => void
  onOpenVersions: () => void
}

function StudioHeader({
  track,
  selectedRun,
  currentTab,
  onBackToLibrary,
  onOpenVersions,
}: StudioHeaderProps) {
  return (
    <header className="studio-header">
      <div className="studio-header-main">
        <button type="button" className="studio-back" onClick={onBackToLibrary}>
          Back to Songs
        </button>
        <div>
          <h1>{track.title}</h1>
          <p>
            {track.artist ?? 'Unknown artist'} · {formatDuration(track.duration_seconds)} ·{' '}
            {track.source_type === 'youtube' ? 'YouTube' : track.source_format}
          </p>
        </div>
      </div>
      <div className="studio-header-context">
        <span>{currentTab === 'mix' ? 'Version' : 'Review workspace'}</span>
        <strong>{selectedRun ? selectedRun.processing.profile_label : 'No version selected'}</strong>
        {currentTab === 'mix' ? (
          <button type="button" className="button-secondary" onClick={onOpenVersions}>
            Change version
          </button>
        ) : null}
      </div>
    </header>
  )
}

type StudioTabsProps = {
  currentTab: StudioTab
  onChangeTab: (tab: StudioTab) => void
}

function StudioTabs({ currentTab, onChangeTab }: StudioTabsProps) {
  const tabs: { key: StudioTab; label: string }[] = [
    { key: 'mix', label: 'Mix' },
    { key: 'versions', label: 'Versions' },
  ]

  return (
    <div className="studio-tabs" role="tablist" aria-label="Studio sections">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={currentTab === tab.key}
          className={`studio-tab ${currentTab === tab.key ? 'studio-tab-active' : ''}`}
          onClick={() => onChangeTab(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

type StudioVersionListProps = {
  runs: RunDetail[]
  selectedRunId: string | null
  keeperRunId: string | null
  compareRunId?: string | null
  onSelectRun: (runId: string) => void
}

function StudioVersionList({
  runs,
  selectedRunId,
  keeperRunId,
  compareRunId = null,
  onSelectRun,
}: StudioVersionListProps) {
  if (runs.length === 0) {
    return <p className="empty-state">No versions yet. Queue the first split below.</p>
  }

  return (
    <div className="studio-version-list" role="list" aria-label="Song versions">
      {runs.map((run) => {
        const isSelected = selectedRunId === run.id
        const isKeeper = keeperRunId === run.id
        const isCompareTarget = compareRunId === run.id
        const metadata = [
          run.status === 'completed' ? formatTimestampShort(run.updated_at) : statusLabel(run.status),
          isKeeper ? 'Final version' : null,
          isCompareTarget ? 'Compare target' : null,
        ]
          .filter(Boolean)
          .join(' · ')

        return (
          <button
            key={run.id}
            type="button"
            role="listitem"
            className={`studio-version-row ${isSelected ? 'studio-version-row-active' : ''}`}
            onClick={() => onSelectRun(run.id)}
          >
            <div className="studio-version-row-copy">
              <strong>{run.processing.profile_label}</strong>
              <span>{metadata}</span>
            </div>
            {isKeeper ? <span className="studio-version-row-mark">Selected</span> : null}
          </button>
        )
      })}
    </div>
  )
}

type StudioMixTabProps = {
  track: TrackDetail
  run: RunDetail | null
  profiles: ProcessingProfile[]
  defaultBitrate: string
  savingMix: boolean
  settingKeeper: boolean
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<unknown>
  onRetryRun: (runId: string) => Promise<unknown>
  onChangeTab: (tab: StudioTab) => void
  onSetKeeper: (trackId: string, runId: string | null) => Promise<void>
  onSaveMix: (trackId: string, runId: string, stems: RunMixStemEntry[]) => Promise<void>
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  onError: (message: string) => void
}

function StudioMixTab({
  track,
  run,
  profiles,
  defaultBitrate,
  savingMix,
  settingKeeper,
  onCreateRun,
  onRetryRun,
  onChangeTab,
  onSetKeeper,
  onSaveMix,
  onReveal,
  onError,
}: StudioMixTabProps) {
  if (!run) {
    return (
      <div className="studio-blocked studio-mix-blocked">
        <strong>No version selected</strong>
        <p>Queue the first split in Versions before you start mixing.</p>
        <button type="button" className="button-primary" onClick={() => onChangeTab('versions')}>
          Open Versions
        </button>
      </div>
    )
  }

  const mixable = isMixableRun(run)
  const isFailed = RETRYABLE_RUN_STATUSES.has(run.status)

  if (isActiveRunStatus(run.status)) {
    return (
      <div className="studio-state-panel studio-mix-blocked">
        <div className="studio-state-copy">
          <strong>{selectedRunSummary(run)}</strong>
          <p>The selected version is still processing. Mixing unlocks as soon as this run finishes.</p>
        </div>
        <RunStepper status={run.status} lastActiveStatus={run.last_active_status} />
        <ProgressBar value={run.progress} label={run.status_message} />
        <button type="button" className="button-secondary" onClick={() => onChangeTab('versions')}>
          Open Versions
        </button>
      </div>
    )
  }

  if (isFailed) {
    return (
      <div className="studio-state-panel studio-state-panel-danger studio-mix-blocked">
        <div className="studio-state-copy">
          <strong>{run.status === 'cancelled' ? 'Split cancelled' : 'Split needs attention'}</strong>
          <p>{run.error_message || 'Retry this version or queue another one with a different setup.'}</p>
        </div>
        <div className="studio-inline-actions">
          <button type="button" className="button-primary" onClick={() => void onRetryRun(run.id)}>
            Retry split
          </button>
          <button type="button" className="button-secondary" onClick={() => onChangeTab('versions')}>
            Open Versions
          </button>
        </div>
      </div>
    )
  }

  if (!mixable) {
    return (
      <div className="studio-blocked studio-mix-blocked">
        <strong>This version finished without mixable stems.</strong>
        <p>Queue another version in Versions if you want a result you can shape in the mixer.</p>
        <button type="button" className="button-primary" onClick={() => onChangeTab('versions')}>
          Open Versions
        </button>
      </div>
    )
  }

  const keeperSelected = track.keeper_run_id === run.id
  const trackSummary = buildTrackSummary(track, run)
  const mixSummary = run.mix.is_default
    ? 'Export the current version as-is or download its stems.'
    : 'Export the saved custom balance or download raw stems from the same version.'

  return (
    <div className="studio-mix-tab studio-mix-tab-workspace">
      <div className="studio-mix-layout">
        <section className="studio-mix-main">
          <MixPanel
            key={mixPanelStateKey(track.id, run)}
            run={run}
            saving={savingMix}
            onSave={(stems) => onSaveMix(track.id, run.id, stems)}
          />
        </section>

        <aside className="studio-mix-rail">
          <section className="studio-side-section studio-project-rail">
            <span className="studio-side-kicker">Project Rail</span>
            <h3>{run.processing.profile_label}</h3>
            <p>{selectedRunSummary(run)}</p>
            <span>Updated {formatTimestampShort(run.updated_at)}</span>
            <div className="studio-side-actions">
              <button
                type="button"
                className={`button-secondary ${keeperSelected ? 'button-secondary-active' : ''}`}
                disabled={settingKeeper}
                onClick={() => void onSetKeeper(track.id, keeperSelected ? null : run.id)}
              >
                {keeperSelected ? 'Clear Finalize' : 'Finalize'}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void onReveal({ kind: 'track-outputs', track_id: track.id })}
              >
                Open Folder
              </button>
              <button type="button" className="button-secondary" onClick={() => onChangeTab('versions')}>
                Change Version
              </button>
            </div>
          </section>

          <section className="studio-side-section">
            <span className="studio-side-kicker">Starting Balance</span>
            <OutputIntentPicker
              run={run}
              profiles={profiles}
              compact
              saving={savingMix}
              onApplyTemplate={(stems) => onSaveMix(track.id, run.id, stems)}
              onRerunWithProfile={(profileKey) => onCreateRun(track.id, { profile_key: profileKey })}
            />
          </section>

          <section className="studio-side-section">
            <span className="studio-side-kicker">Status</span>
            <h3>{keeperSelected ? 'Final version selected' : 'Ready for export'}</h3>
            <p>
              {keeperSelected
                ? 'This mix is the saved version to keep for this song.'
                : 'Balance the stems, then export the master or mark this version as the keeper.'}
            </p>
          </section>

          <section className="studio-side-section studio-export-surface">
            <span className="studio-side-kicker">Mixdown</span>
            <h3>Export Master</h3>
            <p>{mixSummary}</p>
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
          </section>
        </aside>
      </div>
    </div>
  )
}

type StudioVersionsTabProps = {
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
  updatingTrack: boolean
  onSelectRun: (runId: string) => void
  onSelectCompare: (runId: string | null) => void
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<unknown>
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<unknown>
  onChangeTab: (tab: StudioTab) => void
  onPurgeNonKeepers: (trackId: string) => void
  onUpdateTrack: (trackId: string, payload: { title?: string; artist?: string | null }) => Promise<void>
  onDeleteTrack: (trackId: string) => void
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
  updatingTrack,
  onSelectRun,
  onSelectCompare,
  onCreateRun,
  onCancelRun,
  onRetryRun,
  onChangeTab,
  onPurgeNonKeepers,
  onUpdateTrack,
  onDeleteTrack,
}: StudioVersionsTabProps) {
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

  const selectedRunMixable = selectedRun ? isMixableRun(selectedRun) : false
  const splitQueueRuns = track.runs.filter((run) => run.status !== 'completed')

  return (
    <div className="studio-versions-tab studio-versions-layout">
      <section className="studio-section studio-versions-list-panel">
        <div className="studio-section-head">
          <div>
            <h2>Completed Versions</h2>
            <p>Choose the split version that deserves time in the mixer.</p>
          </div>
          {track.keeper_run_id ? (
            <ConfirmInline
              label="Delete Other Versions"
              pendingLabel="Cleaning…"
              confirmLabel="Delete other versions"
              cancelLabel="Keep them"
              prompt="Delete every non-final version for this song?"
              onConfirm={() => onPurgeNonKeepers(track.id)}
            />
          ) : null}
        </div>

        {track.runs.length === 0 ? (
          <p className="empty-state">No versions yet. Queue the first split below.</p>
        ) : (
          <StudioVersionList
            runs={track.runs}
            selectedRunId={selectedRun?.id ?? null}
            keeperRunId={track.keeper_run_id}
            compareRunId={compareRunId}
            onSelectRun={onSelectRun}
          />
        )}
      </section>

      <section className="studio-section studio-version-preview-panel">
        {selectedRun ? (
          <>
            <div className="studio-section-head">
              <div>
                <h2>Preview</h2>
                <p>Review the selected split, then open the winner in Mix.</p>
              </div>
              <div className="studio-inline-actions">
                {selectedRunMixable ? (
                  <button type="button" className="button-primary" onClick={() => onChangeTab('mix')}>
                    Open in Mix
                  </button>
                ) : null}
                {isActiveRunStatus(selectedRun.status) ? (
                  <ConfirmInline
                    label="Cancel Split"
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
                    {retryingRunId === selectedRun.id ? 'Retrying…' : 'Retry Split'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="studio-preview-hero">
              <div className="studio-preview-hero-copy">
                <h3>{selectedRun.processing.profile_label}</h3>
                <p>{selectedRunSummary(selectedRun)}</p>
                <div className="studio-preview-meta">
                  <span>{stemCount(selectedRun)} stems</span>
                  <span>{selectedRun.mix.is_default ? 'Default balance' : 'Custom balance saved'}</span>
                  <span>Updated {formatTimestampShort(selectedRun.updated_at)}</span>
                </div>
              </div>
              {selectedRun.status === 'completed' && completedRuns.length > 1 ? (
                <label className="field studio-compare-select">
                  <span>Compare with</span>
                  <select
                    value={compareRun?.id ?? ''}
                    onChange={(event) => onSelectCompare(event.target.value || null)}
                  >
                    <option value="">Choose another completed version</option>
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

            <div className="studio-version-preview-grid">
              {selectedRun.artifacts.filter((artifact) => isStemKind(artifact.kind)).slice(0, 4).map((artifact) => (
                <div key={artifact.id} className="studio-version-stat">
                  <span>{artifact.label}</span>
                  <strong>{stemDescriptor(artifact.label)}</strong>
                  <small>{artifactMetricsSummary(artifact.metrics)}</small>
                </div>
              ))}
              {stemCount(selectedRun) === 0 ? (
                <>
                  <div className="studio-version-stat">
                    <span>Status</span>
                    <strong>{statusLabel(selectedRun.status)}</strong>
                    <small>Selected version</small>
                  </div>
                  <div className="studio-version-stat">
                    <span>Updated</span>
                    <strong>{formatTimestampShort(selectedRun.updated_at)}</strong>
                    <small>Latest run update</small>
                  </div>
                </>
              ) : null}
            </div>

            <div className="studio-preview-wave">
              <MixScrubber
                peaks={previewPeaks(selectedRun)}
                currentTime={previewDuration(selectedRun) * 0.42}
                duration={previewDuration(selectedRun)}
                onSeek={() => undefined}
                disabled
              />
              <button
                type="button"
                className="button-primary studio-preview-wave-action"
                onClick={() => onChangeTab('mix')}
                disabled={!selectedRunMixable}
              >
                Preview in Mix
              </button>
            </div>

            {selectedRun.note ? (
              <div className="studio-version-note">
                <strong>Version note</strong>
                <p>{selectedRun.note}</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="studio-blocked studio-inline-blocked">
            <strong>Select a version to preview.</strong>
            <p>Version details, comparison, and mix access appear here.</p>
          </div>
        )}
      </section>

      <section className="studio-section studio-split-queue-panel">
        <div className="studio-section-head">
          <div>
            <h2>Split Queue</h2>
            <p>Queue a new version when the current result is not the one you want.</p>
          </div>
        </div>

        {splitQueueRuns.length > 0 ? (
          <div className="studio-inline-run-list">
            {splitQueueRuns.map((run) => (
              <div key={run.id} className="studio-inline-run-row">
                <div>
                  <strong>{run.processing.profile_label}</strong>
                  <span>{statusLabel(run.status)}</span>
                </div>
                <span>{isActiveRunStatus(run.status) ? `${Math.round(run.progress)}%` : formatTimestampShort(run.updated_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">No active or failed versions are waiting right now.</p>
        )}

        <div className="render-form">
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
          <div className="render-form-actions">
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
                'Start Split'
              ) : (
                'Queue Another Version'
              )}
            </button>
          </div>
        </div>
      </section>

      <section className="studio-section studio-song-settings-panel">
        <div className="studio-section-head">
          <div>
            <h2>Song Settings</h2>
            <p>Keep the source metadata tidy before you keep or export a final version.</p>
          </div>
        </div>

        <div className="studio-song-settings-grid">
          <div className="studio-version-stat">
            <span>Source file</span>
            <strong>{track.source_filename}</strong>
          </div>
          <div className="studio-version-stat">
            <span>Format</span>
            <strong>{track.source_format}</strong>
          </div>
          <div className="studio-version-stat">
            <span>Duration</span>
            <strong>{formatDuration(track.duration_seconds)}</strong>
          </div>
          <div className="studio-version-stat">
            <span>Saved version</span>
            <strong>{track.keeper_run_id ? 'Selected' : 'Not set'}</strong>
          </div>
        </div>

        {editing ? (
          <div className="track-detail-edit">
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
            <div className="track-detail-edit-actions">
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
          <div className="track-settings-actions">
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
    </div>
  )
}

export function StudioPageSkeleton() {
  return (
    <section className="suite-page studio-page">
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
