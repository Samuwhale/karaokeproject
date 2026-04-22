import { useEffect, useMemo, useRef, useState } from 'react'

import { createExportBundle, planExportBundle } from '../api'
import type {
  ExportArtifactKind,
  ExportBundleResponse,
  ExportOutputMode,
  ExportPlanResponse,
  ExportPlanTrack,
  ExportRunSelector,
  RevealFolderInput,
  TrackSummary,
} from '../types'
import { Spinner } from './feedback/Spinner'

type ExportModalProps = {
  open: boolean
  onClose: () => void
  tracks: TrackSummary[]
  selectedTrackIds: string[]
  onError: (message: string) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
}

const ARTIFACT_OPTIONS: { value: ExportArtifactKind; label: string; description: string }[] = [
  { value: 'instrumental-wav', label: 'Instrumental WAV', description: 'Lossless karaoke backing track' },
  { value: 'instrumental-mp3', label: 'Instrumental MP3', description: 'Compressed karaoke backing track' },
  { value: 'vocals-wav', label: 'Vocals WAV', description: 'Separated lead vocal' },
  { value: 'source', label: 'Source audio', description: 'Original imported file' },
  { value: 'metadata', label: 'Metadata JSON', description: 'Run + track metadata' },
]

const ARTIFACT_LABELS: Record<ExportArtifactKind, string> = Object.fromEntries(
  ARTIFACT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ExportArtifactKind, string>

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${bytes} B`
}

export function ExportModal({
  open,
  onClose,
  tracks,
  selectedTrackIds,
  onError,
  onReveal,
}: ExportModalProps) {
  const [runSelector, setRunSelector] = useState<ExportRunSelector>('keeper')
  const [artifacts, setArtifacts] = useState<Set<ExportArtifactKind>>(
    () => new Set(['instrumental-mp3']),
  )
  const [mode, setMode] = useState<ExportOutputMode>('single-bundle')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportBundleResponse | null>(null)
  const [plan, setPlan] = useState<ExportPlanResponse | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const doneButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) {
      setResult(null)
      setBusy(false)
      setPlan(null)
      setPlanLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (result) doneButtonRef.current?.focus()
  }, [result])

  const selectedTracks = useMemo(
    () => tracks.filter((track) => selectedTrackIds.includes(track.id)),
    [tracks, selectedTrackIds],
  )

  const planKey = useMemo(() => {
    const artifactList = Array.from(artifacts).sort().join(',')
    return `${selectedTrackIds.join(',')}|${runSelector}|${artifactList}|${mode}`
  }, [selectedTrackIds, runSelector, artifacts, mode])

  useEffect(() => {
    if (!open || result) return
    if (!selectedTrackIds.length || !artifacts.size) {
      setPlan(null)
      return
    }
    let cancelled = false
    setPlanLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await planExportBundle({
          track_ids: selectedTrackIds,
          run_selector: runSelector,
          artifacts: Array.from(artifacts),
          mode,
        })
        if (!cancelled) setPlan(response)
      } catch (error) {
        if (!cancelled) {
          setPlan(null)
          onError(error instanceof Error ? error.message : 'Could not plan export.')
        }
      } finally {
        if (!cancelled) setPlanLoading(false)
      }
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // planKey folds in all relevant deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planKey, result])

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

  const artifactList = Array.from(artifacts)
  const totalBytes = plan?.total_bytes ?? 0
  const includedCount = plan?.included_track_count ?? 0
  const skippedCount = plan?.skipped_track_count ?? 0
  const usingFallback = plan?.tracks_using_latest_fallback ?? 0
  const usingKeeper = plan?.tracks_using_keeper ?? 0

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
                {result.included_track_count === 1 ? '' : 's'} included ·{' '}
                {formatBytes(result.byte_count)}
              </p>
              {result.skipped.length ? (
                <details className="export-result-skipped">
                  <summary>
                    {result.skipped.length} skipped
                  </summary>
                  <ul>
                    {result.skipped.map((skip) => (
                      <li key={skip.track_id}>
                        <strong>{skip.track_title}</strong> — {skip.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
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
                  onClick={() => void onReveal({ kind: 'exports' })}
                >
                  Open exports folder
                </button>
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
                {selectedTracks.length > 0 && runSelector === 'keeper' ? (
                  <p className="inline-hint">
                    {usingFallback === 0
                      ? `All ${selectedTracks.length} track${selectedTracks.length === 1 ? '' : 's'} have a final run marked.`
                      : `${usingKeeper} will use the final run, ${usingFallback} will fall back to the latest completed run.`}
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

              <section className="export-section">
                <h3>Included</h3>
                {planLoading && !plan ? (
                  <p className="inline-hint">
                    <Spinner /> Checking which artifacts are available…
                  </p>
                ) : plan ? (
                  <ExportManifest plan={plan} artifactList={artifactList} />
                ) : (
                  <p className="inline-hint">
                    Pick at least one track and one artifact to see what will be included.
                  </p>
                )}
              </section>

              <div className="import-footer">
                <span>
                  {busy
                    ? 'Building bundle…'
                    : plan
                      ? `${includedCount} included · ${skippedCount} skipped · ${formatBytes(totalBytes)}`
                      : `${selectedTrackIds.length} track${selectedTrackIds.length === 1 ? '' : 's'} × ${artifacts.size} artifact${artifacts.size === 1 ? '' : 's'}`}
                </span>
                <button
                  type="button"
                  className="button-primary"
                  disabled={
                    busy || !artifacts.size || !selectedTrackIds.length || includedCount === 0
                  }
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

type ExportManifestProps = {
  plan: ExportPlanResponse
  artifactList: ExportArtifactKind[]
}

function ExportManifest({ plan, artifactList }: ExportManifestProps) {
  if (!plan.tracks.length) {
    return <p className="inline-hint">No tracks selected.</p>
  }

  return (
    <ul className="export-manifest">
      {plan.tracks.map((track) => (
        <ManifestRow key={track.track_id} track={track} artifactList={artifactList} />
      ))}
    </ul>
  )
}

function ManifestRow({
  track,
  artifactList,
}: {
  track: ExportPlanTrack
  artifactList: ExportArtifactKind[]
}) {
  const presentMap = new Map(track.artifacts.map((a) => [a.kind, a]))

  return (
    <li className={`export-manifest-row ${track.skip_reason ? 'export-manifest-row-skipped' : ''}`}>
      <div className="export-manifest-head">
        <strong>{track.track_title}</strong>
        {track.fallback_to_latest ? (
          <span className="export-manifest-fallback">fallback: latest</span>
        ) : null}
      </div>
      {track.skip_reason ? (
        <div className="export-manifest-skip">{track.skip_reason}</div>
      ) : (
        <ul className="export-manifest-artifacts">
          {artifactList.map((kind) => {
            const match = presentMap.get(kind)
            const present = match?.present ?? false
            return (
              <li
                key={kind}
                className={`export-manifest-artifact ${present ? 'is-present' : 'is-missing'}`}
                title={match?.missing_reason ?? undefined}
              >
                <span aria-hidden>{present ? '✓' : '—'}</span>
                <span>{ARTIFACT_LABELS[kind]}</span>
                {present && match?.size_bytes != null ? (
                  <span className="export-manifest-size">{formatBytes(match.size_bytes)}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </li>
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
