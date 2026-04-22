import { useEffect, useState } from 'react'

import type { DraftDuplicateAction, ImportDraft } from '../types'

type InboxListProps = {
  drafts: ImportDraft[]
  selectedIds: Set<string>
  onToggleSelect: (draftId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  onUpdateDraft: (draftId: string, payload: { title?: string; artist?: string | null; duplicate_action?: DraftDuplicateAction; existing_track_id?: string | null }) => Promise<void>
  onDiscardDraft: (draftId: string) => Promise<void>
  onOpenImport: () => void
}

function formatSize(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

type DuplicatePickerProps = {
  draft: ImportDraft
  onChange: (patch: { duplicate_action?: DraftDuplicateAction; existing_track_id?: string | null }) => void
}

function DuplicatePicker({ draft, onChange }: DuplicatePickerProps) {
  if (!draft.duplicate_tracks.length) return null
  const action = draft.duplicate_action
  const matchCount = draft.duplicate_tracks.length
  const prompt =
    action === null
      ? `${matchCount} match${matchCount === 1 ? '' : 'es'} in library — pick one:`
      : 'Matches in library:'
  return (
    <div className={`inbox-duplicate ${action === null ? 'inbox-duplicate-pending' : ''}`}>
      <div className="inbox-duplicate-match">
        <strong>{prompt}</strong>{' '}
        {draft.duplicate_tracks.map((candidate, index) => (
          <span key={candidate.id}>
            {index > 0 ? ', ' : null}
            {candidate.title}
            {candidate.artist ? ` · ${candidate.artist}` : ''}
          </span>
        ))}
      </div>
      <div className="inbox-duplicate-actions">
        <button
          type="button"
          className={`segmented ${action === 'reuse-existing' ? 'segmented-active' : ''}`}
          onClick={() =>
            onChange({
              duplicate_action: 'reuse-existing',
              existing_track_id: draft.existing_track_id ?? draft.duplicate_tracks[0]?.id ?? null,
            })
          }
        >
          Reuse existing
        </button>
        <button
          type="button"
          className={`segmented ${action === 'create-new' ? 'segmented-active' : ''}`}
          onClick={() => onChange({ duplicate_action: 'create-new', existing_track_id: null })}
        >
          Create separate
        </button>
        <button
          type="button"
          className={`segmented ${action === 'skip' ? 'segmented-active' : ''}`}
          onClick={() => onChange({ duplicate_action: 'skip', existing_track_id: null })}
        >
          Skip
        </button>
        {action === 'reuse-existing' && draft.duplicate_tracks.length > 1 ? (
          <select
            aria-label="Existing track"
            value={draft.existing_track_id ?? ''}
            onChange={(event) => onChange({ existing_track_id: event.target.value || null })}
          >
            {draft.duplicate_tracks.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
                {candidate.artist ? ` · ${candidate.artist}` : ''}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  )
}

type EditableFieldProps = {
  value: string
  placeholder?: string
  onCommit: (next: string) => void
}

function EditableField({ value, placeholder, onCommit }: EditableFieldProps) {
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
      className="inbox-inline-input"
      placeholder={placeholder}
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

export function InboxList({
  drafts,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onUpdateDraft,
  onDiscardDraft,
  onOpenImport,
}: InboxListProps) {
  const needsAttention = drafts.filter((draft) => draft.duplicate_action === null).length
  const allSelected = drafts.length > 0 && drafts.every((draft) => selectedIds.has(draft.id))

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(drafts.map((draft) => draft.id))
  }

  if (drafts.length === 0) {
    return (
      <div className="track-list-wrap">
        <div className="section-head">
          <h2>Inbox</h2>
          <button type="button" className="button-primary" onClick={onOpenImport}>
            Add sources
          </button>
        </div>
        <p className="empty-state">
          Inbox is empty. Add a YouTube URL or local files; review and queue them here before
          processing.
        </p>
      </div>
    )
  }

  return (
    <div className="track-list-wrap">
      <div className="section-head">
        <h2>Inbox</h2>
        <button type="button" className="button-primary" onClick={onOpenImport}>
          Add sources
        </button>
      </div>

      {needsAttention > 0 ? (
        <div className="inbox-banner">
          {needsAttention} draft{needsAttention === 1 ? ' has' : 's have'} library matches — choose
          an action on each before confirming.
        </div>
      ) : null}

      <div className="inbox-controls">
        <label className="checkbox-row">
          <input type="checkbox" checked={allSelected} onChange={handleToggleAll} />
          <span>{allSelected ? 'Clear all' : 'Select all'}</span>
        </label>
        <span className="library-count">{drafts.length} drafts</span>
      </div>

      <div className="inbox-list">
        {drafts.map((draft) => {
          const selected = selectedIds.has(draft.id)
          return (
            <article
              key={draft.id}
              className={`inbox-row ${selected ? 'inbox-row-selected' : ''}`}
            >
              <label className="inbox-row-check">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(draft.id)}
                />
              </label>
              <div className="inbox-row-main">
                <div className="inbox-row-fields">
                  <EditableField
                    value={draft.title}
                    placeholder="Title"
                    onCommit={(next) =>
                      void onUpdateDraft(draft.id, { title: next || draft.suggested_title })
                    }
                  />
                  <EditableField
                    value={draft.artist ?? ''}
                    placeholder="Artist (optional)"
                    onCommit={(next) => void onUpdateDraft(draft.id, { artist: next || null })}
                  />
                </div>
                <div className="inbox-row-meta">
                  <span className="inbox-row-source">
                    {draft.source_type === 'youtube'
                      ? 'YouTube'
                      : `${draft.original_filename ?? 'file'} · ${formatSize(draft.size_bytes)}`}
                  </span>
                </div>
                <DuplicatePicker
                  draft={draft}
                  onChange={(patch) => void onUpdateDraft(draft.id, patch)}
                />
              </div>
              <button
                type="button"
                className="button-link"
                onClick={() => void onDiscardDraft(draft.id)}
                aria-label={`Discard ${draft.title}`}
              >
                Discard
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
