import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import type {
  CachedModel,
  DraftDuplicateAction,
  ProcessingProfile,
  RunProcessingConfigInput,
  StagedImport,
} from '../types'
import { CUSTOM_PROFILE_KEY } from '../types'
import { ModelPicker, isValidModelFilename } from './ModelPicker'
import { Spinner } from './feedback/Spinner'

type ImportFlowDialogProps = {
  open: boolean
  stagedImports: StagedImport[]
  profiles: ProcessingProfile[]
  cachedModels: CachedModel[]
  defaultProfileKey: string
  resolvingYoutubeImport: boolean
  resolvingLocalImport: boolean
  confirming: boolean
  onClose: () => void
  onResolveYouTube: (sourceUrl: string) => Promise<unknown>
  onResolveLocalImport: (files: File[]) => Promise<unknown>
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

type Step = 'add' | 'review'

type OverrideState = {
  enabled: boolean
  processing: RunProcessingConfigInput
}

function looksLikePlaylist(url: string) {
  return /[?&]list=/.test(url.trim())
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function formatSize(bytes: number | null) {
  if (!bytes) return null
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatSourceLabel(item: StagedImport) {
  if (item.source_type === 'youtube') return item.playlist_source_url ? 'YouTube playlist' : 'YouTube'
  return item.original_filename ?? 'Local file'
}

function normalizeProcessing(processing: RunProcessingConfigInput): RunProcessingConfigInput {
  const normalized: RunProcessingConfigInput = {
    profile_key: processing.profile_key,
  }
  if (processing.profile_key === CUSTOM_PROFILE_KEY) {
    normalized.model_filename = (processing.model_filename ?? '').trim()
  }
  return normalized
}

function sameProcessing(a: RunProcessingConfigInput, b: RunProcessingConfigInput) {
  return (
    a.profile_key === b.profile_key &&
    (a.model_filename ?? '').trim() === (b.model_filename ?? '').trim()
  )
}

function processingIsValid(processing: RunProcessingConfigInput) {
  if (processing.profile_key !== CUSTOM_PROFILE_KEY) return true
  return isValidModelFilename(processing.model_filename ?? '')
}

function duplicateStatusLabel(item: StagedImport) {
  if (item.duplicate_tracks.length === 0) return 'New track'
  if (item.duplicate_action === 'create-new') return 'Create separate track'
  if (item.duplicate_action === 'reuse-existing') return 'Reuse existing track'
  if (item.duplicate_action === 'skip') return 'Skip import'
  return `${item.duplicate_tracks.length} duplicate match${item.duplicate_tracks.length === 1 ? '' : 'es'}`
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
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setDraft(value)
  }, [value, dirty])

  function commit() {
    const next = draft.trim()
    if (next === value.trim()) {
      setDirty(false)
      return
    }
    onCommit(next)
    setDirty(false)
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
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
    </label>
  )
}

export function ImportFlowDialog({
  open,
  stagedImports,
  profiles,
  cachedModels,
  defaultProfileKey,
  resolvingYoutubeImport,
  resolvingLocalImport,
  confirming,
  onClose,
  onResolveYouTube,
  onResolveLocalImport,
  onUpdateStagedImport,
  onDiscardStagedImport,
  onConfirmStagedImports,
}: ImportFlowDialogProps) {
  const [step, setStep] = useState<Step>('add')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchProcessing, setBatchProcessing] = useState<RunProcessingConfigInput>({
    profile_key: defaultProfileKey,
    model_filename: '',
  })
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({})
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setBatchProcessing((current) => {
      if (current.profile_key === defaultProfileKey) return current
      return { profile_key: defaultProfileKey, model_filename: '' }
    })
  }, [defaultProfileKey])

  useEffect(() => {
    if (!open) return
    setError(null)
    setStep(stagedImports.length > 0 ? 'review' : 'add')
  }, [open, stagedImports.length])

  useEffect(() => {
    if (!open || step !== 'add') return
    urlInputRef.current?.focus()
  }, [open, step])

  function resetSourceInputs() {
    setYoutubeUrl('')
    setLocalFiles([])
    setDragActive(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    setError(null)
    resetSourceInputs()
    onClose()
  }

  async function resolveUrl() {
    const trimmed = youtubeUrl.trim()
    if (!trimmed) return
    setError(null)
    try {
      await onResolveYouTube(trimmed)
      setYoutubeUrl('')
      setStep('review')
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Could not stage the URL.')
    }
  }

  async function resolveFiles() {
    if (!localFiles.length) return
    setError(null)
    try {
      await onResolveLocalImport(localFiles)
      resetSourceInputs()
      setStep('review')
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Could not stage those files.')
    }
  }

  function setOverrideEnabled(draftId: string, enabled: boolean) {
    setOverrides((current) => {
      const existing = current[draftId]
      if (!enabled) {
        if (!existing) return current
        const next = { ...current }
        delete next[draftId]
        return next
      }
      return {
        ...current,
        [draftId]: existing ?? {
          enabled: true,
          processing: { ...batchProcessing },
        },
      }
    })
  }

  function updateOverrideProcessing(draftId: string, patch: Partial<RunProcessingConfigInput>) {
    setOverrides((current) => {
      const existing = current[draftId] ?? {
        enabled: true,
        processing: { ...batchProcessing },
      }
      return {
        ...current,
        [draftId]: {
          enabled: true,
          processing: {
            ...existing.processing,
            ...patch,
          },
        },
      }
    })
  }

  async function confirm(queue: boolean) {
    if (stagedImports.length === 0) return
    const processing = normalizeProcessing(batchProcessing)
    const processingOverrides = Object.fromEntries(
      Object.entries(overrides)
        .filter(([, value]) => value.enabled)
        .map(([draftId, value]) => [draftId, normalizeProcessing(value.processing)]),
    )

    setError(null)
    try {
      await onConfirmStagedImports({
        draft_ids: stagedImports.map((item) => item.id),
        queue,
        processing: queue ? processing : undefined,
        processing_overrides: queue ? processingOverrides : undefined,
      })
      handleClose()
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Could not confirm staged imports.')
    }
  }

  function handleDropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const accepted = Array.from(event.dataTransfer.files).filter((file) =>
      /^(audio|video)\//.test(file.type),
    )
    if (accepted.length === 0) {
      setError('Drop audio or video files to stage them.')
      return
    }
    setError(null)
    setLocalFiles(accepted)
  }

  if (!open) return null

  const busy = resolvingYoutubeImport || resolvingLocalImport
  const playlistHint =
    youtubeUrl.trim() && looksLikePlaylist(youtubeUrl)
      ? 'Looks like a playlist. Resolving it can take up to 30 seconds.'
      : null
  const unresolvedCount = stagedImports.filter((item) => item.duplicate_action === null).length
  const overrideCount = Object.values(overrides).filter((value) => value.enabled).length
  const invalidOverrideCount = Object.values(overrides).filter(
    (value) => value.enabled && !processingIsValid(value.processing),
  ).length
  const batchProcessingValid = processingIsValid(batchProcessing)
  const canQueue =
    stagedImports.length > 0 &&
    unresolvedCount === 0 &&
    batchProcessingValid &&
    invalidOverrideCount === 0 &&
    !confirming
  const canImportOnly = stagedImports.length > 0 && unresolvedCount === 0 && !confirming

  return (
    <div className="import-modal" role="dialog" aria-modal="true" aria-label="Import sources">
      <button type="button" className="import-modal-backdrop" aria-label="Close" onClick={handleClose} />
      <div className="import-modal-panel import-flow-panel">
        <header className="import-modal-head">
          <div className="import-flow-head-copy">
            <h2>Import Sources</h2>
            <p>Stage sources first, then choose how to render them.</p>
          </div>
          <div className="import-flow-head-actions">
            <button
              type="button"
              className={`button-secondary ${step === 'add' ? 'button-secondary-active' : ''}`}
              onClick={() => setStep('add')}
            >
              Add Sources
            </button>
            <button
              type="button"
              className={`button-secondary ${step === 'review' ? 'button-secondary-active' : ''}`}
              onClick={() => setStep('review')}
              disabled={stagedImports.length === 0}
            >
              Review & Queue{stagedImports.length ? ` (${stagedImports.length})` : ''}
            </button>
            <button type="button" className="button-secondary" onClick={handleClose}>
              Close
            </button>
          </div>
        </header>

        <div className="import-modal-body import-flow-body">
          {error ? (
            <div className="import-error" role="alert">
              {error}
            </div>
          ) : null}

          {step === 'add' ? (
            <div className="import-flow-add">
              <section className="import-flow-section">
                <div className="import-flow-section-head">
                  <h3>Add From YouTube</h3>
                  <p>Paste a video or playlist URL. Nothing queues until you confirm.</p>
                </div>
                <label className="field">
                  <span>YouTube URL</span>
                  <input
                    ref={urlInputRef}
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={youtubeUrl}
                    onChange={(event) => setYoutubeUrl(event.target.value)}
                    disabled={busy}
                  />
                  {playlistHint ? <span className="field-hint">{playlistHint}</span> : null}
                </label>
                <div className="import-flow-section-actions">
                  <button
                    type="button"
                    className="button-primary"
                    disabled={!youtubeUrl.trim() || busy}
                    onClick={() => void resolveUrl()}
                  >
                    {resolvingYoutubeImport ? (
                      <>
                        <Spinner /> Resolving…
                      </>
                    ) : (
                      'Stage URL'
                    )}
                  </button>
                </div>
              </section>

              <section className="import-flow-section">
                <div className="import-flow-section-head">
                  <h3>Add Local Files</h3>
                  <p>Drop audio or video files here, or click to browse.</p>
                </div>
                <div
                  className={`drop-zone ${dragActive ? 'drop-zone-active' : ''}`}
                  onDrop={handleDropFiles}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setDragActive(true)
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setDragActive(false)
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setDragActive(true)
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      fileInputRef.current?.click()
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,video/*"
                    multiple
                    disabled={busy}
                    onChange={(event) => setLocalFiles(Array.from(event.target.files ?? []))}
                    style={{ display: 'none' }}
                  />
                  {localFiles.length > 0 ? (
                    <div className="drop-zone-files">
                      <strong>
                        {localFiles.length} file{localFiles.length === 1 ? '' : 's'} ready
                      </strong>
                      <ul>
                        {localFiles.map((file) => (
                          <li key={`${file.name}-${file.size}`}>
                            {file.name} · {formatSize(file.size)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="drop-zone-empty">
                      <strong>Drop audio or video files here</strong>
                      <span>or click to browse</span>
                    </div>
                  )}
                </div>
                <div className="import-flow-section-actions">
                  <button
                    type="button"
                    className="button-primary"
                    disabled={localFiles.length === 0 || busy}
                    onClick={() => void resolveFiles()}
                  >
                    {resolvingLocalImport ? (
                      <>
                        <Spinner /> Staging…
                      </>
                    ) : (
                      'Stage Files'
                    )}
                  </button>
                </div>
              </section>

              {stagedImports.length > 0 ? (
                <section className="import-flow-section import-flow-section-compact">
                  <div className="import-flow-section-head">
                    <h3>Already Staged</h3>
                    <p>
                      {stagedImports.length} source{stagedImports.length === 1 ? '' : 's'} ready for review.
                    </p>
                  </div>
                  <div className="import-flow-section-actions">
                    <button type="button" className="button-secondary" onClick={() => setStep('review')}>
                      Review & Queue
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="import-flow-review">
              <section className="import-flow-section">
                <div className="import-flow-section-head">
                  <h3>Render Defaults</h3>
                  <p>Choose the model for every staged source unless you override it on a specific row.</p>
                </div>
                <ModelPicker
                  profileKey={batchProcessing.profile_key}
                  modelFilename={batchProcessing.model_filename ?? ''}
                  profiles={profiles}
                  cachedModels={cachedModels}
                  labelId="staged-import-default"
                  onProfileChange={(nextKey) =>
                    setBatchProcessing((current) => ({
                      ...current,
                      profile_key: nextKey,
                      model_filename: nextKey === CUSTOM_PROFILE_KEY ? current.model_filename ?? '' : '',
                    }))
                  }
                  onModelFilenameChange={(next) =>
                    setBatchProcessing((current) => ({
                      ...current,
                      model_filename: next,
                    }))
                  }
                />
                <div className="import-flow-processing-meta">
                  <span>{stagedImports.length} staged</span>
                  <span>{overrideCount} override{overrideCount === 1 ? '' : 's'}</span>
                  <span>{unresolvedCount} unresolved</span>
                </div>
              </section>

              <section className="import-flow-section">
                <div className="import-flow-section-head">
                  <h3>Review Staged Sources</h3>
                  <p>Confirm titles, duplicate handling, and any source-specific render overrides.</p>
                </div>

                {stagedImports.length === 0 ? (
                  <div className="empty-state import-flow-empty">
                    No staged sources yet. Add files or a YouTube URL first.
                  </div>
                ) : (
                  <ul className="staged-import-list">
                    {stagedImports.map((item) => {
                      const override = overrides[item.id]
                      const overrideEnabled = override?.enabled ?? false
                      const overrideProcessing = override?.processing ?? batchProcessing
                      const overrideValid = !overrideEnabled || processingIsValid(overrideProcessing)
                      const matches = item.duplicate_tracks
                      const selectedExistingTrackId = item.existing_track_id ?? matches[0]?.id ?? ''
                      const reuseRequiresChoice =
                        item.duplicate_action === 'reuse-existing' && matches.length > 1

                      return (
                        <li key={item.id} className="staged-import-row">
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
                            <span>{formatSourceLabel(item)}</span>
                            <span>{formatDuration(item.duration_seconds)}</span>
                            {item.original_filename ? <span>{item.original_filename}</span> : null}
                            {formatSize(item.size_bytes) ? <span>{formatSize(item.size_bytes)}</span> : null}
                            <span>{duplicateStatusLabel(item)}</span>
                          </div>

                          <div className="staged-import-duplicate">
                            <strong>Duplicate handling</strong>
                            <div className="staged-import-duplicate-actions">
                              <button
                                type="button"
                                className={`segmented ${item.duplicate_action === 'create-new' ? 'segmented-active' : ''}`}
                                onClick={() =>
                                  void onUpdateStagedImport(item.id, {
                                    duplicate_action: 'create-new',
                                    existing_track_id: null,
                                  })
                                }
                              >
                                Create Separate
                              </button>
                              <button
                                type="button"
                                className={`segmented ${item.duplicate_action === 'reuse-existing' ? 'segmented-active' : ''}`}
                                disabled={matches.length === 0}
                                onClick={() =>
                                  void onUpdateStagedImport(item.id, {
                                    duplicate_action: 'reuse-existing',
                                    existing_track_id: selectedExistingTrackId || null,
                                  })
                                }
                              >
                                Reuse Existing
                              </button>
                              <button
                                type="button"
                                className={`segmented ${item.duplicate_action === 'skip' ? 'segmented-active' : ''}`}
                                disabled={matches.length === 0}
                                onClick={() =>
                                  void onUpdateStagedImport(item.id, {
                                    duplicate_action: 'skip',
                                    existing_track_id: null,
                                  })
                                }
                              >
                                Skip
                              </button>
                            </div>
                          </div>

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

                          <div className="staged-import-override">
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => setOverrideEnabled(item.id, !overrideEnabled)}
                            >
                              {overrideEnabled ? 'Use Batch Defaults' : 'Override Render'}
                            </button>
                            {overrideEnabled ? (
                              <div className="staged-import-override-panel">
                                <ModelPicker
                                  profileKey={overrideProcessing.profile_key}
                                  modelFilename={overrideProcessing.model_filename ?? ''}
                                  profiles={profiles}
                                  cachedModels={cachedModels}
                                  labelId={`staged-import-${item.id}`}
                                  onProfileChange={(nextKey) =>
                                    updateOverrideProcessing(item.id, {
                                      profile_key: nextKey,
                                      model_filename:
                                        nextKey === CUSTOM_PROFILE_KEY
                                          ? overrideProcessing.model_filename ?? ''
                                          : '',
                                    })
                                  }
                                  onModelFilenameChange={(next) =>
                                    updateOverrideProcessing(item.id, { model_filename: next })
                                  }
                                />
                                {!overrideValid ? (
                                  <p className="field-error">
                                    Choose a valid cached model filename for this override.
                                  </p>
                                ) : null}
                                {sameProcessing(
                                  normalizeProcessing(overrideProcessing),
                                  normalizeProcessing(batchProcessing),
                                ) ? (
                                  <p className="field-hint">This override currently matches the batch default.</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <footer className="import-flow-footer">
                <div className="import-flow-footer-copy">
                  {stagedImports.length === 0 ? (
                    <span>Add sources to review them here.</span>
                  ) : unresolvedCount > 0 ? (
                    <span>Resolve every duplicate decision before importing.</span>
                  ) : (
                    <span>Ready to import {stagedImports.length} source{stagedImports.length === 1 ? '' : 's'}.</span>
                  )}
                </div>
                <div className="import-flow-footer-actions">
                  <button type="button" className="button-secondary" onClick={() => setStep('add')}>
                    Add More Sources
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={!canImportOnly}
                    onClick={() => void confirm(false)}
                  >
                    {confirming ? (
                      <>
                        <Spinner /> Importing…
                      </>
                    ) : (
                      'Import Without Rendering'
                    )}
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    disabled={!canQueue}
                    onClick={() => void confirm(true)}
                  >
                    {confirming ? (
                      <>
                        <Spinner /> Queueing…
                      </>
                    ) : (
                      `Queue ${stagedImports.length} Render${stagedImports.length === 1 ? '' : 's'}`
                    )}
                  </button>
                </div>
              </footer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
