import { useEffect, useState } from 'react'

import type { DraftDuplicateAction, ImportDraft } from '../types'

type Props = {
  drafts: ImportDraft[]
  confirming: boolean
  onUpdateDraft: (
    draftId: string,
    payload: {
      title?: string
      artist?: string | null
      duplicate_action?: DraftDuplicateAction
      existing_track_id?: string | null
    },
  ) => Promise<void>
  onDiscardDraft: (draftId: string) => Promise<void>
  onConfirmDrafts: (draftIds: string[]) => Promise<void>
}

function EditableTitle({
  value,
  onCommit,
}: {
  value: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setDraft(value)
  }, [value, dirty])

  function commit() {
    const cleaned = draft.trim()
    if (cleaned === value.trim()) {
      setDirty(false)
      return
    }
    onCommit(cleaned)
    setDirty(false)
  }

  return (
    <input
      type="text"
      className="review-shelf-title-input"
      value={draft}
      onChange={(event) => {
        setDirty(true)
        setDraft(event.target.value)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          ;(event.target as HTMLInputElement).blur()
        }
        if (event.key === 'Escape') {
          setDraft(value)
          setDirty(false)
          ;(event.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

export function ImportReviewShelf({
  drafts,
  confirming,
  onUpdateDraft,
  onDiscardDraft,
  onConfirmDrafts,
}: Props) {
  const [expanded, setExpanded] = useState(true)

  if (drafts.length === 0) return null

  const readyIds = drafts
    .filter((draft) => draft.duplicate_action !== null)
    .map((draft) => draft.id)
  const pendingCount = drafts.length - readyIds.length

  const subject =
    drafts.length === 1
      ? '1 import matches an existing track'
      : `${drafts.length} imports match existing tracks`

  return (
    <section className="review-shelf" aria-label="Imports awaiting review">
      <header className="review-shelf-head">
        <div className="review-shelf-summary">
          <strong>{subject}</strong>
          <span>
            {pendingCount === 0
              ? 'All decided — ready to confirm.'
              : `${pendingCount} awaiting action.`}
          </span>
        </div>
        <div className="review-shelf-actions">
          <button
            type="button"
            className="button-primary"
            disabled={readyIds.length === 0 || confirming}
            onClick={() => void onConfirmDrafts(readyIds)}
          >
            Confirm & queue {readyIds.length}
          </button>
          <button
            type="button"
            className="button-link"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Collapse' : 'Show'}
          </button>
        </div>
      </header>

      {expanded ? (
        <ul className="review-shelf-list">
          {drafts.map((draft) => {
            const action = draft.duplicate_action
            const firstMatch = draft.duplicate_tracks[0]
            return (
              <li
                key={draft.id}
                className={`review-shelf-row ${action === null ? 'review-shelf-row-pending' : ''}`}
              >
                <div className="review-shelf-row-main">
                  <EditableTitle
                    value={draft.title}
                    onCommit={(next) =>
                      void onUpdateDraft(draft.id, {
                        title: next || draft.suggested_title,
                      })
                    }
                  />
                  <span className="review-shelf-row-meta">
                    Matches{' '}
                    <strong>{firstMatch?.title ?? '—'}</strong>
                    {firstMatch?.artist ? ` · ${firstMatch.artist}` : ''}
                    {draft.duplicate_tracks.length > 1
                      ? ` (+${draft.duplicate_tracks.length - 1} more)`
                      : ''}
                  </span>
                </div>
                <div className="review-shelf-row-actions">
                  <button
                    type="button"
                    className={`segmented ${action === 'create-new' ? 'segmented-active' : ''}`}
                    onClick={() =>
                      void onUpdateDraft(draft.id, {
                        duplicate_action: 'create-new',
                        existing_track_id: null,
                      })
                    }
                  >
                    Create separate
                  </button>
                  <button
                    type="button"
                    className={`segmented ${action === 'reuse-existing' ? 'segmented-active' : ''}`}
                    onClick={() =>
                      void onUpdateDraft(draft.id, {
                        duplicate_action: 'reuse-existing',
                        existing_track_id: firstMatch?.id ?? null,
                      })
                    }
                  >
                    Reuse existing
                  </button>
                  <button
                    type="button"
                    className={`segmented ${action === 'skip' ? 'segmented-active' : ''}`}
                    onClick={() =>
                      void onUpdateDraft(draft.id, {
                        duplicate_action: 'skip',
                        existing_track_id: null,
                      })
                    }
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    className="button-link"
                    onClick={() => void onDiscardDraft(draft.id)}
                    aria-label={`Discard ${draft.title}`}
                  >
                    Discard
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
