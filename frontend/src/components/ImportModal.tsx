import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { Spinner } from './feedback/Spinner'

type ImportModalProps = {
  open: boolean
  onClose: () => void
  resolvingYoutubeImport: boolean
  resolvingLocalImport: boolean
  onResolveYouTube: (sourceUrl: string) => Promise<void>
  onResolveLocalImport: (files: File[]) => Promise<void>
}

type SourceKind = 'youtube' | 'local'

function looksLikePlaylist(url: string) {
  return /[?&]list=/.test(url.trim())
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function ImportModal({
  open,
  onClose,
  resolvingYoutubeImport,
  resolvingLocalImport,
  onResolveYouTube,
  onResolveLocalImport,
}: ImportModalProps) {
  const [source, setSource] = useState<SourceKind>('youtube')
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (source !== 'youtube') return
    urlInputRef.current?.focus()
  }, [open, source])

  function errorMessage(raw: unknown): string {
    if (raw instanceof Error && raw.message) return raw.message
    return 'Import failed. Check the URL or files and try again.'
  }

  async function handleResolveYoutubeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = youtubeUrl.trim()
    if (!trimmed) return
    setError(null)
    try {
      await onResolveYouTube(trimmed)
      setYoutubeUrl('')
      onClose()
    } catch (raw) {
      setError(errorMessage(raw))
    }
  }

  async function handleResolveLocalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!localFiles.length) return
    setError(null)
    try {
      await onResolveLocalImport(localFiles)
      setLocalFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      onClose()
    } catch (raw) {
      setError(errorMessage(raw))
    }
  }

  function handleDropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const all = Array.from(event.dataTransfer.files)
    const accepted = all.filter((file) => /^(audio|video)\//.test(file.type))
    if (accepted.length === 0) {
      setError(
        all.length === 0
          ? 'No files were dropped.'
          : 'None of those files look like audio or video.',
      )
      return
    }
    setError(null)
    setLocalFiles(accepted)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!dragActive) setDragActive(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
  }

  const handleClose = () => {
    setLocalFiles([])
    setDragActive(false)
    setError(null)
    onClose()
  }

  if (!open) return null

  const hasUrl = youtubeUrl.trim().length > 0
  const urlIsPlaylist = hasUrl && looksLikePlaylist(youtubeUrl)
  const fileCount = localFiles.length

  return (
    <div className="import-modal" role="dialog" aria-modal="true" aria-label="Add sources">
      <button
        type="button"
        className="import-modal-backdrop"
        aria-label="Close"
        onClick={handleClose}
      />
      <div className="import-modal-panel">
        <header className="import-modal-head">
          <h2>Add sources</h2>
          <button type="button" className="button-secondary" onClick={handleClose}>
            Close
          </button>
        </header>

        <div className="import-modal-body">
          <div className="import-source-toggle" role="tablist" aria-label="Import source">
            <button
              type="button"
              role="tab"
              aria-selected={source === 'youtube'}
              className={`segmented ${source === 'youtube' ? 'segmented-active' : ''}`}
              onClick={() => {
                setSource('youtube')
                setError(null)
              }}
            >
              YouTube
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === 'local'}
              className={`segmented ${source === 'local' ? 'segmented-active' : ''}`}
              onClick={() => {
                setSource('local')
                setError(null)
              }}
            >
              Files
            </button>
          </div>

          {error ? (
            <div className="import-error" role="alert">
              {error}
            </div>
          ) : null}

          {source === 'youtube' ? (
            <form className="import-form" onSubmit={handleResolveYoutubeSubmit}>
              <label className="field">
                <span>YouTube URL (video or playlist)</span>
                <input
                  ref={urlInputRef}
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  disabled={resolvingYoutubeImport}
                />
                {urlIsPlaylist && !resolvingYoutubeImport ? (
                  <span className="inline-hint">
                    Looks like a playlist — fetching the video list can take up to 30s.
                  </span>
                ) : null}
              </label>

              <div className="import-footer">
                <span>
                  {resolvingYoutubeImport ? (
                    <span className="inline-status">
                      <Spinner />{' '}
                      {urlIsPlaylist
                        ? 'Fetching playlist (up to 30s)…'
                        : 'Resolving video…'}
                    </span>
                  ) : (
                    'Drafts land in Inbox — review titles and queue from there.'
                  )}
                </span>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={resolvingYoutubeImport || !hasUrl}
                >
                  {resolvingYoutubeImport ? (
                    <>
                      <Spinner /> Add
                    </>
                  ) : (
                    'Add to Inbox'
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form className="import-form" onSubmit={handleResolveLocalSubmit}>
              <div
                className={`drop-zone ${dragActive ? 'drop-zone-active' : ''}`}
                onDrop={handleDropFiles}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDragEnter={handleDragOver}
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
                  disabled={resolvingLocalImport}
                  onChange={(event) => setLocalFiles(Array.from(event.target.files ?? []))}
                  style={{ display: 'none' }}
                />
                {fileCount ? (
                  <div className="drop-zone-files">
                    <strong>
                      {fileCount} file{fileCount === 1 ? '' : 's'} ready
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

              <div className="import-footer">
                <span>
                  {resolvingLocalImport ? (
                    <span className="inline-status">
                      <Spinner /> Staging {fileCount} file{fileCount === 1 ? '' : 's'}…
                    </span>
                  ) : fileCount ? (
                    `${fileCount} file${fileCount === 1 ? '' : 's'} ready`
                  ) : (
                    'Drafts land in Inbox — review titles and queue from there.'
                  )}
                </span>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={resolvingLocalImport || !fileCount}
                >
                  {resolvingLocalImport ? (
                    <>
                      <Spinner /> Add
                    </>
                  ) : (
                    'Add to Inbox'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
