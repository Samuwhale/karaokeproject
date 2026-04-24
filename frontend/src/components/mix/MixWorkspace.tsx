import { useEffect, useRef, useState } from 'react'

import { discardRejection } from '../../async'
import { ConfirmInline } from '../feedback/ConfirmInline'
import { RunStepper } from '../feedback/RunStepper'
import { MixExportPopover } from './MixExportPopover'
import { MixPanel } from './MixPanel'
import { OutputIntentPicker } from './OutputIntent'
import { RUN_STATUS_SHORT_LABELS, isActiveRunStatus } from '../runStatus'
import { resolveSelectedRun } from '../../runSelection'
import { isStemKind, stemLabel } from '../../stems'
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
  hasPrevTrack: boolean
  hasNextTrack: boolean
  trackPosition: { index: number; total: number } | null
  onBackToSongs: () => void
  onNavigatePrev: () => void
  onNavigateNext: () => void
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
  onOpenShortcuts: () => void
  onError: (message: string) => void
}

type Popover = null | 'versions' | 'export' | 'menu'

type InlineProfilePickerProps = {
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  creatingRun: boolean
  onCreateRun: (processing: RunProcessingConfigInput) => void
}

function InlineProfilePicker({ profiles, defaultProfileKey, creatingRun, onCreateRun }: InlineProfilePickerProps) {
  return (
    <>
      {profiles.length > 0 ? (
        <div className="mix-profile-picker">
          {profiles.map((profile) => {
            const isDefault = profile.key === defaultProfileKey
            return (
              <button
                key={profile.key}
                type="button"
                className={`mix-profile-option ${isDefault ? 'is-default' : ''}`}
                disabled={creatingRun}
                onClick={() => onCreateRun({ profile_key: profile.key })}
              >
                <div className="mix-profile-option-top">
                  <span className="mix-profile-option-label">{profile.label}</span>
                  {isDefault ? <span className="mix-profile-option-default">Default</span> : null}
                </div>
                {profile.best_for ? (
                  <span className="mix-profile-option-hint">{profile.best_for}</span>
                ) : null}
                {profile.stems.length > 0 ? (
                  <span className="mix-profile-option-stems">
                    {profile.stems.map((s) => stemLabel(s)).join(' · ')}
                  </span>
                ) : null}
                {profile.tradeoff ? (
                  <span className="mix-profile-option-tradeoff">{profile.tradeoff}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mix-blocked-hint">No profiles configured. Check Settings → Maintenance.</p>
      )}
    </>
  )
}

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

function versionSummary(run: RunDetail): string {
  return run.processing.profile_label
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

function ChevronUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 9L7 5L11 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type VersionsPopoverProps = {
  track: TrackDetail
  selectedRun: RunDetail | null
  profiles: ProcessingProfile[]
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

function pickRepresentativeRun(
  runs: RunDetail[],
  profileKey: string,
  keeperId: string | null,
): RunDetail | null {
  const matches = runs.filter((run) => run.processing.profile_key === profileKey)
  if (matches.length === 0) return null
  const sorted = [...matches].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const keeper = sorted.find((run) => run.id === keeperId)
  if (keeper) return keeper
  const completed = sorted.find((run) => run.status === 'completed')
  if (completed) return completed
  const active = sorted.find((run) => isActiveRunStatus(run.status))
  if (active) return active
  return sorted[0]
}

function VersionsPopover({
  track,
  selectedRun,
  profiles,
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
  const keeperId = track.keeper_run_id
  const selectedIsKeeper = !!selectedRun && keeperId === selectedRun.id
  const canDeleteSelected =
    !!selectedRun && selectedRun.id !== keeperId && !isActiveRunStatus(selectedRun.status)
  const [armedKey, setArmedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!armedKey) return
    const timeoutId = window.setTimeout(() => setArmedKey(null), 5000)
    return () => window.clearTimeout(timeoutId)
  }, [armedKey])

  const rows = profiles.map((profile) => ({
    profile,
    run: pickRepresentativeRun(track.runs, profile.key, keeperId),
  }))

  async function generate(profileKey: string) {
    const result = await onCreateRun({ profile_key: profileKey })
    if (result && typeof result === 'object' && 'run' in result) {
      const runId = (result as { run: { id: string } }).run.id
      onSelectRun(runId)
    }
    onClose()
  }

  async function retry(run: RunDetail) {
    onSelectRun(run.id)
    await onRetryRun(run.id)
    onClose()
  }

  function handleRowClick(profileKey: string, run: RunDetail | null) {
    if (!run || RETRYABLE_STATUSES.has(run.status)) {
      setArmedKey(profileKey)
      return
    }
    onSelectRun(run.id)
    onClose()
  }

  function stateLabel(run: RunDetail | null): string {
    if (!run) return creatingRun ? 'Queueing…' : 'Generate'
    if (isActiveRunStatus(run.status)) return `${Math.round(run.progress * 100)}%`
    if (RETRYABLE_STATUSES.has(run.status)) {
      return retryingRunId === run.id ? 'Retrying…' : 'Retry'
    }
    return 'Ready'
  }

  function detailLine(profile: ProcessingProfile, run: RunDetail | null): string | null {
    if (!run) return profile.best_for || null
    if (isActiveRunStatus(run.status)) return run.status_message || formatStatus(run.status)
    const when = formatTimestampShort(run.updated_at)
    if (run.status === 'completed') return when
    return `${formatStatus(run.status)} · ${when}`
  }

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} aria-hidden />
      <div className="popover popover-right popover-wide" role="dialog" aria-label="Split types">
        <div className="popover-title">Split types</div>
        {rows.length === 0 ? (
          <p className="popover-empty">No split types configured.</p>
        ) : (
          <div className="popover-list" role="list">
            {rows.map(({ profile, run }) => {
              const isActive = !!run && run.id === selectedRun?.id
              const isArmed = armedKey === profile.key
              const detail = detailLine(profile, run)
              const disabled =
                (!run && creatingRun) ||
                (!!run && RETRYABLE_STATUSES.has(run.status) && retryingRunId === run.id)

              if (isArmed) {
                const isRetry = !!run && RETRYABLE_STATUSES.has(run.status)
                return (
                  <div key={profile.key} className="popover-row is-armed" role="group">
                    <span className="popover-row-copy">
                      <strong>{profile.label}</strong>
                      <span>{isRetry ? 'Retry this split?' : 'Generate this split?'}</span>
                    </span>
                    <span className="popover-row-confirm">
                      <button
                        type="button"
                        className="button-primary"
                        disabled={disabled}
                        onClick={() => {
                          setArmedKey(null)
                          if (isRetry && run) discardRejection(() => retry(run))
                          else discardRejection(() => generate(profile.key))
                        }}
                      >
                        {isRetry ? 'Retry' : 'Generate'}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => setArmedKey(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                )
              }

              const isPreferred = !!run && run.id === keeperId
              return (
                <button
                  key={profile.key}
                  type="button"
                  className={`popover-row ${isActive ? 'is-active' : ''} ${isPreferred ? 'is-preferred' : ''}`}
                  disabled={disabled}
                  onClick={() => handleRowClick(profile.key, run)}
                >
                  <span className="popover-row-copy">
                    <strong>
                      {isPreferred ? (
                        <span className="popover-row-star" aria-label="Preferred" title="Preferred split">★</span>
                      ) : null}
                      {profile.label}
                    </strong>
                    {detail ? <span>{detail}</span> : null}
                    {run && profile.best_for ? (
                      <span className="popover-row-hint">{profile.best_for}</span>
                    ) : null}
                  </span>
                  <span className="popover-row-state">{stateLabel(run)}</span>
                </button>
              )
            })}
          </div>
        )}

        {selectedRun && isActiveRunStatus(selectedRun.status) ? (
          <ConfirmInline
            label="Cancel split"
            pendingLabel="Cancelling…"
            confirmLabel="Stop"
            cancelLabel="Keep running"
            prompt="Stop this split?"
            pending={cancellingRunId === selectedRun.id}
            onConfirm={() => onCancelRun(selectedRun.id)}
          />
        ) : null}

        {selectedRun && selectedRun.status === 'completed' ? (
          <div className="popover-foot">
            <button
              type="button"
              className="button-secondary"
              disabled={settingKeeper}
              onClick={() =>
                discardRejection(() => onSetKeeper(selectedIsKeeper ? null : selectedRun.id))
              }
            >
              {selectedIsKeeper ? 'Clear preferred' : 'Prefer this split'}
            </button>
            {canDeleteSelected ? (
              <ConfirmInline
                label="Delete split"
                pendingLabel="Deleting…"
                confirmLabel="Delete"
                cancelLabel="Keep it"
                prompt="Delete this split?"
                pending={deletingRunId === selectedRun.id}
                onConfirm={() => onDeleteRun(selectedRun.id)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}

type OverflowMenuProps = {
  track: TrackDetail
  onClose: () => void
  onReveal: () => void | Promise<void>
  onDeleteTrack: () => void
  onOpenShortcuts: () => void
}

function OverflowMenu({ track, onClose, onReveal, onDeleteTrack, onOpenShortcuts }: OverflowMenuProps) {
  return (
    <>
      <div className="popover-backdrop" onClick={onClose} aria-hidden />
      <div className="popover popover-right" role="dialog" aria-label="Track options">
        <div className="menu">
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              discardRejection(onReveal)
              onClose()
            }}
          >
            Reveal source folder
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => { onOpenShortcuts(); onClose() }}
          >
            Keyboard shortcuts
          </button>
          <div className="menu-sep" aria-hidden />
          <ConfirmInline
            label="Delete song…"
            pendingLabel="Deleting…"
            confirmLabel={`Delete "${track.title}"`}
            cancelLabel="Keep"
            prompt={`Delete "${track.title}" and all its splits?`}
            onConfirm={async () => {
              onDeleteTrack()
              onClose()
            }}
          />
        </div>
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
  hasPrevTrack,
  hasNextTrack,
  trackPosition,
  onBackToSongs,
  onNavigatePrev,
  onNavigateNext,
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
  onOpenShortcuts,
  onError,
}: MixWorkspaceProps & { track: TrackDetail }) {
  const [popover, setPopover] = useState<Popover>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const titleCommitRef = useRef(false)
  const editTitleRef = useRef<HTMLInputElement>(null)
  const editArtistRef = useRef<HTMLInputElement>(null)

  const selectedRun = resolveSelectedRun(track, selectedRunId)
  const mixable = selectedRun ? isMixableRun(selectedRun) : false
  const canExport = !!selectedRun && selectedRun.status === 'completed'
  const versionLabel = selectedRun ? versionSummary(selectedRun) : ''
  const activeSplit = selectedRun && isActiveRunStatus(selectedRun.status)
  const selectedRunIsKeeper = !!selectedRun && selectedRun.id === track.keeper_run_id
  const progressPct = activeSplit ? Math.round(selectedRun.progress * 100) : null

  // Reset inline edit when navigating to a different track
  useEffect(() => {
    setEditingTitle(false)
    titleCommitRef.current = false
  }, [track.id])

  // Focus title input when edit mode opens
  useEffect(() => {
    if (editingTitle) editTitleRef.current?.focus()
  }, [editingTitle])

  function startEditTitle() {
    titleCommitRef.current = false
    setEditTitle(track.title)
    setEditArtist(track.artist ?? '')
    setEditingTitle(true)
  }

  function commitTitleEdit() {
    if (titleCommitRef.current) return
    titleCommitRef.current = true
    const nextTitle = editTitle.trim()
    setEditingTitle(false)
    if (nextTitle && (nextTitle !== track.title || (editArtist.trim() || null) !== track.artist)) {
      discardRejection(() => onUpdateTrack(track.id, {
        title: nextTitle,
        artist: editArtist.trim() || null,
      }))
    }
  }

  function cancelTitleEdit() {
    titleCommitRef.current = false
    setEditingTitle(false)
  }

  const mixRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    function isEditable(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (editingTitle) { cancelTitleEdit(); return }
        if (popover) setPopover(null)
        return
      }
      if (isEditable(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'e') {
        if (!canExport) return
        event.preventDefault()
        setPopover((p) => (p === 'export' ? null : 'export'))
        return
      }
      if (event.key === 'v') {
        if (!selectedRun) return
        event.preventDefault()
        setPopover((p) => (p === 'versions' ? null : 'versions'))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editingTitle, popover, canExport, selectedRun])

  return (
    <section className="mix" ref={mixRef}>
      <header className="mix-top">
        <div className="mix-top-nav">
          <button type="button" className="mix-back" onClick={onBackToSongs} title="Back to library (Esc)">
            <BackArrow />
            Library
          </button>
          {trackPosition && trackPosition.total > 1 ? (
            <div className="mix-nav-stepper" role="group" aria-label="Browse tracks">
              <button
                type="button"
                className="icon-button mix-nav-btn"
                onClick={onNavigatePrev}
                disabled={!hasPrevTrack}
                aria-label="Previous track"
                title="Previous track (k)"
              >
                <ChevronUp />
              </button>
              <span className="mix-nav-position" aria-live="polite">
                {trackPosition.index + 1}<span aria-hidden>/</span>{trackPosition.total}
              </span>
              <button
                type="button"
                className="icon-button mix-nav-btn"
                onClick={onNavigateNext}
                disabled={!hasNextTrack}
                aria-label="Next track"
                title="Next track (j)"
              >
                <ChevronDown />
              </button>
            </div>
          ) : null}
        </div>
        <div className="mix-top-title">
          <span className="mix-top-art" aria-hidden>
            {track.thumbnail_url
              ? <img src={track.thumbnail_url} alt="" loading="lazy" />
              : track.title.trim().slice(0, 1).toUpperCase() || 'S'}
          </span>
          {editingTitle ? (
            <div
              className="mix-top-rename"
              onBlur={(e) => {
                if (e.relatedTarget instanceof HTMLElement && e.currentTarget.contains(e.relatedTarget)) return
                commitTitleEdit()
              }}
            >
              <input
                ref={editTitleRef}
                type="text"
                className="mix-top-rename-title"
                value={editTitle}
                disabled={updatingTrack}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); editArtistRef.current?.focus() }
                  if (e.key === 'Escape') { e.preventDefault(); cancelTitleEdit() }
                }}
                aria-label="Song title"
              />
              <input
                ref={editArtistRef}
                type="text"
                className="mix-top-rename-artist"
                value={editArtist}
                placeholder="Artist (optional)"
                disabled={updatingTrack}
                onChange={(e) => setEditArtist(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTitleEdit() }
                  if (e.key === 'Escape') { e.preventDefault(); cancelTitleEdit() }
                }}
                aria-label="Song artist"
              />
            </div>
          ) : (
            <button
              type="button"
              className="mix-top-title-copy"
              disabled={updatingTrack}
              onClick={startEditTitle}
              title="Click to rename"
              aria-label={`Rename — ${track.title}`}
            >
              <strong>{track.title}</strong>
              <span className="mix-top-title-sub">
                {track.artist ? <span className="mix-top-artist">{track.artist}</span> : null}
                <span className="mix-top-edit-icon" aria-hidden><PencilIcon /></span>
              </span>
            </button>
          )}
        </div>
        <div className="mix-top-actions">
          {selectedRun ? (
            <span className="popover-anchor">
              {(() => {
                const completedCount = track.runs.filter((r) => r.status === 'completed').length
                const isQueued = selectedRun?.status === 'queued'
                return (
                  <button
                    type="button"
                    className={`mix-version-pill ${popover === 'versions' ? 'is-open' : ''} ${selectedRunIsKeeper ? 'is-keeper' : ''}`}
                    onClick={() => setPopover(popover === 'versions' ? null : 'versions')}
                    aria-haspopup="dialog"
                    aria-expanded={popover === 'versions'}
                    title={selectedRunIsKeeper ? 'Preferred split — click for all split types (v)' : 'Split types — click to generate, switch, or manage (v)'}
                  >
                    {activeSplit ? <span className="mix-version-dot" data-state="active" aria-hidden /> : null}
                    {!activeSplit && selectedRunIsKeeper ? (
                      <span className="mix-version-star" aria-hidden>★</span>
                    ) : null}
                    <span className="mix-version-pill-label">{versionLabel}</span>
                    {isQueued ? (
                      <span className="mix-version-count">queued</span>
                    ) : progressPct !== null ? (
                      <span className="mix-version-count">{progressPct}%</span>
                    ) : completedCount > 1 ? (
                      <span className="mix-version-count mix-version-count-badge" aria-label={`${completedCount} split types`}>{completedCount}</span>
                    ) : null}
                    <span className="mix-version-chevron"><Chevron /></span>
                  </button>
                )
              })()}
              {popover === 'versions' ? (
                <VersionsPopover
                  track={track}
                  selectedRun={selectedRun}
                  profiles={profiles}
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
          ) : null}
          {track.runs.length > 0 ? (
            <span className="popover-anchor">
              <button
                type="button"
                className="button-primary"
                onClick={() => setPopover(popover === 'export' ? null : 'export')}
                disabled={!canExport}
                aria-haspopup="dialog"
                aria-expanded={popover === 'export'}
                title={canExport ? 'Export (e)' : 'Export unlocks after the selected split finishes.'}
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
          ) : null}
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
                key={track.id}
                track={track}
                onClose={() => setPopover(null)}
                onReveal={() => onReveal({ kind: 'track-outputs', track_id: track.id })}
                onDeleteTrack={() => onDeleteTrack(track.id)}
                onOpenShortcuts={onOpenShortcuts}
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
                <div className="mix-progress-head">
                  <strong>{selectedRun.status === 'queued' ? 'Queued' : `Splitting ${selectedRun.processing.profile_label}`}</strong>
                  {selectedRun.status !== 'queued' ? (
                    <span className="mix-progress-pct">{Math.round(selectedRun.progress * 100)}%</span>
                  ) : null}
                </div>
                <div
                  className="mix-progress-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(selectedRun.progress * 100)}
                >
                  <span
                    className="mix-progress-fill"
                    style={{ width: `${Math.max(0, Math.min(1, selectedRun.progress)) * 100}%` }}
                  />
                </div>
                <RunStepper status={selectedRun.status} lastActiveStatus={selectedRun.last_active_status} />
                <ConfirmInline
                  label="Cancel split"
                  pendingLabel="Cancelling…"
                  confirmLabel="Stop"
                  cancelLabel="Keep running"
                  prompt="Stop this split?"
                  pending={cancellingRunId === selectedRun.id}
                  onConfirm={() => onCancelRun(selectedRun.id)}
                />
              </>
            ) : RETRYABLE_STATUSES.has(selectedRun.status) ? (
              <>
                <strong>{selectedRun.processing.profile_label} split failed</strong>
                <p>{selectedRun.error_message || 'Retry this split, or try a different split type.'}</p>
                <div className="mix-blocked-actions">
                  <button
                    type="button"
                    className="button-primary"
                    disabled={retryingRunId === selectedRun.id}
                    onClick={() => discardRejection(() => onRetryRun(selectedRun.id))}
                  >
                    {retryingRunId === selectedRun.id ? 'Retrying…' : 'Retry split'}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setPopover('versions')}
                  >
                    Try another split type
                  </button>
                </div>
              </>
            ) : (
              <>
                <strong>{selectedRun.processing.profile_label} produced no stems</strong>
                <p>This split completed without separated stem files. Try another split type.</p>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setPopover('versions')}
                >
                  Open split types
                </button>
              </>
            )
          ) : (
            <>
              <strong>Split this song into stems</strong>
              <p>Pick how you want it separated. You can add other split types later.</p>
              <InlineProfilePicker
                profiles={profiles}
                defaultProfileKey={defaultProfileKey}
                creatingRun={creatingRun}
                onCreateRun={(processing) => {
                  discardRejection(async () => {
                    const result = await onCreateRun(track.id, processing)
                    if (result && typeof result === 'object' && 'run' in result) {
                      onSelectRun((result as { run: { id: string } }).run.id)
                    }
                  })
                }}
              />
            </>
          )}
        </div>
      )}
    </section>
  )
}
