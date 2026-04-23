import { useRef, useState } from 'react'

import type {
  DraftDuplicateAction,
  ProcessingProfile,
  RunProcessingConfigInput,
  StagedImport,
} from '../types'
import { Spinner } from './feedback/Spinner'

type StagedImportsPanelProps = {
  stagedImports: StagedImport[]
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  confirming: boolean
  onUpdateStagedImport: (
    draftId: string,
    payload: {
      title?: string
      artist?: string | null
      duplicate_action?: DraftDuplicateAction
      existing_track_id?: string | null
    },
  ) => Promise<void>
  onDiscardStagedImport: (draftId: string) => Promise<void>
  onConfirmStagedImports: (payload: {
    draft_ids: string[]
    queue: boolean
    processing?: RunProcessingConfigInput
    processing_overrides?: Record<string, RunProcessingConfigInput>
  }) => Promise<unknown>
}

type QueueProfileState = {
  sourceKey: string
  value: string
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

function formatSourceLabel(item: StagedImport) {
  if (item.source_type === 'youtube') return item.playlist_source_url ? 'YouTube playlist' : 'YouTube'
  return item.original_filename ?? 'Local file'
}

function reviewStatus(item: StagedImport) {
  if (item.duplicate_tracks.length > 0 && item.duplicate_action === null) {
    return {
      label: 'Needs duplicate decision',
      detail: 'Decide whether this should stay new, merge into an existing song, or be skipped.',
    }
  }

  if (
    item.duplicate_action === 'reuse-existing' &&
    item.duplicate_tracks.length > 1 &&
    !item.existing_track_id
  ) {
    return {
      label: 'Choose the existing song',
      detail: 'Pick which existing song should keep this source before you continue.',
    }
  }

  if (item.duplicate_action === 'skip') {
    return {
      label: 'Will be skipped',
      detail: 'This source stays in the review list until you confirm.',
    }
  }

  if (item.duplicate_action === 'reuse-existing') {
    return {
      label: 'Will attach to an existing song',
      detail: 'Its source is kept, but splits and exports stay attached to the existing song.',
    }
  }

  return {
    label: 'Ready to import',
    detail: 'Metadata looks good and this song can go straight into the library.',
  }
}

function duplicateActionValue(item: StagedImport) {
  return item.duplicate_action ?? ''
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

function countByAction(items: StagedImport[], action: DraftDuplicateAction) {
  return items.filter((item) => item.duplicate_action === action).length
}

function EditableField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const skipCommitRef = useRef(false)
  const currentValue = draft === null || draft === value ? value : draft

  function commit() {
    if (skipCommitRef.current) {
      skipCommitRef.current = false
      setDraft(null)
      return
    }
    const next = currentValue.trim()
    if (next === value.trim()) {
      setDraft(null)
      return
    }
    onCommit(next)
    setDraft(next)
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={currentValue}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            ;(event.target as HTMLInputElement).blur()
          }
          if (event.key === 'Escape') {
            skipCommitRef.current = true
            setDraft(null)
            ;(event.target as HTMLInputElement).blur()
          }
        }}
      />
    </label>
  )
}

