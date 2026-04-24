import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

import { discardRejection } from '../../async'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { Spinner } from '../feedback/Spinner'
import type {
  ConfirmImportDraftsInput,
  DraftDuplicateAction,
  ExistingTrackDuplicate,
  ImportDraft,
  ProcessingProfile,
  UpdateImportDraftInput,
} from '../../types'

type ImportsOverlayProps = {
  open: boolean
  drafts: ImportDraft[]
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  confirming: boolean
  onClose: () => void
  onUpdateDraft: (draftId: string, payload: UpdateImportDraftInput) => Promise<void>
  onDiscardDraft: (draftId: string) => Promise<void>
  onConfirm: (payload: ConfirmImportDraftsInput) => Promise<unknown>
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function formatSize(bytes: number | null) {
  if (bytes === null) return null
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function sourceLabel(item: ImportDraft) {
  if (item.source_type === 'youtube') return item.playlist_source_url ? 'YouTube playlist' : 'YouTube'
  return item.original_filename ?? 'Local file'
}

function needsDuplicateDecision(item: ImportDraft) {
  if (item.duplicate_tracks.length === 0) return false
  if (item.duplicate_action === null) return true
  return (
    item.duplicate_action === 'reuse-existing' &&
    item.duplicate_tracks.length > 1 &&
    !item.existing_track_id
  )
}

function duplicateHint(item: ImportDraft) {
  if (item.duplicate_tracks.length === 0) return null
  if (item.duplicate_action === null) return 'Duplicate found — choose an action.'
  if (item.duplicate_action === 'skip') return 'Will be skipped.'
  if (item.duplicate_action === 'create-new') return 'Will be added as a new song.'
  if (item.duplicate_action === 'reuse-existing') {
    if (item.duplicate_tracks.length > 1 && !item.existing_track_id) {
      return 'Pick which existing song to attach to.'
    }
    return 'Will attach to the existing song.'
  }
  return null
}

function countAction(items: ImportDraft[], action: DraftDuplicateAction) {
  return items.filter((item) => item.duplicate_action === action).length
}

type ImportRowProps = {
  draft: ImportDraft
  busy: boolean
  onUpdate: (payload: UpdateImportDraftInput) => Promise<void>
  onDiscard: () => void
}

type ImportRowHandle = {
  flushPendingEdits: () => Promise<void>
}

const ImportRow = forwardRef<ImportRowHandle, ImportRowProps>(function ImportRow(
  { draft, busy, onUpdate, onDiscard }: ImportRowProps,
  ref,
) {
  const [title, setTitle] = useState<string | null>(null)
  const [artist, setArtist] = useState<string | null>(null)
  const flushPromiseRef = useRef<Promise<void> | null>(null)
  const needsDecision = needsDuplicateDecision(draft)
  const hint = duplicateHint(draft)

  function buildPendingPatch(): UpdateImportDraftInput | null {
    const patch: UpdateImportDraftInput = {}

    if (title !== null) {
      const nextTitle = title.trim() || draft.suggested_title
      if (nextTitle !== draft.title.trim()) {
        patch.title = nextTitle
      }
    }

    if (artist !== null) {
      const nextArtist = artist.trim() || null
      if (nextArtist !== (draft.artist?.trim() || null)) {
        patch.artist = nextArtist
      }
    }

    return Object.keys(patch).length > 0 ? patch : null
  }

  async function flushPendingEdits() {
    if (flushPromiseRef.current) {
      await flushPromiseRef.current
      return
    }

    const promise = (async () => {
      const patch = buildPendingPatch()
      if (!patch) {
        setTitle(null)
        setArtist(null)
        return
      }
      await onUpdate(patch)
      setTitle(null)
      setArtist(null)
    })()

    flushPromiseRef.current = promise
    try {
      await promise
    } finally {
      flushPromiseRef.current = null
    }
  }

  useImperativeHandle(ref, () => ({
    flushPendingEdits,
  }))

  return (
    <article className={`import-row ${needsDecision ? 'needs-decision' : ''}`} aria-busy={busy}>
      <div className="import-row-head">
        <div className="import-row-title">
          <strong>{draft.title || 'Untitled'}</strong>
          <span>
            {sourceLabel(draft)} · {formatDuration(draft.duration_seconds)}
            {formatSize(draft.size_bytes) ? ` · ${formatSize(draft.size_bytes)}` : ''}
          </span>
        </div>
        <button type="button" className="import-row-remove" disabled={busy} onClick={onDiscard}>
          Remove
        </button>
      </div>

      <div className="import-row-fields">
        <input
          type="text"
          value={title ?? draft.title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => discardRejection(flushPendingEdits)}
          placeholder="Title"
          aria-label="Title"
          disabled={busy}
        />
        <input
          type="text"
          value={artist ?? (draft.artist ?? '')}
          onChange={(event) => setArtist(event.target.value)}
          onBlur={() => discardRejection(flushPendingEdits)}
          placeholder="Artist"
          aria-label="Artist"
          disabled={busy}
        />
      </div>

      {draft.duplicate_tracks.length > 0 ? (
        <div className="import-row-dup">
          <select
            value={draft.duplicate_action ?? ''}
            onChange={(event) => {
              const action = (event.target.value || null) as DraftDuplicateAction | null
              const nextExisting =
                action === 'reuse-existing' && draft.duplicate_tracks.length === 1
                  ? draft.duplicate_tracks[0]?.id ?? null
                  : action === 'reuse-existing'
                    ? draft.existing_track_id
                    : null
              discardRejection(() => onUpdate({
                duplicate_action: action,
                existing_track_id: nextExisting,
              }))
            }}
            disabled={busy}
          >
            <option value="">Choose an action…</option>
            <option value="create-new">Keep as a new song</option>
            <option value="reuse-existing">Use an existing song</option>
            <option value="skip">Skip</option>
          </select>
          {draft.duplicate_action === 'reuse-existing' && draft.duplicate_tracks.length > 1 ? (
            <select
              value={draft.existing_track_id ?? ''}
              onChange={(event) => {
                discardRejection(() => onUpdate({
                  duplicate_action: 'reuse-existing',
                  existing_track_id: event.target.value || null,
                }))
              }}
              disabled={busy}
            >
              <option value="">Choose a track…</option>
              {draft.duplicate_tracks.map((match: ExistingTrackDuplicate) => (
                <option key={match.id} value={match.id}>
                  {match.title}
                  {match.artist ? ` · ${match.artist}` : ''}
                </option>
              ))}
            </select>
          ) : null}
          {hint ? <span className="import-row-dup-hint">{hint}</span> : null}
        </div>
      ) : null}
    </article>
  )
})

export function ImportsOverlay(props: ImportsOverlayProps) {
  if (!props.open) return null
  return <ImportsOverlayContent {...props} />
}

function ImportsOverlayContent({
  drafts,
  profiles,
  defaultProfileKey,
  confirming,
  onClose,
  onUpdateDraft,
  onDiscardDraft,
  onConfirm,
}: ImportsOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(true, { containerRef: panelRef, initialFocusRef: closeButtonRef })

  const activeProfile = profiles.some((profile) => profile.key === defaultProfileKey)
    ? defaultProfileKey
    : profiles[0]?.key ?? defaultProfileKey
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null)
  const [pendingDraftActions, setPendingDraftActions] = useState<Record<string, number>>({})
  const rowRefs = useRef<Record<string, ImportRowHandle | null>>({})
  const profileKey =
    selectedProfileKey && profiles.some((profile) => profile.key === selectedProfileKey)
      ? selectedProfileKey
      : activeProfile
  const hasPendingDraftActions = Object.keys(pendingDraftActions).length > 0

  const unresolved = drafts.filter(needsDuplicateDecision).length
  const createNew = countAction(drafts, 'create-new')
  const reuse = countAction(drafts, 'reuse-existing')
  const skip = countAction(drafts, 'skip')
  const canConfirm = drafts.length > 0 && unresolved === 0 && !confirming && !hasPendingDraftActions

  const ordered = [...drafts].sort((a, b) => {
    const aNeeds = needsDuplicateDecision(a) ? 1 : 0
    const bNeeds = needsDuplicateDecision(b) ? 1 : 0
    if (aNeeds !== bNeeds) return bNeeds - aNeeds
    return a.title.localeCompare(b.title)
  })

  function setDraftActionPending(draftId: string, active: boolean) {
    setPendingDraftActions((current) => {
      const currentCount = current[draftId] ?? 0
      const nextCount = active ? currentCount + 1 : Math.max(0, currentCount - 1)
      if (nextCount === currentCount) return current
      if (nextCount === 0) {
        const next = { ...current }
        delete next[draftId]
        return next
      }
      return { ...current, [draftId]: nextCount }
    })
  }

  async function runDraftAction(draftId: string, action: () => Promise<void>) {
    setDraftActionPending(draftId, true)
    try {
      await action()
    } finally {
      setDraftActionPending(draftId, false)
    }
  }

  async function flushDraftEdits(draftId: string) {
    await rowRefs.current[draftId]?.flushPendingEdits()
  }

  async function flushAllDraftEdits() {
    for (const draft of drafts) {
      await flushDraftEdits(draft.id)
    }
  }

  async function confirm(queue: boolean) {
    if (!canConfirm) return
    await flushAllDraftEdits()
    await onConfirm({
      draft_ids: drafts.map((item) => item.id),
      queue,
      processing: queue ? { profile_key: profileKey } : undefined,
    })
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Review imports"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="overlay-panel overlay-panel-wide" ref={panelRef} tabIndex={-1}>
        <header className="overlay-head">
          <h2>Review imports</h2>
          <button ref={closeButtonRef} type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="overlay-body">
          {drafts.length === 0 ? (
            <p className="imports-empty">No imports staged.</p>
          ) : (
            <>
              <div className="imports-summary">
                <strong>
                  {drafts.length} source{drafts.length === 1 ? '' : 's'} staged
                </strong>
                <div className="imports-summary-stats">
                  <span>{createNew} new</span>
                  <span>{reuse} attached</span>
                  <span>{skip} skipped</span>
                </div>
              </div>

              {ordered.map((draft) => (
                <ImportRow
                  key={draft.id}
                  ref={(value) => {
                    rowRefs.current[draft.id] = value
                  }}
                  draft={draft}
                  busy={confirming || !!pendingDraftActions[draft.id]}
                  onUpdate={(payload) => runDraftAction(draft.id, () => onUpdateDraft(draft.id, payload))}
                  onDiscard={() =>
                    discardRejection(async () => {
                      await flushDraftEdits(draft.id)
                      await runDraftAction(draft.id, () => onDiscardDraft(draft.id))
                    })
                  }
                />
              ))}
            </>
          )}
        </div>

        {drafts.length > 0 ? (
          <footer className="overlay-foot">
            <div className="overlay-foot-copy">
              {hasPendingDraftActions
                ? 'Saving import changes…'
                : unresolved > 0
                ? `${unresolved} duplicate decision${unresolved === 1 ? '' : 's'} left.`
                : 'Ready to import.'}
            </div>
            <div className="overlay-foot-actions">
              <select
                className="library-sort"
                value={profileKey}
                onChange={(event) => setSelectedProfileKey(event.target.value)}
                disabled={!canConfirm}
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
                className="button-secondary"
                disabled={!canConfirm}
                onClick={() => discardRejection(() => confirm(false))}
              >
                {confirming ? (
                  <>
                    <Spinner /> Importing…
                  </>
                ) : (
                  'Add to library'
                )}
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={!canConfirm}
                onClick={() => discardRejection(() => confirm(true))}
              >
                {confirming ? (
                  <>
                    <Spinner /> Queueing…
                  </>
                ) : (
                  'Add and split'
                )}
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  )
}
