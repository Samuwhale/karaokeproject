import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { createExportBundle, listExportStems, planExportBundle } from '../../api'
import type {
  ExportArtifactKind,
  ExportBundleResponse,
  ExportOutputMode,
  ExportPlanResponse,
  ExportPlanTrack,
  ExportStemOption,
  RevealFolderInput,
  TrackSummary,
} from '../../types'
import { exportStemKind, stemLabel } from '../../stems'
import { Spinner } from '../feedback/Spinner'

type MixdownFormat = 'mp3' | 'wav'
type StemFormat = 'mp3' | 'wav'
export type ExportPreset = 'final-mix' | 'stems-for-editing' | 'full-package'

type ExportBuilderProps = {
  tracks: TrackSummary[]
  selectedTrackIds: string[]
  defaultBitrate: string
  runIds?: Record<string, string>
  initialPreset?: ExportPreset
  lockPreset?: boolean
  hidePackaging?: boolean
  forceMode?: ExportOutputMode
  mixSummary?: string | null
  onError: (message: string) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  footerAction?: React.ReactNode
}

const BITRATE_PATTERN = /^\d{2,3}k$/
const BITRATE_HINT = 'Use a value like 192k or 320k.'

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

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${bytes} B`
}

function defaultMixSummary(
  selectedTracks: TrackSummary[],
  usesExplicitRunSelection: boolean,
) {
  if (usesExplicitRunSelection) {
    if (!selectedTracks.length) return null
    return selectedTracks.length === 1
      ? 'Using the saved stem balance from the selected version.'
      : 'Each selected track uses the saved stem balance from its chosen version.'
  }

  if (selectedTracks.length === 1) {
    return selectedTracks[0].has_custom_mix
      ? 'Using your saved custom stem balance.'
      : 'No custom balance is saved yet. This export uses unity gain.'
  }

  const customCount = selectedTracks.filter((track) => track.has_custom_mix).length
  if (selectedTracks.length === 0) return null
  if (customCount === 0) return 'None of the selected tracks have a custom balance saved yet.'
  if (customCount === selectedTracks.length) return 'Every selected track uses its saved custom balance.'
  return `${customCount} of ${selectedTracks.length} selected tracks use a saved custom balance.`
}

export function ExportBuilder({
  tracks,
  selectedTrackIds,
  defaultBitrate,
  runIds,
  initialPreset,
  lockPreset = false,
  hidePackaging = false,
  forceMode,
  mixSummary,
  onError,
  onReveal,
  footerAction,
}: ExportBuilderProps) {
  const resolvedRunIds = useMemo(() => runIds ?? {}, [runIds])
  const [loadedStemOptions, setLoadedStemOptions] = useState<{
    key: string
    stems: ExportStemOption[]
  } | null>(null)
  const [preset, setPreset] = useState<ExportPreset>(initialPreset ?? 'final-mix')
  const [mixdownFormat, setMixdownFormat] = useState<MixdownFormat>('mp3')
  const [stemFormat, setStemFormat] = useState<StemFormat>('wav')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customMode, setCustomMode] = useState<ExportOutputMode>('single-bundle')
  const [bitrate, setBitrate] = useState(defaultBitrate)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportBundleResponse | null>(null)
  const [plannedResponse, setPlannedResponse] = useState<{
    key: string
    plan: ExportPlanResponse | null
  } | null>(null)
  const doneButtonRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (result) doneButtonRef.current?.focus()
  }, [result])

  const mode = forceMode ?? customMode

  const selectedTrackIdsKey = useMemo(() => selectedTrackIds.join(','), [selectedTrackIds])
  const runIdsKey = useMemo(
    () =>
      Object.entries(resolvedRunIds)
        .sort()
        .map(([trackId, runId]) => `${trackId}=${runId}`)
        .join('|'),
    [resolvedRunIds],
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

    listExportStems({ track_ids: selectedTrackIds, run_ids: resolvedRunIds })
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
  }, [resolvedRunIds, selectedTrackIds, stemOptionsKey])

  const selectedTracks = useMemo(() => {
    const selectedIds = new Set(selectedTrackIds)
    return tracks.filter((track) => selectedIds.has(track.id))
  }, [tracks, selectedTrackIds])

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
          run_ids: resolvedRunIds,
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
  }, [artifactList, bitrate, canPlan, mode, onError, planKey, resolvedRunIds, result, selectedTrackIds])

  async function handleExport() {
    if (!artifactList.length) return
    if (mp3Requested && !bitrateValid) return
    setBusy(true)
    try {
      const response = await createExportBundle({
        track_ids: selectedTrackIds,
        run_ids: resolvedRunIds,
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

  const includedCount = plan?.included_track_count ?? 0
  const skippedCount = plan?.skipped_track_count ?? 0
  const totalBytes = plan?.total_bytes ?? 0
  const showPackaging = !hidePackaging && selectedTrackIds.length > 1 && !forceMode
  const usesExplicitRunSelection = Object.keys(resolvedRunIds).length > 0
  const currentMixSummary = mixSummary ?? defaultMixSummary(selectedTracks, usesExplicitRunSelection)
  const quickExportSummary = [
    preset === 'final-mix'
      ? `Edited mix: ${mixdownFormat.toUpperCase()}`
      : preset === 'stems-for-editing'
        ? `Raw stems: ${stemFormat.toUpperCase()}`
        : `Edited mix ${mixdownFormat.toUpperCase()} + raw stems ${stemFormat.toUpperCase()}`,
    showPackaging ? (mode === 'single-bundle' ? 'One zip' : 'Zip per track') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const presetLabel =
    preset === 'final-mix'
      ? 'Edited mix'
      : preset === 'stems-for-editing'
        ? 'Raw stems'
        : 'Mix + raw stems'
  const blockingReason =
    !selectedTrackIds.length
          ? 'Choose at least one track to export.'
          : mp3Requested && !bitrateValid
            ? BITRATE_HINT
            : !artifactList.length
              ? preset === 'final-mix'
                ? 'No mixdown is available for this selection yet.'
                : 'This selection does not have the files needed for that preset.'
              : plan && includedCount === 0
            ? 'None of the selected tracks have the files required for this export plan.'
            : null

  if (result) {
    return (
      <div className="export-result">
        <strong>Built {result.filename}</strong>
        <p>
          {result.included_track_count} track{result.included_track_count === 1 ? '' : 's'} included ·{' '}
          {formatBytes(result.byte_count)}
        </p>
        {result.skipped.length ? (
          <details className="export-result-skipped">
            <summary>{result.skipped.length} skipped</summary>
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
          <a className="button-primary" href={result.download_url} download={result.filename}>
            Download export
          </a>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void onReveal({ kind: 'bundle', job_id: result.job_id })}
          >
            Reveal in Finder
          </button>
          <button type="button" className="button-secondary" onClick={() => setResult(null)}>
            Build another export
          </button>
          {footerAction ? (
            <div className="export-result-extra-action" ref={doneButtonRef} tabIndex={-1}>
              {footerAction}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="export-builder">
      <section className="export-section">
        <h3>Export intent</h3>
        {lockPreset ? (
          <p className="output-intent-summary">
            {presetLabel} is already selected for this export. Adjust format only if you need to.
          </p>
        ) : (
          <p className="output-intent-summary">
            Start with the outcome you want to hand off. Most exports can stay on the quick defaults below.
          </p>
        )}
        {!lockPreset && stemOptions.length === 0 && (preset === 'stems-for-editing' || preset === 'full-package') ? (
          <p className="export-inline-warning">
            This selection does not have separated stems, so only Edited mix can be exported right now.
          </p>
        ) : null}
        {lockPreset ? (
          <div className="export-preset-grid">
            <div className="export-preset export-preset-active">
              <strong>{presetLabel}</strong>
              <span>
                {preset === 'final-mix'
                  ? 'Build the edited mix only.'
                  : preset === 'stems-for-editing'
                    ? 'Build the raw separated stems only.'
                    : 'Build the edited mix plus the raw stems together.'}
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
              <strong>Edited mix</strong>
              <span>Build the saved mix only.</span>
            </button>
            <button
              type="button"
              className={`export-preset ${preset === 'stems-for-editing' ? 'export-preset-active' : ''}`}
              onClick={() => setPreset('stems-for-editing')}
              disabled={stemOptions.length === 0}
            >
              <strong>Raw stems</strong>
              <span>Build the raw separated stems only.</span>
            </button>
            <button
              type="button"
              className={`export-preset ${preset === 'full-package' ? 'export-preset-active' : ''}`}
              onClick={() => setPreset('full-package')}
              disabled={stemOptions.length === 0}
            >
              <strong>Mix + raw stems</strong>
              <span>Build the edited mix plus the raw stems together.</span>
            </button>
          </div>
        )}
      </section>

      <section className="export-section">
        <h3>Included files</h3>
        {planLoading && !plan ? (
          <p className="inline-hint">
            <Spinner /> Checking which artifacts are available…
          </p>
        ) : plan ? (
          <ExportManifest plan={plan} artifactList={artifactList} stemOptions={stemOptions} />
        ) : (
          <p className="inline-hint">Pick at least one track and one artifact to see what will be included.</p>
        )}
      </section>

      <section className="export-section export-quick-summary">
        <div className="export-quick-summary-copy">
          <h3>Build export</h3>
          <p>{quickExportSummary}</p>
          {currentMixSummary ? <span className="export-mixdown-summary">{currentMixSummary}</span> : null}
        </div>
        <button
          type="button"
          className="button-secondary"
          onClick={() => setShowAdvanced((current) => !current)}
        >
          {showAdvanced ? 'Hide settings' : 'More settings'}
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
            </section>
          ) : null}

          {preset === 'stems-for-editing' || preset === 'full-package' ? (
            <section className="export-section">
              <h3>Stem format</h3>
              {stemsLoading && !stemOptions.length ? (
                <p className="inline-hint">Looking up available stems…</p>
              ) : stemOptions.length ? (
                <>
                  <p className="inline-hint">Exporting all available stems for each selected track.</p>
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
              {!bitrateValid ? <span className="field-error">{BITRATE_HINT}</span> : null}
            </label>
          ) : null}

          {preset === 'full-package' ? (
            <section className="export-section export-section-extras">
              <p className="inline-hint">The original imported source file is included automatically in this preset.</p>
            </section>
          ) : null}

          {showPackaging ? (
            <section className="export-section">
              <h3>Packaging</h3>
              <div className="import-source-toggle">
                <button
                  type="button"
                  className={`segmented ${mode === 'single-bundle' ? 'segmented-active' : ''}`}
                  onClick={() => setCustomMode('single-bundle')}
                >
                  All tracks in one zip
                </button>
                <button
                  type="button"
                  className={`segmented ${mode === 'zip-per-track' ? 'segmented-active' : ''}`}
                  onClick={() => setCustomMode('zip-per-track')}
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
        <div className="export-builder-actions">
          {footerAction}
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

type ManifestRowProps = {
  track: ExportPlanTrack
  artifactList: ExportArtifactKind[]
  stemOptions: ExportStemOption[]
}

const ManifestRow = memo(function ManifestRow({ track, artifactList, stemOptions }: ManifestRowProps) {
  const presentMap = useMemo(
    () => new Map(track.artifacts.map((artifact) => [artifact.kind, artifact])),
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
