import { useRef, useState } from 'react'

import { useDialogFocus } from '../../hooks/useDialogFocus'
import { Spinner } from '../feedback/Spinner'
import type {
  DraftDuplicateAction,
  ExistingTrackDuplicate,
  ProcessingProfile,
  RunProcessingConfigInput,
  StagedImport,
  UpdateImportDraftInput,
} from '../../types'

type ImportsOverlayProps = {
  open: boolean
  drafts: StagedImport[]
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  confirming: boolean
  onClose: () => void
  onUpdateDraft: (draftId: string, payload: UpdateImportDraftInput) => Promise<void>
  onDiscardDraft: (draftId: string) => Promise<void>
  onConfirm: (payload: {
    draft_ids: string[]
    queue: boolean
    processing?: RunProcessingConfigInput
  }) => Promise<unknown>
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

function sourceLabel(item: StagedImport) {
  if (item.source_type === 'youtube') return item.playlist_source_url ? 'YouTube playlist' : 'YouTube'
  return item.original_filename ?? 'Local file'
}

function needsDuplicateDecision(item: StagedImport) {
  if (item.duplicate_tracks.length === 0) return false
  if (item.duplicate_action === null) return true
  return (
    item.duplicate_action === 'reuse-existing' &&
    item.duplicate_tracks.length > 1 &&
    !item.existing_track_id
  )
}

function duplicateHint(item: StagedImport) {
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

function countAction(items: StagedImport[], action: DraftDuplicateAction) {
  return items.filter((item) => item.duplicate_action === action).length
}

type ImportRowProps = {
  draft: StagedImport
  profileCount: number
  onUpdate: (payload: UpdateImportDraftInput) => void
  onDiscard: () => void
}

function ImportRow({ draft, onUpdate, onDiscard }: ImportRowProps) {
  const [title, setTitle] = useState(draft.title)
  const [artist, setArtist] = useState(draft.artist ?? '')
  const needsDecision = needsDuplicateDecision(draft)
  const hint = duplicateHint(draft)

  function commitTitle() {
    const next = title.trim()
    if (next === draft.title.trim()) return
    onUpdate({ title: next || draft.suggested_title })
  }

  function commitArtist() {
    const next = artist.trim()
    if ((next || null) === (draft.artist?.trim() || null)) return
    onUpdate({ artist: next || null })
  }

  return (
    <article className={`import-row ${needsDecision ? 'needs-decision' : ''}`}>
      <div className="import-row-head">
        <div className="import-row-title">
          <strong>{draft.title || 'Untitled'}</strong>
          <span>
            {sourceLabel(draft)} · {formatDuration(draft.duration_seconds)}
            {formatSize(draft.size_bytes) ? ` · ${formatSize(draft.size_bytes)}` : ''}
          </span>
        </div>
        <button type="button" className="import-row-remove" onClick={onDiscard}>
          Remove
        </button>
      </div>

      <div className="import-row-fields">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          placeholder="Title"
          aria-label="Title"
        />
        <input
          type="text"
          value={artist}
          onChange={(event) => setArtist(event.target.value)}
          onBlur={commitArtist}
          placeholder="Artist"
          aria-label="Artist"
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
              onUpdate({
                duplicate_action: action ?? undefined,
                existing_track_id: nextExisting,
              })
            }}
          >
            <option value="">Choose an action…</option>
            <option value="create-new">Keep as a new song</option>
            <option value="reuse-existing">Use an existing song</option>
            <option value="skip">Skip</option>
          </select>
          {draft.duplicate_action === 'reuse-existing' && draft.duplicate_tracks.length > 1 ? (
            <select
              value={draft.existing_track_id ?? ''}
              onChange={(event) =>
                onUpdate({
                  duplicate_action: 'reuse-existing',
                  existing_track_id: event.target.value || null,
                })
              }
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
}

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
  const [profileKey, setProfileKey] = useState(activeProfile)

  const unresolved = drafts.filter(needsDuplicateDecision).length
  const createNew = countAction(drafts, 'create-new')
  const reuse = countAction(drafts, 'reuse-existing')
  const skip = countAction(drafts, 'skip')
  const canConfirm = drafts.length > 0 && unresolved === 0 && !confirming

  const ordered = [...drafts].sort((a, b) => {
    const aNeeds = needsDuplicateDecision(a) ? 1 : 0
    const bNeeds = needsDuplicateDecision(b) ? 1 : 0
    if (aNeeds !== bNeeds) return bNeeds - aNeeds
    return a.title.localeCompare(b.title)
  })

  async function confirm(queue: boolean) {
    if (!canConfirm) return
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
                  draft={draft}
                  profileCount={profiles.length}
                  onUpdate={(payload) => void onUpdateDraft(draft.id, payload)}
                  onDiscard={() => void onDiscardDraft(draft.id)}
                />
              ))}
            </>
          )}
        </div>

        {drafts.length > 0 ? (
          <footer className="overlay-foot">
            <div className="overlay-foot-copy">
              {unresolved > 0
                ? `${unresolved} duplicate decision${unresolved === 1 ? '' : 's'} left.`
                : 'Ready to import.'}
            </div>
            <div className="overlay-foot-actions">
              <select
                className="library-sort"
                value={profileKey}
                onChange={(event) => setProfileKey(event.target.value)}
                disabled={!canConfirm || confirming}
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
                onClick={() => void confirm(false)}
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
                onClick={() => void confirm(true)}
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
