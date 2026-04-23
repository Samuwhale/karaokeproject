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
  initialPreset?: ExportPreset
  lockPreset?: boolean
  contextTitle?: string
  contextDescription?: string
  onError: (message: string) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
}

type MixdownFormat = 'mp3' | 'wav'
type StemFormat = 'mp3' | 'wav'
export type ExportPreset = 'final-mix' | 'stems-for-editing' | 'full-package'

const BITRATE_PATTERN = /^\d{2,3}k$/
const BITRATE_HINT = 'Use a value like 192k or 320k.'

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${bytes} B`
}

function artifactListForPreset(
  preset: ExportPreset,
  stemOptions: ExportStemOption[],
  mixdownFormat: MixdownFormat,
  stemFormat: StemFormat,
) {
  const kinds: ExportArtifactKind[] = []
  if (preset === 'final-mix' || preset === 'full-package') {
    kinds.push(mixdownFormat === 'wav' ? 'mix-wav' : 'mix-mp3')
  }
  if (preset === 'stems-for-editing' || preset === 'full-package') {
    for (const option of stemOptions) {
      kinds.push(exportStemKind(option.name, stemFormat) as ExportArtifactKind)
    }
  }
  if (preset === 'full-package') {
    kinds.push('source')
  }
  return kinds
}

export function ExportModal({
  open,
  onClose,
  tracks,
  selectedTrackIds,
  defaultBitrate,
  selectedRunIdByTrack,
  initialPreset,
  lockPreset,
  contextTitle,
  contextDescription,
  onError,
  onReveal,
}: ExportModalProps) {
  if (!open) return null

  const runIds = selectedRunIdByTrack ?? {}
  const sessionKey = [
    defaultBitrate,
    selectedTrackIds.join('|'),
    initialPreset ?? 'preset',
    lockPreset ? 'locked' : 'editable',
    contextTitle ?? '',
    contextDescription ?? '',
    Object.entries(runIds)
      .sort()
      .map(([trackId, runId]) => `${trackId}=${runId}`)
      .join('|'),
  ].join('::')

  return (
    <ExportModalContent
      key={sessionKey}
      onClose={onClose}
      tracks={tracks}
      selectedTrackIds={selectedTrackIds}
      defaultBitrate={defaultBitrate}
      runIds={runIds}
      initialPreset={initialPreset}
      lockPreset={lockPreset ?? false}
      contextTitle={contextTitle}
      contextDescription={contextDescription}
      onError={onError}
      onReveal={onReveal}
    />
  )
}

type ExportModalContentProps = Omit<ExportModalProps, 'open' | 'selectedRunIdByTrack'> & {
  runIds: Record<string, string>
}

function ExportModalContent({
  onClose,
  tracks,
  selectedTrackIds,
  defaultBitrate,
  runIds,
  initialPreset,
  lockPreset,
  contextTitle,
  contextDescription,
  onError,
  onReveal,
}: ExportModalContentProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(true, { containerRef: panelRef, initialFocusRef: closeButtonRef })
  const [loadedStemOptions, setLoadedStemOptions] = useState<{
    key: string
    stems: ExportStemOption[]
  } | null>(null)

  const [preset, setPreset] = useState<ExportPreset>(initialPreset ?? 'final-mix')
  const [mixdownFormat, setMixdownFormat] = useState<MixdownFormat>('mp3')
  const [stemFormat, setStemFormat] = useState<StemFormat>('wav')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const selectedTrackIdsKey = useMemo(() => selectedTrackIds.join(','), [selectedTrackIds])

  const runIdsKey = useMemo(
    () =>
      Object.entries(runIds)
        .sort()
        .map(([tid, rid]) => `${tid}=${rid}`)
        .join('|'),
    [runIds],
  )
  const stemOptionsKey = `${selectedTrackIdsKey}|${runIdsKey}`
  const stemOptions = useMemo(
    () => (loadedStemOptions?.key === stemOptionsKey ? loadedStemOptions.stems : []),
    [loadedStemOptions, stemOptionsKey],
  )
  const stemsLoading = selectedTrackIds.length > 0 && loadedStemOptions?.key !== stemOptionsKey

  useEffect(() => {
    if (!selectedTrackIds.length) return
    let cancelled = false
    listExportStems({ track_ids: selectedTrackIds, run_ids: runIds })
      .then((response) => {
        if (!cancelled) {
          setLoadedStemOptions({ key: stemOptionsKey, stems: response.stems })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedStemOptions({ key: stemOptionsKey, stems: [] })
        }
      })
    return () => {
      cancelled = true
    }
  }, [runIds, selectedTrackIds, stemOptionsKey])

  const [mode, setMode] = useState<ExportOutputMode>('single-bundle')
  const [bitrate, setBitrate] = useState(defaultBitrate)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportBundleResponse | null>(null)
  const [plannedResponse, setPlannedResponse] = useState<{
    key: string
    plan: ExportPlanResponse | null
  } | null>(null)
  const doneButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (result) doneButtonRef.current?.focus()
  }, [result])

  const selectedTracks = useMemo(
    () => {
      const selectedIds = new Set(selectedTrackIds)
      return tracks.filter((track) => selectedIds.has(track.id))
    },
    [tracks, selectedTrackIds],
  )

  const singleTrack = selectedTracks.length === 1 ? selectedTracks[0] : null

  const artifactList = useMemo(
    () => artifactListForPreset(preset, stemOptions, mixdownFormat, stemFormat),
    [preset, stemOptions, mixdownFormat, stemFormat],
  )

  const bitrateValid = BITRATE_PATTERN.test(bitrate)
  const mp3Requested =
    ((preset === 'final-mix' || preset === 'full-package') && mixdownFormat === 'mp3') ||
    ((preset === 'stems-for-editing' || preset === 'full-package') && stemFormat === 'mp3')

  const planKey = useMemo(() => {
    return `${selectedTrackIdsKey}|${runIdsKey}|${artifactList.slice().sort().join(',')}|${mode}|${bitrate}`
  }, [selectedTrackIdsKey, runIdsKey, artifactList, mode, bitrate])
  const canPlan = !!selectedTrackIds.length && !!artifactList.length && (!mp3Requested || bitrateValid)
  const plan = canPlan && plannedResponse?.key === planKey ? plannedResponse.plan : null
  const planLoading = canPlan && plannedResponse?.key !== planKey
  useEffect(() => {
    if (result || !canPlan) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const response = await planExportBundle({
          track_ids: selectedTrackIds,
          run_ids: runIds,
          artifacts: artifactList,
          mode,
          bitrate,
        })
        if (!cancelled) {
          setPlannedResponse({ key: planKey, plan: response })
        }
      } catch (error) {
        if (!cancelled) {
          setPlannedResponse({ key: planKey, plan: null })
          onError(error instanceof Error ? error.message : 'Could not plan export.')
        }
      }
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [artifactList, bitrate, canPlan, mode, onError, planKey, result, runIds, selectedTrackIds])

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
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const totalBytes = plan?.total_bytes ?? 0
  const includedCount = plan?.included_track_count ?? 0
  const skippedCount = plan?.skipped_track_count ?? 0
  const showPackaging = selectedTrackIds.length > 1
  const usesExplicitRunSelection = Object.keys(runIds).length > 0
  const mixdownSummary = resolveMixdownSummary(
    singleTrack,
    selectedTracks,
    usesExplicitRunSelection,
  )
  const quickExportSummary = [
    preset === 'final-mix'
      ? `Mixdown: ${mixdownFormat.toUpperCase()}`
      : preset === 'stems-for-editing'
        ? `Stems: ${stemFormat.toUpperCase()}`
        : `Mixdown ${mixdownFormat.toUpperCase()} + stems ${stemFormat.toUpperCase()}`,
    showPackaging ? (mode === 'single-bundle' ? 'One zip' : 'Zip per track') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const presetLabel =
    preset === 'final-mix'
      ? 'Final mix'
      : preset === 'stems-for-editing'
        ? 'Stems for editing'
        : 'Full package'
  const blockingReason =
    !selectedTrackIds.length
      ? 'Choose at least one track to export.'
      : mp3Requested && !bitrateValid
        ? BITRATE_HINT
        : !artifactList.length
          ? preset === 'final-mix'
            ? 'No mixdown is available for this selection yet.'
            : 'This selection does not have the files needed for that preset. Choose Final mix or a different split.'
          : plan && includedCount === 0
            ? 'None of the selected tracks have the files required for this export plan.'
            : null

  return (
    <div className="import-modal" role="dialog" aria-modal="true" aria-label="Export tracks">
      <div className="import-modal-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="import-modal-panel" ref={panelRef} tabIndex={-1}>
        <header className="import-modal-head">
          <div className="import-flow-head-copy">
            <h2>
              {contextTitle ??
                `Export files for ${selectedTrackIds.length} track${selectedTrackIds.length === 1 ? '' : 's'}`}
            </h2>
            <p>
              {contextDescription ??
                (selectedTrackIds.length > 1 && usesExplicitRunSelection
                  ? 'Batch export uses the selected final version for each song.'
                  : 'Review the exact files and packaging before building the export bundle.')}
            </p>
          </div>
          <button ref={closeButtonRef} type="button" className="button-secondary" onClick={onClose}>
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
                  className="button-primary"
                  href={result.download_url}
                  download={result.filename}
                >
                  Download export
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
                  Build another export
                </button>
                <button
                  ref={doneButtonRef}
                  type="button"
                  className="button-secondary"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              <section className="export-section">
                <h3>1. Export preset</h3>
                {lockPreset ? (
                  <p className="output-intent-summary">
                    {presetLabel} is already selected for this export. Adjust format or packaging only if you need to.
                  </p>
                ) : (
                  <p className="output-intent-summary">
                    Start with the outcome you want to hand off. Most exports can stay on the quick
                    defaults below.
                  </p>
                )}
                {!lockPreset && stemOptions.length === 0 && (preset === 'stems-for-editing' || preset === 'full-package') ? (
                  <p className="export-inline-warning">
                    This selection does not have separated stems, so only Final mix can be exported right now.
                  </p>
                ) : null}
                {lockPreset ? (
                  <div className="export-preset-grid">
                    <div className="export-preset export-preset-active" aria-live="polite">
                        <strong>{presetLabel}</strong>
                        <span>
                          {preset === 'final-mix'
                          ? 'Just the saved mixdown.'
                          : preset === 'stems-for-editing'
                            ? 'Export the separated stems without a finished mixdown.'
                            : 'Mixdown, stems, and the source audio together.'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="export-preset-grid">
                    <button
                      type="button"
                      className={`export-preset ${preset === 'final-mix' ? 'export-preset-active' : ''}`}
                      onClick={() => setPreset('final-mix')}
                    >
                      <strong>Final mix</strong>
                      <span>Just the saved mixdown.</span>
                    </button>
                    <button
                      type="button"
                      className={`export-preset ${preset === 'stems-for-editing' ? 'export-preset-active' : ''}`}
                      onClick={() => setPreset('stems-for-editing')}
                      disabled={stemOptions.length === 0}
                    >
                      <strong>Stems for editing</strong>
                      <span>Export the separated stems without a finished mixdown.</span>
                    </button>
                    <button
                      type="button"
                      className={`export-preset ${preset === 'full-package' ? 'export-preset-active' : ''}`}
                      onClick={() => setPreset('full-package')}
                      disabled={stemOptions.length === 0}
                    >
                      <strong>Full package</strong>
                      <span>Mixdown, stems, and the source audio together.</span>
                    </button>
                  </div>
                )}
              </section>

              <section className="export-section">
                <h3>2. Review included files</h3>
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

              <section className="export-section export-quick-summary">
                <div className="export-quick-summary-copy">
                  <h3>3. Build export</h3>
                  <p>{quickExportSummary}</p>
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setShowAdvanced((current) => !current)}
                >
                  {showAdvanced ? 'Hide customization' : 'Customize output'}
                </button>
              </section>

              {showAdvanced ? (
                <section className="export-section export-advanced">
                  {preset === 'final-mix' || preset === 'full-package' ? (
                    <section className="export-section">
                      <h3>Mixdown format</h3>
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
                    </section>
                  ) : null}

                  {preset === 'stems-for-editing' || preset === 'full-package' ? (
                    <section className="export-section">
                      <h3>Stem format</h3>
                      {stemsLoading && !stemOptions.length ? (
                        <p className="inline-hint">Looking up available stems…</p>
                      ) : stemOptions.length ? (
                        <>
                          <p className="inline-hint">
                            Exporting all available stems for each selected track.
                          </p>
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
                        </>
                      ) : (
                        <p className="inline-hint">No separated stems available for this selection.</p>
                      )}
                    </section>
                  ) : null}

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

                  {preset === 'full-package' ? (
                    <section className="export-section export-section-extras">
                      <p className="inline-hint">
                        The original imported source file is included automatically in this preset.
                      </p>
                    </section>
                  ) : null}

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
                </section>
              ) : null}

              <div className="import-footer">
                <span>
                  {blockingReason
                    ? blockingReason
                    : busy
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
                    'Build export'
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
  usesExplicitRunSelection: boolean,
): string | null {
  if (usesExplicitRunSelection) {
    if (!allSelected.length) return null
    return singleTrack
      ? 'Using the mix saved on the selected split.'
      : 'Each selected track uses the mix saved on its chosen split.'
  }

  if (singleTrack) {
    return singleTrack.has_custom_mix
      ? 'Using your custom stem balance.'
      : 'Stems play at unity — no balance changes saved on this split.'
  }
  const custom = allSelected.filter((track) => track.has_custom_mix).length
  if (!allSelected.length) return null
  if (custom === 0) return 'None of the selected tracks have a custom balance — mixdowns play at unity.'
  if (custom === allSelected.length) return 'Every selected track uses its saved custom balance.'
  return `${custom} of ${allSelected.length} selected tracks have a custom balance; the rest play at unity.`
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
