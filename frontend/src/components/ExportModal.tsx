import { useEffect, useMemo, useRef, useState } from 'react'

import { createExportBundle, listExportStems, planExportBundle } from '../api'
import type {
  ExportArtifactKind,
  ExportBundleResponse,
  ExportOutputMode,
  ExportPlanResponse,
  ExportPlanTrack,
  ExportRunSelector,
  ExportStemOption,
  RevealFolderInput,
  TrackSummary,
} from '../types'
import { exportStemKind, stemLabel } from '../stems'
import { Spinner } from './feedback/Spinner'

type ExportModalProps = {
  open: boolean
  onClose: () => void
  tracks: TrackSummary[]
  selectedTrackIds: string[]
  onError: (message: string) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
}

type ArtifactOption = {
  value: ExportArtifactKind
  label: string
  description: string
}

const MIX_OPTIONS: ArtifactOption[] = [
  { value: 'mix-mp3', label: 'Mix MP3', description: 'Final mix with your balance applied' },
  { value: 'mix-wav', label: 'Mix WAV', description: 'Lossless final mix with your balance applied' },
]

const EXTRA_OPTIONS: ArtifactOption[] = [
  { value: 'source', label: 'Source audio', description: 'Original imported file' },
  { value: 'metadata', label: 'Metadata JSON', description: 'Run + track metadata' },
]

function stemArtifactOptions(stems: ExportStemOption[], totalTracks: number): ArtifactOption[] {
  return stems.flatMap((stem) => {
    const coverageSuffix =
      totalTracks > 0 && stem.track_count < totalTracks
        ? ` · ${stem.track_count}/${totalTracks} tracks`
        : ''
    return [
      {
        value: exportStemKind(stem.name, 'mp3') as ExportArtifactKind,
        label: `${stem.label} MP3`,
        description: `Separated ${stem.label.toLowerCase()} stem${coverageSuffix}`,
      },
      {
        value: exportStemKind(stem.name, 'wav') as ExportArtifactKind,
        label: `${stem.label} WAV`,
        description: `Lossless ${stem.label.toLowerCase()} stem${coverageSuffix}`,
      },
    ]
  })
}

