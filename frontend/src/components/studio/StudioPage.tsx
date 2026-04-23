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
import { CompareView } from '../CompareView'
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

const RUN_NOTE_MAX_LENGTH = 280
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
  savingNoteRunId: string | null
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
  onSetRunNote: (runId: string, note: string) => Promise<void>
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
  savingNoteRunId,
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
  onSetRunNote,
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
    <section className="suite-page studio-page">
      <StudioHeader
        track={track}
        selectedRun={selectedRun}
        currentTab={tab}
        onBackToLibrary={onBackToLibrary}
      />

      <StudioTabs currentTab={tab} onChangeTab={onChangeTab} />

      <div className="studio-tab-panel">
        {tab === 'mix' ? (
          <StudioMixTab
            track={track}
            run={selectedRun}
            profiles={profiles}
            defaultBitrate={defaultBitrate}
            savingMix={selectedRun ? savingMixRunId === selectedRun.id : false}
            settingKeeper={settingKeeper}
            onSelectRun={onSelectRun}
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
            settingKeeper={settingKeeper}
            savingNoteRunId={savingNoteRunId}
            updatingTrack={updatingTrack}
            onSelectRun={onSelectRun}
            onSelectCompare={onSelectCompare}
            onCreateRun={onCreateRun}
            onCancelRun={onCancelRun}
            onRetryRun={onRetryRun}
            onSetKeeper={onSetKeeper}
            onPurgeNonKeepers={onPurgeNonKeepers}
            onSetRunNote={onSetRunNote}
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
}

function StudioHeader({ track, selectedRun, currentTab, onBackToLibrary }: StudioHeaderProps) {
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
        <span>{currentTab === 'mix' ? 'Mix workspace' : 'Versions and retries'}</span>
        <strong>{selectedRun ? selectedRunSummary(selectedRun) : 'No version selected'}</strong>
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
            <strong>{run.processing.profile_label}</strong>
            <span>{metadata}</span>
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
  onSelectRun: (runId: string) => void
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
  onSelectRun,
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
      <div className="studio-blocked">
        <strong>No version selected</strong>
        <p>Queue the first split in Versions before you start mixing.</p>
        <button type="button" className="button-primary" onClick={() => onChangeTab('versions')}>
          Open Versions
        </button>
      </div>
    )
  }

  const mixable = run.status === 'completed' && run.artifacts.some((artifact) => isStemKind(artifact.kind))
  const isFailed = RETRYABLE_RUN_STATUSES.has(run.status)

  if (isActiveRunStatus(run.status)) {
    return (
      <div className="studio-state-panel">
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
      <div className="studio-state-panel studio-state-panel-danger">
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
      <div className="studio-blocked">
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
    <div className="studio-mix-tab">
      <div className="studio-mix-layout">
        <div className="studio-mix-main">
          <section className="studio-mix-intro">
            <div>
              <h2>Mix</h2>
              <p>Start with the closest version, shape the balance, then export once it sounds right.</p>
            </div>
            <span className="studio-mix-summary">
              {run.mix.is_default ? 'Default balance loaded' : 'Custom balance saved'}
            </span>
          </section>

          <OutputIntentPicker
            run={run}
            profiles={profiles}
            saving={savingMix}
            onApplyTemplate={(stems) => onSaveMix(track.id, run.id, stems)}
            onRerunWithProfile={(profileKey) => onCreateRun(track.id, { profile_key: profileKey })}
          />

          <MixPanel
            key={mixPanelStateKey(track.id, run)}
            run={run}
            saving={savingMix}
            onSave={(stems) => onSaveMix(track.id, run.id, stems)}
          />

          <section className="studio-export-surface">
            <div className="studio-section-head">
              <div>
                <h2>Export</h2>
                <p>{mixSummary}</p>
              </div>
            </div>
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
        </div>

        <aside className="studio-mix-sidebar">
          <section className="studio-side-section">
            <h3>Versions</h3>
            <p>{selectedRunSummary(run)}</p>
            <span>Updated {formatTimestampShort(run.updated_at)}</span>
            <StudioVersionList
              runs={track.runs}
              selectedRunId={run.id}
              keeperRunId={track.keeper_run_id}
              onSelectRun={onSelectRun}
            />
            <button type="button" className="button-secondary" onClick={() => onChangeTab('versions')}>
              Open version tools
            </button>
          </section>

          <section className="studio-side-section">
            <h3>Final version</h3>
            <p>
              {keeperSelected
                ? 'This version is the saved one to keep for this song.'
                : 'Mark this version as the one to keep once the balance feels right.'}
            </p>
            <button
              type="button"
              className={`button-secondary ${keeperSelected ? 'button-secondary-active' : ''}`}
              disabled={settingKeeper}
              onClick={() => void onSetKeeper(track.id, keeperSelected ? null : run.id)}
            >
              {keeperSelected ? 'Clear Final Version' : 'Set as Final Version'}
            </button>
          </section>

          <section className="studio-side-section">
            <h3>Files</h3>
            <p>Open the generated outputs directly when you need to inspect what this version produced.</p>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void onReveal({ kind: 'track-outputs', track_id: track.id })}
            >
              Open Result Folder
            </button>
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
  settingKeeper: boolean
  savingNoteRunId: string | null
  updatingTrack: boolean
  onSelectRun: (runId: string) => void
  onSelectCompare: (runId: string | null) => void
  onCreateRun: (trackId: string, processing: RunProcessingConfigInput) => Promise<unknown>
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<unknown>
  onSetKeeper: (trackId: string, runId: string | null) => Promise<void>
  onPurgeNonKeepers: (trackId: string) => void
  onSetRunNote: (runId: string, note: string) => Promise<void>
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
  settingKeeper,
  savingNoteRunId,
  updatingTrack,
  onSelectRun,
  onSelectCompare,
  onCreateRun,
  onCancelRun,
  onRetryRun,
  onSetKeeper,
  onPurgeNonKeepers,
  onSetRunNote,
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

  return (
    <div className="studio-versions-tab">
      <section className="studio-section">
        <div className="studio-section-head">
          <div>
            <h2>Versions</h2>
            <p>Choose the version you want to work from, compare finished results, or queue another attempt.</p>
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

      {selectedRun ? (
        <section className="studio-section">
          <div className="studio-section-head">
            <div>
              <h2>Selected version</h2>
              <p>{selectedRunSummary(selectedRun)}</p>
            </div>
            <div className="studio-inline-actions">
              {selectedRun.status === 'completed' ? (
                <button
                  type="button"
                  className={`button-secondary ${track.keeper_run_id === selectedRun.id ? 'button-secondary-active' : ''}`}
                  disabled={settingKeeper}
                  onClick={() =>
                    void onSetKeeper(track.id, track.keeper_run_id === selectedRun.id ? null : selectedRun.id)
                  }
                >
                  {track.keeper_run_id === selectedRun.id ? 'Clear Final Version' : 'Set as Final Version'}
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
          <RunNoteEditor
            key={`${selectedRun.id}:${selectedRun.note}`}
            runId={selectedRun.id}
            note={selectedRun.note}
            saving={savingNoteRunId === selectedRun.id}
            onSave={onSetRunNote}
          />
        </section>
      ) : null}

      {selectedRun && selectedRun.status === 'completed' && completedRuns.length > 1 ? (
        <section className="studio-section">
          <div className="studio-section-head">
            <div>
              <h2>Compare finished versions</h2>
              <p>Pick one other completed version only when you need help deciding between results.</p>
            </div>
          </div>
          <div className="studio-compare-controls">
            <label className="field">
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
          </div>

          {compareRun ? (
            <CompareView
              runA={selectedRun}
              runB={compareRun}
              metricsReady
              currentIsFinal={track.keeper_run_id === selectedRun.id}
              comparedIsFinal={track.keeper_run_id === compareRun.id}
              onUseCurrent={() => void onSetKeeper(track.id, selectedRun.id)}
              onUseCompared={() => void onSetKeeper(track.id, compareRun.id)}
            />
          ) : (
            <div className="studio-blocked studio-inline-blocked">
              <strong>Choose a second completed version.</strong>
              <p>Waveform overlays and metrics appear once both compare targets are selected.</p>
            </div>
          )}
        </section>
      ) : null}

      <section className="studio-section">
        <div className="studio-section-head">
          <div>
            <h2>{track.runs.length === 0 ? 'Queue First Split' : 'Queue Another Version'}</h2>
            <p>Use this when the current result is not the one you want, or when the song has no version yet.</p>
          </div>
        </div>
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

      <details className="studio-maintenance">
        <summary>Song Settings</summary>
        <div className="studio-maintenance-body">
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
        </div>
      </details>
    </div>
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
        placeholder="Add context about why this version is the one to keep."
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
