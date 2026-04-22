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
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    urlInputRef.current?.focus()
  }, [open])

  function errorMessage(raw: unknown): string {
    if (raw instanceof Error && raw.message) return raw.message
    return 'Import failed. Check the URL or files and try again.'
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      if (localFiles.length) {
        await onResolveLocalImport(localFiles)
        setLocalFiles([])
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      const trimmed = youtubeUrl.trim()
      if (trimmed) {
        await onResolveYouTube(trimmed)
        setYoutubeUrl('')
      }
      if (localFiles.length || trimmed) onClose()
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

  function handleClose() {
    setLocalFiles([])
    setYoutubeUrl('')
    setDragActive(false)
    setError(null)
    onClose()
  }

  if (!open) return null

  const trimmedUrl = youtubeUrl.trim()
  const hasUrl = trimmedUrl.length > 0
  const urlIsPlaylist = hasUrl && looksLikePlaylist(trimmedUrl)
  const fileCount = localFiles.length
  const busy = resolvingYoutubeImport || resolvingLocalImport
  const canSubmit = (hasUrl || fileCount > 0) && !busy

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

        <form className="import-modal-body import-form" onSubmit={handleSubmit}>
          {error ? (
            <div className="import-error" role="alert">
              {error}
            </div>
          ) : null}

          <label className="field">
            <span>YouTube URL (video or playlist)</span>
            <input
              ref={urlInputRef}
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              disabled={busy}
            />
            {urlIsPlaylist && !busy ? (
              <span className="inline-hint">
                Looks like a playlist — fetching the video list can take up to 30s.
              </span>
            ) : null}
          </label>

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
              disabled={busy}
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
              {busy ? (
                <span className="inline-status">
                  <Spinner />{' '}
                  {resolvingYoutubeImport && urlIsPlaylist
                    ? 'Fetching playlist (up to 30s)…'
                    : resolvingYoutubeImport
                      ? 'Resolving video…'
                      : `Staging ${fileCount} file${fileCount === 1 ? '' : 's'}…`}
                </span>
              ) : (
                'Auto-queued with your default settings unless duplicates need review.'
              )}
            </span>
            <button type="submit" className="button-primary" disabled={!canSubmit}>
              {busy ? (
                <>
                  <Spinner /> Add
                </>
              ) : (
                'Add'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
