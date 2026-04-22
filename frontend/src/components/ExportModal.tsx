import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { useDialogFocus } from '../hooks/useDialogFocus'
import { createExportBundle, listExportStems, planExportBundle } from '../api'
import type {
  ExportArtifactKind,
  ExportBundleResponse,
  ExportOutputMode,
  ExportPlanResponse,
  ExportPlanTrack,
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
  defaultBitrate: string
  // Per-track run override map. Absent keys fall back to the latest completed run.
  selectedRunIdByTrack?: Record<string, string>
  onError: (message: string) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
}

type MixdownFormat = 'mp3' | 'wav'
type StemFormat = 'mp3' | 'wav'

const BITRATE_PATTERN = /^\d{2,3}k$/
const BITRATE_HINT = 'Use a value like 192k or 320k.'

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
  defaultBitrate,
  selectedRunIdByTrack,
  onError,
  onReveal,
}: ExportModalProps) {
  useDialogFocus(open)
  const [stemOptions, setStemOptions] = useState<ExportStemOption[]>([])
  const [stemsLoading, setStemsLoading] = useState(false)

  const [includeMixdown, setIncludeMixdown] = useState(true)
  const [mixdownFormat, setMixdownFormat] = useState<MixdownFormat>('mp3')
  const [stemFormat, setStemFormat] = useState<StemFormat>('wav')
  const [selectedStems, setSelectedStems] = useState<Set<string>>(() => new Set())
  const [includeSource, setIncludeSource] = useState(false)

  const selectedTrackIdsKey = selectedTrackIds.join('|')
  const runIds = useMemo(() => selectedRunIdByTrack ?? {}, [selectedRunIdByTrack])
  const runIdsKey = useMemo(
    () =>
      Object.entries(runIds)
        .sort()
        .map(([tid, rid]) => `${tid}=${rid}`)
        .join('|'),
    [runIds],
  )

  useEffect(() => {
    if (!open) return
    if (!selectedTrackIds.length) {
      setStemOptions([])
      return
    }
    let cancelled = false
    setStemsLoading(true)
    listExportStems({ track_ids: selectedTrackIds, run_ids: runIds })
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
  }, [open, selectedTrackIds, runIds])

  useEffect(() => {
    if (!open) return
    setIncludeMixdown(true)
    setMixdownFormat('mp3')
    setStemFormat('wav')
    setSelectedStems(new Set())
    setIncludeSource(false)
  }, [open, selectedTrackIdsKey])

  const [mode, setMode] = useState<ExportOutputMode>('single-bundle')
  const [bitrate, setBitrate] = useState(defaultBitrate)
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
      return
    }
    setBitrate(defaultBitrate)
  }, [open, defaultBitrate])

  useEffect(() => {
    if (result) doneButtonRef.current?.focus()
  }, [result])

  const selectedTracks = useMemo(
    () => tracks.filter((track) => selectedTrackIds.includes(track.id)),
    [tracks, selectedTrackIds],
  )

  const singleTrack = selectedTracks.length === 1 ? selectedTracks[0] : null

  const artifactList = useMemo<ExportArtifactKind[]>(() => {
    const kinds: ExportArtifactKind[] = []
    if (includeMixdown) kinds.push(mixdownFormat === 'wav' ? 'mix-wav' : 'mix-mp3')
    for (const stemName of selectedStems) {
      kinds.push(exportStemKind(stemName, stemFormat) as ExportArtifactKind)
    }
    if (includeSource) kinds.push('source')
    return kinds
  }, [includeMixdown, mixdownFormat, selectedStems, stemFormat, includeSource])

  const bitrateValid = BITRATE_PATTERN.test(bitrate)
  const mp3Requested =
    (includeMixdown && mixdownFormat === 'mp3') ||
    (selectedStems.size > 0 && stemFormat === 'mp3')

  const planKey = useMemo(() => {
    return `${selectedTrackIds.join(',')}|${runIdsKey}|${artifactList.slice().sort().join(',')}|${mode}|${bitrate}`
  }, [selectedTrackIds, runIdsKey, artifactList, mode, bitrate])

  useEffect(() => {
    if (!open || result) return
    if (!selectedTrackIds.length || !artifactList.length) {
      setPlan(null)
      return
    }
    if (mp3Requested && !bitrateValid) {
      setPlan(null)
      return
    }
    let cancelled = false
    setPlanLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await planExportBundle({
          track_ids: selectedTrackIds,
          run_ids: runIds,
          artifacts: artifactList,
          mode,
          bitrate,
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

  function toggleStem(name: string) {
    setSelectedStems((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function handleExport() {
    if (!artifactList.length) return
    if (mp3Requested && !bitrateValid) return
    setBusy(true)
    try {
      const response = await createExportBundle({
        track_ids: selectedTrackIds,
        run_ids: runIds,
        artifacts: artifactList,
        mode,
        bitrate,
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

  const totalBytes = plan?.total_bytes ?? 0
  const includedCount = plan?.included_track_count ?? 0
  const skippedCount = plan?.skipped_track_count ?? 0
  const showPackaging = selectedTrackIds.length > 1
  const mixdownSummary = resolveMixdownSummary(singleTrack, selectedTracks)

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
          <h2>Export files for {selectedTrackIds.length} track{selectedTrackIds.length === 1 ? '' : 's'}</h2>
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
                  onClick={() => void onReveal({ kind: 'bundle', job_id: result.job_id })}
                >
                  Reveal in Finder
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
                <h3>Mixdown</h3>
                <label className="export-artifact-row">
                  <input
                    type="checkbox"
                    checked={includeMixdown}
                    onChange={(event) => setIncludeMixdown(event.target.checked)}
                  />
                  <div>
                    <strong>Include the mixdown</strong>
                    <span>Rendered audio with your stem balance applied.</span>
                  </div>
                </label>
                {includeMixdown ? (
                  <>
                    <div className="import-source-toggle export-format-toggle">
                      <button
                        type="button"
                        className={`segmented ${mixdownFormat === 'mp3' ? 'segmented-active' : ''}`}
                        onClick={() => setMixdownFormat('mp3')}
                      >
                        MP3
                      </button>
                      <button
                        type="button"
                        className={`segmented ${mixdownFormat === 'wav' ? 'segmented-active' : ''}`}
                        onClick={() => setMixdownFormat('wav')}
                      >
                        WAV
                      </button>
                    </div>
                    {mixdownSummary ? (
                      <p className="export-mixdown-summary">{mixdownSummary}</p>
                    ) : null}
                  </>
                ) : null}
              </section>

              <section className="export-section">
                <h3>Stems</h3>
                {stemsLoading && !stemOptions.length ? (
                  <p className="inline-hint">Looking up available stems…</p>
                ) : stemOptions.length ? (
                  <>
                    <StemChips
                      options={stemOptions}
                      totalTracks={selectedTracks.length}
                      selected={selectedStems}
                      onToggle={toggleStem}
                    />
                    {selectedStems.size > 0 ? (
                      <div className="import-source-toggle export-format-toggle">
                        <button
                          type="button"
                          className={`segmented ${stemFormat === 'mp3' ? 'segmented-active' : ''}`}
                          onClick={() => setStemFormat('mp3')}
                        >
                          MP3
                        </button>
                        <button
                          type="button"
                          className={`segmented ${stemFormat === 'wav' ? 'segmented-active' : ''}`}
                          onClick={() => setStemFormat('wav')}
                        >
                          WAV
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="inline-hint">No separated stems available for this selection.</p>
                )}
              </section>

              {mp3Requested ? (
                <label className="field export-bitrate-field">
                  <span>MP3 bitrate</span>
                  <input
                    type="text"
                    value={bitrate}
                    aria-invalid={!bitrateValid}
                    onChange={(event) => setBitrate(event.target.value)}
                  />
                  {!bitrateValid ? (
                    <span className="field-error">{BITRATE_HINT}</span>
                  ) : null}
                </label>
              ) : null}

              <section className="export-section export-section-extras">
                <label className="export-artifact-row">
                  <input
                    type="checkbox"
                    checked={includeSource}
                    onChange={(event) => setIncludeSource(event.target.checked)}
                  />
                  <div>
                    <strong>Include the source file</strong>
                    <span>Original imported audio, bundled alongside each track.</span>
                  </div>
                </label>
              </section>

              {showPackaging ? (
                <section className="export-section">
                  <h3>Packaging</h3>
                  <div className="import-source-toggle">
                    <button
                      type="button"
                      className={`segmented ${mode === 'single-bundle' ? 'segmented-active' : ''}`}
                      onClick={() => setMode('single-bundle')}
                    >
                      All tracks in one zip
                    </button>
                    <button
                      type="button"
                      className={`segmented ${mode === 'zip-per-track' ? 'segmented-active' : ''}`}
                      onClick={() => setMode('zip-per-track')}
                    >
                      One zip per track
                    </button>
                  </div>
                </section>
              ) : null}

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
                      : `${selectedTrackIds.length} track${selectedTrackIds.length === 1 ? '' : 's'} × ${artifactList.length} artifact${artifactList.length === 1 ? '' : 's'}`}
                </span>
                <button
                  type="button"
                  className="button-primary"
                  disabled={
                    busy ||
                    !artifactList.length ||
                    !selectedTrackIds.length ||
                    includedCount === 0 ||
                    (mp3Requested && !bitrateValid)
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

function resolveMixdownSummary(
  singleTrack: TrackSummary | null,
  allSelected: TrackSummary[],
): string | null {
  if (singleTrack) {
    return singleTrack.has_custom_mix
      ? 'Using your custom stem balance.'
      : 'Stems play at unity — no balance changes saved on this render.'
  }
  const custom = allSelected.filter((track) => track.has_custom_mix).length
  if (!allSelected.length) return null
  if (custom === 0) return 'None of the selected tracks have a custom balance — mixdowns play at unity.'
  if (custom === allSelected.length) return 'Every selected track uses its saved custom balance.'
  return `${custom} of ${allSelected.length} selected tracks have a custom balance; the rest play at unity.`
}

type StemChipsProps = {
  options: ExportStemOption[]
  totalTracks: number
  selected: Set<string>
  onToggle: (name: string) => void
}

function StemChips({ options, totalTracks, selected, onToggle }: StemChipsProps) {
  return (
    <div className="export-stem-chips">
      {options.map((option) => {
        const isSelected = selected.has(option.name)
        const partial = totalTracks > 0 && option.track_count < totalTracks
        return (
          <button
            key={option.name}
            type="button"
            className={`export-stem-chip ${isSelected ? 'active' : ''}`}
            aria-pressed={isSelected}
            onClick={() => onToggle(option.name)}
            title={partial ? `Only on ${option.track_count} of ${totalTracks} tracks` : undefined}
          >
            <span>{option.label}</span>
            {partial ? (
              <span className="export-stem-chip-coverage">{option.track_count}/{totalTracks}</span>
            ) : null}
          </button>
        )
      })}
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

type ManifestRowProps = {
  track: ExportPlanTrack
  artifactList: ExportArtifactKind[]
  stemOptions: ExportStemOption[]
}

const ManifestRow = memo(function ManifestRow({ track, artifactList, stemOptions }: ManifestRowProps) {
  const presentMap = useMemo(
    () => new Map(track.artifacts.map((a) => [a.kind, a])),
    [track.artifacts],
  )

  return (
    <li className={`export-manifest-row ${track.skip_reason ? 'export-manifest-row-skipped' : ''}`}>
      <div className="export-manifest-head">
        <strong>{track.track_title}</strong>
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
})

function artifactLabel(value: ExportArtifactKind, stems: ExportStemOption[]): string {
  if (value === 'mix-mp3') return 'Mixdown MP3'
  if (value === 'mix-wav') return 'Mixdown WAV'
  if (value === 'source') return 'Source audio'
  if (value === 'metadata') return 'Metadata JSON'
  if (value.startsWith('stem-mp3:')) {
    const name = value.slice('stem-mp3:'.length)
    const stem = stems.find((item) => item.name === name)
    return `${stem?.label ?? stemLabel(name)} MP3`
  }
  if (value.startsWith('stem-wav:')) {
    const name = value.slice('stem-wav:'.length)
    const stem = stems.find((item) => item.name === name)
    return `${stem?.label ?? stemLabel(name)} WAV`
  }
  return value
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
