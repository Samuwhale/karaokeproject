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
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    if (source !== 'youtube') return
    urlInputRef.current?.focus()
  }, [open, source])

  async function handleResolveYoutubeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = youtubeUrl.trim()
    if (!trimmed) return
    try {
      await onResolveYouTube(trimmed)
      setYoutubeUrl('')
      onClose()
    } catch {
      /* parent surfaces the error via toast */
    }
  }

  async function handleResolveLocalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!localFiles.length) return
    try {
      await onResolveLocalImport(localFiles)
      setLocalFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      onClose()
    } catch {
      /* parent surfaces the error via toast */
    }
  }

  function handleDropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const dropped = Array.from(event.dataTransfer.files).filter((file) =>
      /^(audio|video)\//.test(file.type),
    )
    if (dropped.length === 0) return
    setLocalFiles(dropped)
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
              onClick={() => setSource('youtube')}
            >
              YouTube
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === 'local'}
              className={`segmented ${source === 'local' ? 'segmented-active' : ''}`}
              onClick={() => setSource('local')}
            >
              Files
            </button>
          </div>

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
