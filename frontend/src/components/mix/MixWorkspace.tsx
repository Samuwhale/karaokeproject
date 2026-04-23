import { useEffect, useRef, useState } from 'react'

import { ConfirmInline } from '../feedback/ConfirmInline'
import { RunStepper } from '../feedback/RunStepper'
import { Spinner } from '../feedback/Spinner'
import { MixExportPopover } from './MixExportPopover'
import { MixPanel } from './MixPanel'
import { OutputIntentPicker } from './OutputIntent'
import { RUN_STATUS_SHORT_LABELS, isActiveRunStatus } from '../runStatus'
import { resolveSelectedRun } from '../../runSelection'
import { isStemKind } from '../../stems'
import type {
  ProcessingProfile,
  RevealFolderInput,
  RunDetail,
  RunMixStemEntry,
  RunProcessingConfigInput,
  TrackDetail,
} from '../../types'

type MixWorkspaceProps = {
  track: TrackDetail | null
  selectedRunId: string | null
  profiles: ProcessingProfile[]
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

type Popover = null | 'versions' | 'export' | 'menu'

const RETRYABLE_STATUSES = new Set(['failed', 'cancelled'])

function formatStatus(status: string) {
  return RUN_STATUS_SHORT_LABELS[status] ?? status
}

function formatTimestampShort(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isMixableRun(run: RunDetail) {
  return run.status === 'completed' && run.artifacts.some((artifact) => isStemKind(artifact.kind))
}

function versionSummary(run: RunDetail | null, keeperId: string | null): string {
  if (!run) return 'No version yet'
  const isKeeper = keeperId && run.id === keeperId
  const prefix = isKeeper ? 'Final · ' : ''
  return `${prefix}${run.processing.profile_label}`
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Ellipsis() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <circle cx="4" cy="9" r="1.4" />
      <circle cx="9" cy="9" r="1.4" />
      <circle cx="14" cy="9" r="1.4" />
    </svg>
  )
}

function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M8.5 3L4.5 7L8.5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type VersionsPopoverProps = {
  track: TrackDetail
  selectedRun: RunDetail | null
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  creatingRun: boolean
  cancellingRunId: string | null
  retryingRunId: string | null
  deletingRunId: string | null
  settingKeeper: boolean
  onClose: () => void
  onSelectRun: (runId: string) => void
  onCreateRun: (processing: RunProcessingConfigInput) => Promise<unknown>
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<unknown>
  onDeleteRun: (runId: string) => Promise<void>
  onSetKeeper: (runId: string | null) => Promise<void>
}

function VersionsPopover({
  track,
  selectedRun,
  profiles,
  defaultProfileKey,
  creatingRun,
  cancellingRunId,
  retryingRunId,
  deletingRunId,
  settingKeeper,
  onClose,
  onSelectRun,
  onCreateRun,
  onCancelRun,
  onRetryRun,
  onDeleteRun,
  onSetKeeper,
}: VersionsPopoverProps) {
  const activeProfile = profiles.some((profile) => profile.key === defaultProfileKey)
    ? defaultProfileKey
    : profiles[0]?.key ?? defaultProfileKey
  const [profileKey, setProfileKey] = useState(activeProfile)
  const keeperId = track.keeper_run_id
  const selectedId = selectedRun?.id ?? null
  const selectedIsKeeper = !!selectedRun && keeperId === selectedRun.id
  const canDeleteSelected =
    !!selectedRun && selectedRun.id !== keeperId && !isActiveRunStatus(selectedRun.status)

  async function queueSplit() {
    const result = await onCreateRun({ profile_key: profileKey })
    if (result && typeof result === 'object' && 'run' in result) {
      const runId = (result as { run: { id: string } }).run.id
      onSelectRun(runId)
    }
    onClose()
  }

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} aria-hidden />
      <div className="popover popover-center popover-wide" role="dialog" aria-label="Versions">
        <div className="popover-title">Versions</div>
        {track.runs.length === 0 ? (
          <p className="popover-empty">No splits yet. Queue the first one below.</p>
        ) : (
          <div className="popover-list" role="list">
            {track.runs.map((run) => {
              const isActive = run.id === selectedId
              const isKeeper = run.id === keeperId
              const detail = `${formatStatus(run.status)} · ${formatTimestampShort(run.updated_at)}${isKeeper ? ' · Final' : ''}`
              const state = isActiveRunStatus(run.status)
                ? `${Math.round(run.progress)}%`
                : formatStatus(run.status)
              return (
                <button
                  key={run.id}
                  type="button"
                  className={`popover-row ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    onSelectRun(run.id)
                    onClose()
                  }}
                >
                  <span className="popover-row-copy">
                    <strong>{run.processing.profile_label}</strong>
                    <span>{detail}</span>
                  </span>
                  <span className="popover-row-state">{state}</span>
                </button>
              )
            })}
          </div>
        )}

        {selectedRun && isActiveRunStatus(selectedRun.status) ? (
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

        {selectedRun && RETRYABLE_STATUSES.has(selectedRun.status) ? (
          <div className="popover-foot">
            <button
              type="button"
              className="button-primary"
              onClick={() => void onRetryRun(selectedRun.id)}
            >
              {retryingRunId === selectedRun.id ? 'Retrying…' : 'Retry split'}
            </button>
          </div>
        ) : null}

        {selectedRun && selectedRun.status === 'completed' ? (
          <div className="popover-foot">
            <button
              type="button"
              className="button-secondary"
              disabled={settingKeeper}
              onClick={() => void onSetKeeper(selectedIsKeeper ? null : selectedRun.id)}
            >
              {selectedIsKeeper ? 'Clear final' : 'Mark as final'}
            </button>
            {canDeleteSelected ? (
              <ConfirmInline
                label="Delete version"
                pendingLabel="Deleting…"
                confirmLabel="Delete"
                cancelLabel="Keep it"
                prompt="Delete this version?"
                pending={deletingRunId === selectedRun.id}
                onConfirm={() => onDeleteRun(selectedRun.id)}
              />
            ) : null}
          </div>
        ) : null}

        <div className="popover-foot popover-foot-split">
          <select
            className="popover-select"
            value={profileKey}
            onChange={(event) => setProfileKey(event.target.value)}
            aria-label="Split profile"
          >
            {profiles.map((profile) => (
              <option key={profile.key} value={profile.key}>
                {profile.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button-primary"
            disabled={creatingRun}
            onClick={() => void queueSplit()}
          >
            {creatingRun ? (
              <>
                <Spinner /> Queueing…
              </>
            ) : (
              'New split'
            )}
          </button>
        </div>
      </div>
    </>
  )
}

type OverflowMenuProps = {
  track: TrackDetail
  updatingTrack: boolean
  onClose: () => void
  onReveal: () => void | Promise<void>
  onUpdateTrack: (payload: { title?: string; artist?: string | null }) => Promise<void>
  onDeleteTrack: () => void
}

function OverflowMenu({ track, updatingTrack, onClose, onReveal, onUpdateTrack, onDeleteTrack }: OverflowMenuProps) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(track.title)
  const [artist, setArtist] = useState(track.artist ?? '')

  async function saveEdits() {
    const nextTitle = title.trim()
    const nextArtist = artist.trim()
    if (!nextTitle) return
    await onUpdateTrack({ title: nextTitle, artist: nextArtist ? nextArtist : null })
    setEditing(false)
    onClose()
  }

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} aria-hidden />
      <div className="popover popover-right" role="dialog" aria-label="Track options">
        {editing ? (
          <div className="rename-form">
            <label>
              Title
              <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
            </label>
            <label>
              Artist
              <input
                type="text"
                value={artist}
                placeholder="Optional"
                onChange={(event) => setArtist(event.target.value)}
              />
            </label>
            <div className="rename-form-actions">
              <button type="button" className="button-link" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={updatingTrack || !title.trim()}
                onClick={() => void saveEdits()}
              >
                {updatingTrack ? <Spinner /> : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="menu">
            <button type="button" className="menu-item" onClick={() => setEditing(true)}>
              Rename…
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                void onReveal()
                onClose()
              }}
            >
              Reveal source folder
            </button>
            <ConfirmInline
              label="Delete song…"
              pendingLabel="Deleting…"
              confirmLabel={`Delete "${track.title}"`}
              cancelLabel="Keep"
              prompt={`Delete "${track.title}" and all its versions?`}
              onConfirm={async () => {
                onDeleteTrack()
                onClose()
              }}
            />
          </div>
        )}
      </div>
    </>
  )
}

export function MixWorkspace(props: MixWorkspaceProps) {
  if (!props.track) {
    return (
      <section className="mix">
        <div className="mix-empty">
          <strong>No song selected</strong>
          <p>Choose a song from Library to open its mix workspace.</p>
        </div>
      </section>
    )
  }
  return <MixWorkspaceContent {...props} track={props.track} />
}

function MixWorkspaceContent({
  track,
  selectedRunId,
  profiles,
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
}: MixWorkspaceProps & { track: TrackDetail }) {
  const [popover, setPopover] = useState<Popover>(null)
  const selectedRun = resolveSelectedRun(track, selectedRunId)
  const mixable = selectedRun ? isMixableRun(selectedRun) : false
  const canExport = !!selectedRun && selectedRun.status === 'completed'
  const versionLabel = versionSummary(selectedRun, track.keeper_run_id)
  const activeSplit = selectedRun && isActiveRunStatus(selectedRun.status)
  const progressPct = activeSplit ? Math.round(selectedRun.progress) : null

  const mixRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && popover) setPopover(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [popover])

  return (
    <section className="mix" ref={mixRef}>
      <header className="mix-top">
        <button type="button" className="mix-back" onClick={onBackToSongs}>
          <BackArrow />
          Library
        </button>
        <div className="mix-top-title">
          <div className="mix-top-title-lines">
            <strong title={track.title}>{track.title}</strong>
            <span className="mix-top-artist">{track.artist ?? 'Unknown artist'}</span>
          </div>
          <span className="popover-anchor mix-top-version">
            <button
              type="button"
              className={`mix-version-pill ${popover === 'versions' ? 'is-open' : ''}`}
              onClick={() => setPopover(popover === 'versions' ? null : 'versions')}
              aria-haspopup="dialog"
              aria-expanded={popover === 'versions'}
            >
              {activeSplit ? <span className="mix-version-dot" data-state="active" aria-hidden /> : null}
              <span>{progressPct !== null ? `${versionLabel} · ${progressPct}%` : versionLabel}</span>
              <Chevron />
            </button>
            {popover === 'versions' ? (
              <VersionsPopover
                track={track}
                selectedRun={selectedRun}
                profiles={profiles}
                defaultProfileKey={defaultProfileKey}
                creatingRun={creatingRun}
                cancellingRunId={cancellingRunId}
                retryingRunId={retryingRunId}
                deletingRunId={deletingRunId}
                settingKeeper={settingKeeper}
                onClose={() => setPopover(null)}
                onSelectRun={onSelectRun}
                onCreateRun={(processing) => onCreateRun(track.id, processing)}
                onCancelRun={onCancelRun}
                onRetryRun={onRetryRun}
                onDeleteRun={onDeleteRun}
                onSetKeeper={(runId) => onSetKeeper(track.id, runId)}
              />
            ) : null}
          </span>
        </div>
        <div className="mix-top-actions">
          <span className="popover-anchor">
            <button
              type="button"
              className="button-primary"
              onClick={() => setPopover(popover === 'export' ? null : 'export')}
              disabled={!canExport}
              aria-haspopup="dialog"
              aria-expanded={popover === 'export'}
              title={canExport ? undefined : 'Export unlocks after the selected version finishes.'}
            >
              Export
            </button>
            {popover === 'export' && selectedRun && canExport ? (
              <MixExportPopover
                track={track}
                run={selectedRun}
                defaultBitrate={defaultBitrate}
                onClose={() => setPopover(null)}
                onReveal={onReveal}
                onError={onError}
              />
            ) : null}
          </span>
          <span className="popover-anchor">
            <button
              type="button"
              className="icon-button"
              onClick={() => setPopover(popover === 'menu' ? null : 'menu')}
              aria-haspopup="menu"
              aria-expanded={popover === 'menu'}
              aria-label="Song options"
            >
              <Ellipsis />
            </button>
            {popover === 'menu' ? (
              <OverflowMenu
                track={track}
                updatingTrack={updatingTrack}
                onClose={() => setPopover(null)}
                onReveal={() => onReveal({ kind: 'track-outputs', track_id: track.id })}
                onUpdateTrack={(payload) => onUpdateTrack(track.id, payload)}
                onDeleteTrack={() => onDeleteTrack(track.id)}
              />
            ) : null}
          </span>
        </div>
      </header>

      {mixable && selectedRun ? (
        <OutputIntentPicker
          run={selectedRun}
          saving={savingMixRunId === selectedRun.id}
          onApplyTemplate={(stems) => onSaveMix(track.id, selectedRun.id, stems)}
        />
      ) : null}

      {selectedRun && mixable ? (
        <MixPanel
          key={`${track.id}:${selectedRun.id}`}
          run={selectedRun}
          saving={savingMixRunId === selectedRun.id}
          onSave={(stems) => onSaveMix(track.id, selectedRun.id, stems)}
        />
      ) : (
        <div className="mix-blocked">
          {selectedRun ? (
            isActiveRunStatus(selectedRun.status) ? (
              <>
                <strong>Splitting {selectedRun.processing.profile_label}</strong>
                <RunStepper status={selectedRun.status} lastActiveStatus={selectedRun.last_active_status} />
              </>
            ) : RETRYABLE_STATUSES.has(selectedRun.status) ? (
              <>
                <strong>This split didn't complete</strong>
                <p>{selectedRun.error_message || 'Retry this version or queue another one.'}</p>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => void onRetryRun(selectedRun.id)}
                >
                  {retryingRunId === selectedRun.id ? 'Retrying…' : 'Retry split'}
                </button>
              </>
            ) : (
              <>
                <strong>No mixable stems</strong>
                <p>This version finished without stems. Queue another split from Versions.</p>
              </>
            )
          ) : (
            <>
              <strong>No version yet</strong>
              <p>Queue the first split to start mixing.</p>
              <button type="button" className="button-primary" onClick={() => setPopover('versions')}>
                New split
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