export function StagedImportsPanel({
  stagedImports,
  profiles,
  defaultProfileKey,
  confirming,
  onUpdateStagedImport,
  onDiscardStagedImport,
  onConfirmStagedImports,
}: StagedImportsPanelProps) {
  const [startSplitAfterImport, setStartSplitAfterImport] = useState(true)
  const [queueProfileState, setQueueProfileState] = useState<QueueProfileState>({
    sourceKey: defaultProfileKey,
    value: defaultProfileKey,
  })
  const queueProfileKey =
    queueProfileState.sourceKey === defaultProfileKey ? queueProfileState.value : defaultProfileKey
  const effectiveQueueProfileKey =
    profiles.some((profile) => profile.key === queueProfileKey) ? queueProfileKey : defaultProfileKey
  const defaultProfileLabel =
    profiles.find((profile) => profile.key === effectiveQueueProfileKey)?.label ?? 'workspace default'

  const unresolvedCount = stagedImports.filter((item) => needsDuplicateDecision(item)).length
  const orderedStagedImports = [...stagedImports].sort((a, b) => {
    const aNeedsDecision = needsDuplicateDecision(a) ? 1 : 0
    const bNeedsDecision = needsDuplicateDecision(b) ? 1 : 0
    if (aNeedsDecision !== bNeedsDecision) return bNeedsDecision - aNeedsDecision
    return a.title.localeCompare(b.title)
  })
  const canConfirm = stagedImports.length > 0 && unresolvedCount === 0 && !confirming
  const createNewCount = countByAction(stagedImports, 'create-new')
  const reuseCount = countByAction(stagedImports, 'reuse-existing')
  const skipCount = countByAction(stagedImports, 'skip')

  async function confirm(queue: boolean) {
    if (stagedImports.length === 0) return
    await onConfirmStagedImports({
      draft_ids: stagedImports.map((item) => item.id),
      queue,
      processing: queue ? { profile_key: effectiveQueueProfileKey } : undefined,
    })
  }

  return (
    <div className="staged-imports-panel">
      {stagedImports.length > 0 ? (
        <section className="staged-import-summary-strip" aria-label="Import batch summary">
          <div className="staged-import-summary-copy">
            <strong>
              {stagedImports.length} source{stagedImports.length === 1 ? '' : 's'} staged
            </strong>
            <span>
              {unresolvedCount > 0
                ? `${unresolvedCount} still ${unresolvedCount === 1 ? 'needs' : 'need'} a duplicate decision.`
                : 'Everything is ready to continue.'}
            </span>
          </div>
        </section>
      ) : null}

      {stagedImports.length === 0 ? (
        <div className="empty-state import-flow-empty">
          No songs added yet. Bring in files or a YouTube URL first.
        </div>
      ) : (
        <ul className="staged-import-list">
          {orderedStagedImports.map((item) => {
            const matches = item.duplicate_tracks
            const selectedExistingTrackId = item.existing_track_id ?? ''
            const reuseRequiresChoice =
              needsDuplicateDecision(item) && item.duplicate_action === 'reuse-existing'
            const status = reviewStatus(item)
            const itemNeedsDecision = needsDuplicateDecision(item)

            return (
              <li key={item.id} className="staged-import-row">
                <details className="staged-import-card" open={itemNeedsDecision}>
                  <summary className="staged-import-summary">
                    <div className="staged-import-summary-copy">
                      <strong>{item.title}</strong>
                      <span>
                        {item.artist?.trim() || 'Unknown artist'} · {formatSourceLabel(item)}
                      </span>
                    </div>
                    <div className="staged-import-summary-status">
                      <strong>{status.label}</strong>
                      <span>{formatDuration(item.duration_seconds)}</span>
                    </div>
                  </summary>

                  <div className="staged-import-body">
                    <div className="staged-import-header">
                      <div className="staged-import-title-group">
                        <EditableField
                          label="Title"
                          value={item.title}
                          onCommit={(next) =>
                            void onUpdateStagedImport(item.id, {
                              title: next || item.suggested_title,
                            })
                          }
                        />
                        <EditableField
                          label="Artist"
                          value={item.artist ?? ''}
                          placeholder="Optional"
                          onCommit={(next) =>
                            void onUpdateStagedImport(item.id, {
                              artist: next || null,
                            })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => void onDiscardStagedImport(item.id)}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="staged-import-meta">
                      <span>{formatDuration(item.duration_seconds)}</span>
                      {item.original_filename ? <span>{item.original_filename}</span> : null}
                      {formatSize(item.size_bytes) ? <span>{formatSize(item.size_bytes)}</span> : null}
                    </div>

                    {matches.length > 0 ? (
                      <div className="staged-import-duplicate">
                        <label className="field">
                          <span>Duplicate handling</span>
                          <select
                            value={duplicateActionValue(item)}
                            onChange={(event) => {
                              const nextAction = event.target.value as DraftDuplicateAction | ''
                              void onUpdateStagedImport(item.id, {
                                duplicate_action: nextAction || undefined,
                                existing_track_id:
                                  nextAction === 'reuse-existing'
                                    ? matches.length === 1
                                      ? matches[0]?.id ?? null
                                      : item.existing_track_id
                                    : null,
                              })
                            }}
                          >
                            <option value="">Choose what to do</option>
                            <option value="create-new">Keep as a new song</option>
                            <option value="reuse-existing">Attach to an existing song</option>
                            <option value="skip">Skip this source</option>
                          </select>
                        </label>
                        <p className="field-hint">{status.detail}</p>
                      </div>
                    ) : null}

                    {reuseRequiresChoice ? (
                      <label className="field staged-import-reuse-select">
                        <span>Existing track to reuse</span>
                        <select
                          value={selectedExistingTrackId}
                          onChange={(event) =>
                            void onUpdateStagedImport(item.id, {
                              duplicate_action: 'reuse-existing',
                              existing_track_id: event.target.value || null,
                            })
                          }
                        >
                          <option value="">Choose a track</option>
                          {matches.map((match) => (
                            <option key={match.id} value={match.id}>
                              {match.title}
                              {match.artist ? ` · ${match.artist}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}

      <footer className="import-flow-footer staged-imports-footer">
        <div className="import-flow-footer-copy">
          {stagedImports.length === 0 ? (
            <span>Add songs to review them here.</span>
          ) : unresolvedCount > 0 ? (
            <span>Resolve every duplicate decision before continuing.</span>
          ) : (
            <span>
              {startSplitAfterImport
                ? `This batch will enter Songs and start its first split with ${defaultProfileLabel}.`
                : `This batch will enter Songs without starting a split yet. ${createNewCount} new, ${reuseCount} attached, ${skipCount} skipped.`}
            </span>
          )}
        </div>
        <div className="import-flow-footer-actions staged-imports-footer-actions">
          {stagedImports.length > 0 ? (
            <div className="staged-imports-decision-block">
              <label className="staged-imports-toggle">
                <input
                  type="checkbox"
                  checked={startSplitAfterImport}
                  disabled={!canConfirm || confirming}
                  onChange={(event) => setStartSplitAfterImport(event.target.checked)}
                />
                <span>Start the first split after import</span>
              </label>
              {startSplitAfterImport ? (
                <label className="field field-inline import-flow-profile-select">
                  <span>Split with</span>
                  <select
                    value={effectiveQueueProfileKey}
                    onChange={(event) =>
                      setQueueProfileState({
                        sourceKey: defaultProfileKey,
                        value: event.target.value,
                      })
                    }
                    disabled={!canConfirm || confirming}
                  >
                    {profiles.map((profile) => (
                      <option key={profile.key} value={profile.key}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="button-primary"
            disabled={!canConfirm}
            onClick={() => void confirm(startSplitAfterImport)}
          >
            {confirming ? (
              <>
                <Spinner /> {startSplitAfterImport ? 'Queueing…' : 'Importing…'}
              </>
            ) : startSplitAfterImport ? (
              'Import & Start Split'
            ) : (
              'Add to Songs'
            )}
          </button>
        </div>
      </footer>
    </div>
  )
}
