import { useEffect, useRef, useState } from 'react'

import { createExportBundle } from '../api'
import type {
  ExportArtifactKind,
  ExportBundleResponse,
  ExportOutputMode,
  ExportRunSelector,
  TrackSummary,
} from '../types'
import { Spinner } from './feedback/Spinner'

type ExportModalProps = {
  open: boolean
  onClose: () => void
  tracks: TrackSummary[]
  selectedTrackIds: string[]
  onError: (message: string) => void
}

const ARTIFACT_OPTIONS: { value: ExportArtifactKind; label: string; description: string }[] = [
  { value: 'instrumental-wav', label: 'Instrumental WAV', description: 'Lossless karaoke backing track' },
  { value: 'instrumental-mp3', label: 'Instrumental MP3', description: 'Compressed karaoke backing track' },
  { value: 'vocals-wav', label: 'Vocals WAV', description: 'Separated lead vocal' },
  { value: 'source', label: 'Source audio', description: 'Original imported file' },
  { value: 'metadata', label: 'Metadata JSON', description: 'Run + track metadata' },
]

export function ExportModal({
  open,
  onClose,
  tracks,
  selectedTrackIds,
  onError,
}: ExportModalProps) {
  const [runSelector, setRunSelector] = useState<ExportRunSelector>('keeper')
  const [artifacts, setArtifacts] = useState<Set<ExportArtifactKind>>(
    () => new Set(['instrumental-mp3']),
  )
  const [mode, setMode] = useState<ExportOutputMode>('single-bundle')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportBundleResponse | null>(null)
  const doneButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) {
      setResult(null)
      setBusy(false)
    }
  }, [open])

  useEffect(() => {
    if (result) doneButtonRef.current?.focus()
  }, [result])

  const selectedTracks = tracks.filter((track) => selectedTrackIds.includes(track.id))
  const withoutKeeper = selectedTracks.filter((track) => !track.keeper_run_id).length
  const withKeeper = selectedTracks.length - withoutKeeper
  const showKeeperSummary = runSelector === 'keeper' && selectedTracks.length > 0

  function toggleArtifact(kind: ExportArtifactKind) {
    setArtifacts((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  async function handleExport() {
    if (!artifacts.size) return
    setBusy(true)
    try {
      const response = await createExportBundle({
        track_ids: selectedTrackIds,
        run_selector: runSelector,
        artifacts: Array.from(artifacts),
        mode,
      })
      setResult(response)
      triggerDownload(response.download_url, response.filename)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="import-modal" role="dialog" aria-modal="true" aria-label="Export tracks">
      <button
        type="button"
        className="import-modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="import-modal-panel">
        <header className="import-modal-head">
          <h2>Export {selectedTrackIds.length} track{selectedTrackIds.length === 1 ? '' : 's'}</h2>
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="import-modal-body">
          {result ? (
            <div className="export-result">
              <strong>Built {result.filename}</strong>
              <p>
                {result.included_track_count} track
                {result.included_track_count === 1 ? '' : 's'} included
                {result.skipped.length
                  ? ` · ${result.skipped.length} skipped (${result.skipped[0].reason}${
                      result.skipped.length > 1 ? ', …' : ''
                    })`
                  : ''}
              </p>
              <div className="export-result-actions">
                <a
                  className="button-secondary"
                  href={result.download_url}
                  download={result.filename}
                >
                  Download again
                </a>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setResult(null)}
                >
                  New export
                </button>
                <button
                  ref={doneButtonRef}
                  type="button"
                  className="button-primary"
                  onClick={onClose}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <section className="export-section">
                <h3>Which run to export</h3>
                <div className="import-source-toggle">
                  <button
                    type="button"
                    className={`segmented ${runSelector === 'keeper' ? 'segmented-active' : ''}`}
                    onClick={() => setRunSelector('keeper')}
                  >
                    Final run
                  </button>
                  <button
                    type="button"
                    className={`segmented ${runSelector === 'latest' ? 'segmented-active' : ''}`}
                    onClick={() => setRunSelector('latest')}
                  >
                    Latest completed
                  </button>
                </div>
                {showKeeperSummary ? (
                  <p className="inline-hint">
                    {withoutKeeper === 0
                      ? `All ${selectedTracks.length} track${selectedTracks.length === 1 ? '' : 's'} have a final run marked.`
                      : `${withKeeper} will use the final run, ${withoutKeeper} will fall back to the latest completed run.`}
                  </p>
                ) : null}
              </section>

              <section className="export-section">
                <h3>Artifacts to include</h3>
                <div className="export-artifacts">
                  {ARTIFACT_OPTIONS.map((option) => (
                    <label key={option.value} className="export-artifact-row">
                      <input
                        type="checkbox"
                        checked={artifacts.has(option.value)}
                        onChange={() => toggleArtifact(option.value)}
                      />
                      <div>
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              <section className="export-section">
                <h3>Packaging</h3>
                <div className="import-source-toggle">
                  <button
                    type="button"
                    className={`segmented ${mode === 'single-bundle' ? 'segmented-active' : ''}`}
                    onClick={() => setMode('single-bundle')}
                  >
                    One bundle
                  </button>
                  <button
                    type="button"
                    className={`segmented ${mode === 'zip-per-track' ? 'segmented-active' : ''}`}
                    onClick={() => setMode('zip-per-track')}
                  >
                    Zip per track
                  </button>
                </div>
              </section>

              <div className="import-footer">
                <span>
                  {busy
                    ? 'Building bundle…'
                    : `${selectedTrackIds.length} track${selectedTrackIds.length === 1 ? '' : 's'} × ${artifacts.size} artifact${artifacts.size === 1 ? '' : 's'}`}
                </span>
                <button
                  type="button"
                  className="button-primary"
                  disabled={busy || !artifacts.size || !selectedTrackIds.length}
                  onClick={() => void handleExport()}
                >
                  {busy ? (
                    <>
                      <Spinner /> Building
                    </>
                  ) : (
                    'Build + download'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
