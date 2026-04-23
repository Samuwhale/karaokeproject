import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { useDialogFocus } from '../hooks/useDialogFocus'
import type { StagedImport } from '../types'
import { Spinner } from './feedback/Spinner'

type ImportFlowDialogProps = {
  open: boolean
  stagedImports: StagedImport[]
  resolvingYoutubeImport: boolean
  resolvingLocalImport: boolean
  onClose: () => void
  onSourcesStaged: () => void
  onResolveYouTube: (sourceUrl: string) => Promise<unknown>
  onResolveLocalImport: (files: File[]) => Promise<unknown>
}

function looksLikePlaylist(url: string) {
  return /[?&]list=/.test(url.trim())
}

function formatSize(bytes: number | null) {
  if (!bytes) return null
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function ImportFlowDialog({
  open,
  ...props
}: ImportFlowDialogProps) {
  if (!open) return null
  return <ImportFlowDialogContent {...props} open={open} />
}

function ImportFlowDialogContent({
  open,
  stagedImports,
  resolvingYoutubeImport,
  resolvingLocalImport,
  onClose,
  onSourcesStaged,
  onResolveYouTube,
  onResolveLocalImport,
}: ImportFlowDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(open, { containerRef: panelRef, initialFocusRef: closeButtonRef })
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    urlInputRef.current?.focus()
  }, [open])

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
      onSourcesStaged()
      handleClose()
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Could not stage the URL.')
    }
  }

  async function resolveFiles() {
    if (!localFiles.length) return
    setError(null)
    try {
      await onResolveLocalImport(localFiles)
      onSourcesStaged()
      handleClose()
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Could not stage those files.')
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

  return (
    <div className="import-modal" role="dialog" aria-modal="true" aria-label="Add songs">
      <div className="import-modal-backdrop" aria-hidden="true" onClick={handleClose} />
      <div className="import-modal-panel import-flow-panel" ref={panelRef} tabIndex={-1}>
        <header className="import-modal-head">
          <div className="import-flow-head-copy">
            <h2>Add sources</h2>
            <p>Stage new YouTube links or local files here. Review and import them from the inbox.</p>
          </div>
          <div className="import-flow-head-actions">
            <button ref={closeButtonRef} type="button" className="button-secondary" onClick={handleClose}>
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

          <div className="import-flow-add">
            <section className="import-flow-section">
              <div className="import-flow-section-head">
                <h3>From YouTube</h3>
                <p>The source is staged first. You will review titles and duplicates back in the inbox.</p>
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
                    'Stage YouTube Source'
                  )}
                </button>
              </div>
            </section>

            <section className="import-flow-section">
              <div className="import-flow-section-head">
                <h3>Local files</h3>
                <p>Drop audio or video files here, then finish the batch from the inbox.</p>
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
                aria-label="Drop audio or video files here, or press Enter to browse"
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
                  hidden
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
                    'Stage Local Files'
                  )}
                </button>
              </div>
            </section>

            {stagedImports.length > 0 ? (
              <section className="import-flow-section import-flow-section-compact">
                <div className="import-flow-section-head">
                  <h3>{stagedImports.length} staged source{stagedImports.length === 1 ? '' : 's'}</h3>
                  <p>Close this dialog and finish the batch from the inbox.</p>
                </div>
                <div className="import-flow-section-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      onSourcesStaged()
                      handleClose()
                    }}
                  >
                    Go to inbox
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