function artifactLabel(value: ExportArtifactKind, stems: ExportStemOption[]): string {
  const staticMatch = [...MIX_OPTIONS, ...EXTRA_OPTIONS].find((option) => option.value === value)
  if (staticMatch) return staticMatch.label
  const stemMatch = stems.find(
    (stem) =>
      value === exportStemKind(stem.name, 'wav') || value === exportStemKind(stem.name, 'mp3'),
  )
  if (stemMatch) {
    return value.startsWith('stem-wav:') ? `${stemMatch.label} WAV` : `${stemMatch.label} MP3`
  }
  if (value.startsWith('stem-wav:')) return `${stemLabel(value.slice('stem-wav:'.length))} WAV`
  if (value.startsWith('stem-mp3:')) return `${stemLabel(value.slice('stem-mp3:'.length))} MP3`
  return value
}

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
  const anySelectedHasCustomMix = useMemo(
    () =>
      tracks.some((track) => selectedTrackIds.includes(track.id) && track.has_custom_mix),
    [tracks, selectedTrackIds],
  )
  const [stemOptions, setStemOptions] = useState<ExportStemOption[]>([])
  const [stemsLoading, setStemsLoading] = useState(false)
  const [artifacts, setArtifacts] = useState<Set<ExportArtifactKind>>(
    () => new Set(['mix-mp3']),
  )

  useEffect(() => {
    if (!open) return
    if (!selectedTrackIds.length) {
      setStemOptions([])
      return
    }
    let cancelled = false
    setStemsLoading(true)
    listExportStems({ track_ids: selectedTrackIds, run_selector: runSelector })
      .then((response) => {
        if (!cancelled) setStemOptions(response.stems)
      })
      .catch(() => {
        if (!cancelled) setStemOptions([])
      })
      .finally(() => {
        if (!cancelled) setStemsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, selectedTrackIds, runSelector])

  useEffect(() => {
    // When the modal opens against a new selection, reset default artifact
    // choice. Prefer the custom mix MP3 when someone has already shaped a mix;
    // otherwise drop to the first available stem (usually instrumental).
    if (!open) return
    const fallbackStem = stemOptions[0]
    setArtifacts((current) => {
      if (current.size !== 1) return current
      const [only] = Array.from(current)
      if (anySelectedHasCustomMix && only !== 'mix-mp3') {
        return new Set(['mix-mp3'])
      }
      if (!anySelectedHasCustomMix && only === 'mix-mp3' && fallbackStem) {
        return new Set<ExportArtifactKind>([
          exportStemKind(fallbackStem.name, 'mp3') as ExportArtifactKind,
        ])
      }
      return current
    })
  }, [open, anySelectedHasCustomMix, stemOptions])
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
  const keeperHint =
    plan && selectedTracks.length > 0 && runSelector === 'keeper'
      ? skippedCount > 0
        ? includedCount > 0
          ? `${includedCount} of ${selectedTracks.length} selected track${selectedTracks.length === 1 ? '' : 's'} are ready. Review Included below for anything that still needs a final or completed run.`
          : 'No selected tracks are ready from Final run yet. Review Included below for what still needs a final or completed run.'
        : usingFallback > 0
          ? `${usingKeeper} will use the final run, ${usingFallback} will fall back to the latest completed run.`
          : `All ${selectedTracks.length} selected track${selectedTracks.length === 1 ? '' : 's'} will use the final run.`
      : null

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
                {keeperHint ? <p className="inline-hint">{keeperHint}</p> : null}
              </section>

              <section className="export-section">
                <h3>Artifacts to include</h3>
                <ArtifactGroup
                  heading="Mix"
                  options={MIX_OPTIONS}
                  selected={artifacts}
                  onToggle={toggleArtifact}
                />
                <ArtifactGroup
                  heading="Stems"
                  options={stemArtifactOptions(stemOptions, selectedTracks.length)}
                  selected={artifacts}
                  onToggle={toggleArtifact}
                  empty={
                    stemsLoading
                      ? 'Looking up available stems…'
                      : 'No stems on the selected runs yet.'
                  }
                />
                <ArtifactGroup
                  heading="Other"
                  options={EXTRA_OPTIONS}
                  selected={artifacts}
                  onToggle={toggleArtifact}
                />
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
                  <ExportManifest
                    plan={plan}
                    artifactList={artifactList}
                    stemOptions={stemOptions}
                  />
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

type ArtifactGroupProps = {
  heading: string
  options: ArtifactOption[]
  selected: Set<ExportArtifactKind>
  onToggle: (kind: ExportArtifactKind) => void
  empty?: string
}

function ArtifactGroup({ heading, options, selected, onToggle, empty }: ArtifactGroupProps) {
  if (!options.length) {
    if (!empty) return null
    return (
      <div className="export-artifact-group">
        <h4>{heading}</h4>
        <p className="inline-hint">{empty}</p>
      </div>
    )
  }
  return (
    <div className="export-artifact-group">
      <h4>{heading}</h4>
      <div className="export-artifacts">
        {options.map((option) => (
          <label key={option.value} className="export-artifact-row">
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              onChange={() => onToggle(option.value)}
            />
            <div>
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

type ExportManifestProps = {
  plan: ExportPlanResponse
  artifactList: ExportArtifactKind[]
  stemOptions: ExportStemOption[]
}

function ExportManifest({ plan, artifactList, stemOptions }: ExportManifestProps) {
  if (!plan.tracks.length) {
    return <p className="inline-hint">No tracks selected.</p>
  }

  return (
    <ul className="export-manifest">
      {plan.tracks.map((track) => (
        <ManifestRow
          key={track.track_id}
          track={track}
          artifactList={artifactList}
          stemOptions={stemOptions}
        />
      ))}
    </ul>
  )
}

function ManifestRow({
  track,
  artifactList,
  stemOptions,
}: {
  track: ExportPlanTrack
  artifactList: ExportArtifactKind[]
  stemOptions: ExportStemOption[]
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
                <span>{artifactLabel(kind, stemOptions)}</span>
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
