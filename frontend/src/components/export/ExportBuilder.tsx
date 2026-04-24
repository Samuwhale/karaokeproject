import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { discardRejection } from '../../async'
import { createExportBundle, listExportStems, planExportBundle } from '../../api'
import type {
  ExportArtifactKind,
  ExportBundleResponse,
  ExportOutputMode,
  ExportPlanResponse,
  ExportPlanTrack,
  ExportStemOption,
  RevealFolderInput,
} from '../../types'
import { exportStemKind, stemLabel } from '../../stems'
import { Spinner } from '../feedback/Spinner'

type Format = 'mp3' | 'wav'

type ExportBuilderProps = {
  selectedTrackIds: string[]
  defaultBitrate: string
  runIds?: Record<string, string>
  onError: (message: string) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  footerAction?: React.ReactNode
}

const BITRATE_PATTERN = /^\d{2,3}k$/
const BITRATE_HINT = 'Use a value like 192k or 320k.'

function buildArtifactList(
  includeMix: boolean,
  includeStems: boolean,
  includeSource: boolean,
  stemOptions: ExportStemOption[],
  mixFmt: Format,
  stemFmt: Format,
): ExportArtifactKind[] {
  const kinds: ExportArtifactKind[] = []
  if (includeMix) kinds.push(mixFmt === 'wav' ? 'mix-wav' : 'mix-mp3')
  if (includeStems) {
    for (const option of stemOptions) {
      kinds.push(exportStemKind(option.name, stemFmt) as ExportArtifactKind)
    }
  }
  if (includeSource) kinds.push('source')
  return kinds
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${bytes} B`
}

export function ExportBuilder({
  selectedTrackIds,
  defaultBitrate,
  runIds,
  onError,
  onReveal,
  footerAction,
}: ExportBuilderProps) {
  const resolvedRunIds = useMemo(() => runIds ?? {}, [runIds])
  const [loadedStemOptions, setLoadedStemOptions] = useState<{
    key: string
    stems: ExportStemOption[]
    error: string | null
  } | null>(null)

  const [includeMix, setIncludeMix] = useState(true)
  const [includeStems, setIncludeStems] = useState(false)
  const [includeSource, setIncludeSource] = useState(false)
  const [mixFmt, setMixFmt] = useState<Format>('mp3')
  const [stemFmt, setStemFmt] = useState<Format>('wav')
  const [mode, setMode] = useState<ExportOutputMode>('single-bundle')
  const [bitrate, setBitrate] = useState(defaultBitrate)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportBundleResponse | null>(null)
  const [plannedResponse, setPlannedResponse] = useState<{
    key: string
    plan: ExportPlanResponse | null
    error: string | null
  } | null>(null)
  const doneButtonRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (result) doneButtonRef.current?.focus()
  }, [result])

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
  const stemLookupError = loadedStemOptions?.key === stemOptionsKey ? loadedStemOptions.error : null
  const stemsLoading = selectedTrackIds.length > 0 && loadedStemOptions?.key !== stemOptionsKey
  const hasStems = stemOptions.length > 0

  useEffect(() => {
    if (!selectedTrackIds.length) return
    let cancelled = false

    listExportStems({ track_ids: selectedTrackIds, run_ids: resolvedRunIds })
      .then((response) => {
        if (!cancelled) {
          setLoadedStemOptions({ key: stemOptionsKey, stems: response.stems, error: null })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadedStemOptions({
            key: stemOptionsKey,
            stems: [],
            error: error instanceof Error ? error.message : 'Could not load stem availability.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [resolvedRunIds, selectedTrackIds, stemOptionsKey])

  const effectiveIncludeStems = includeStems && hasStems

  const artifactList = useMemo(
    () => buildArtifactList(includeMix, effectiveIncludeStems, includeSource, stemOptions, mixFmt, stemFmt),
    [includeMix, effectiveIncludeStems, includeSource, stemOptions, mixFmt, stemFmt],
  )
  const bitrateValid = BITRATE_PATTERN.test(bitrate)
  const mp3Requested = (includeMix && mixFmt === 'mp3') || (effectiveIncludeStems && stemFmt === 'mp3')
  const planKey = useMemo(() => {
    return `${selectedTrackIdsKey}|${runIdsKey}|${artifactList.slice().sort().join(',')}|${mode}|${bitrate}`
  }, [selectedTrackIdsKey, runIdsKey, artifactList, mode, bitrate])
  const canPlan = !!selectedTrackIds.length && !!artifactList.length && (!mp3Requested || bitrateValid)
  const plan = canPlan && plannedResponse?.key === planKey ? plannedResponse.plan : null
  const planError = canPlan && plannedResponse?.key === planKey ? plannedResponse.error : null
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
          setPlannedResponse({ key: planKey, plan: response, error: null })
        }
      } catch (error) {
        if (!cancelled) {
          setPlannedResponse({
            key: planKey,
            plan: null,
            error: error instanceof Error ? error.message : 'Could not check export availability.',
          })
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
  const showPackaging = selectedTrackIds.length > 1

  const blockingReason = !selectedTrackIds.length
    ? 'Choose at least one track to export.'
    : mp3Requested && !bitrateValid
      ? BITRATE_HINT
    : !artifactList.length
      ? 'Pick at least one thing to include.'
      : planError
        ? planError
        : plan && includedCount === 0
          ? 'None of the selected tracks have the files required for this export.'
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
            onClick={() => discardRejection(() => onReveal({ kind: 'bundle', job_id: result.job_id }))}
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
      <div className="export-pop-rows">
        <IncludeRow
          checked={includeMix}
          onToggle={() => setIncludeMix((value) => !value)}
          label="Edited mix"
          hint="Rendered file using each track's saved balance."
          format={mixFmt}
          onFormatChange={setMixFmt}
        />
        <IncludeRow
          checked={effectiveIncludeStems}
          disabled={!hasStems && !stemsLoading}
          onToggle={() => setIncludeStems((value) => !value)}
          label="Raw stems"
          hint={
            stemsLoading
              ? 'Looking up available stems…'
              : stemLookupError
                ? 'Could not load stem availability.'
              : hasStems
                ? 'Separated tracks, untouched.'
                : 'No separated stems available for this selection.'
          }
          format={stemFmt}
          onFormatChange={setStemFmt}
        />
        <IncludeRow
          checked={includeSource}
          onToggle={() => setIncludeSource((value) => !value)}
          label="Source file"
          hint="The original imported audio, alongside the export."
        />
      </div>

      {mp3Requested ? (
        <label className="export-bitrate-field">
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

      {showPackaging ? (
        <div className="export-pack">
          <span>Packaging</span>
          <div className="import-source-toggle">
            <button
              type="button"
              className={`segmented ${mode === 'single-bundle' ? 'segmented-active' : ''}`}
              onClick={() => setMode('single-bundle')}
            >
              All in one zip
            </button>
            <button
              type="button"
              className={`segmented ${mode === 'zip-per-track' ? 'segmented-active' : ''}`}
              onClick={() => setMode('zip-per-track')}
            >
              Zip per track
            </button>
          </div>
        </div>
      ) : null}

      <section className="export-manifest-section">
        <div className="export-manifest-head-bar">
          <span>Included</span>
          <span className="export-manifest-count">
            {planLoading && !plan
              ? 'Checking…'
              : plan
                ? `${includedCount} ready · ${skippedCount} skipped · ${formatBytes(totalBytes)}`
                : ''}
          </span>
        </div>
        {plan ? (
          <ExportManifest plan={plan} artifactList={artifactList} stemOptions={stemOptions} />
        ) : planError ? (
          <p className="inline-hint">{planError}</p>
        ) : planLoading ? (
          <p className="inline-hint">
            <Spinner /> Checking which artifacts are available…
          </p>
        ) : (
          <p className="inline-hint">Pick at least one thing to include to see what will be in the export.</p>
        )}
      </section>

      <div className="import-footer">
        <span>{blockingReason ?? (busy ? 'Building bundle…' : '')}</span>
        <div className="export-builder-actions">
          {footerAction}
          <button
            type="button"
            className="button-primary"
            disabled={
              busy ||
              !artifactList.length ||
              !selectedTrackIds.length ||
              (plan !== null && includedCount === 0) ||
              (mp3Requested && !bitrateValid)
            }
            onClick={() => discardRejection(handleExport)}
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

type IncludeRowProps = {
  checked: boolean
  disabled?: boolean
  onToggle: () => void
  label: string
  hint: string
  format?: Format
  onFormatChange?: (next: Format) => void
}

function IncludeRow({ checked, disabled, onToggle, label, hint, format, onFormatChange }: IncludeRowProps) {
  return (
    <label className={`export-pop-row ${checked ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
      <div className="export-pop-row-copy">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      {format && onFormatChange ? (
        <div className="import-source-toggle export-pop-row-fmt">
          <button
            type="button"
            className={`segmented ${format === 'mp3' ? 'segmented-active' : ''}`}
            disabled={!checked || disabled}
            onClick={() => onFormatChange('mp3')}
          >
            MP3
          </button>
          <button
            type="button"
            className={`segmented ${format === 'wav' ? 'segmented-active' : ''}`}
            disabled={!checked || disabled}
            onClick={() => onFormatChange('wav')}
          >
            WAV
          </button>
        </div>
      ) : null}
    </label>
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
  if (value === 'mix-mp3') return 'Mix MP3'
  if (value === 'mix-wav') return 'Mix WAV'
  if (value === 'source') return 'Source'
  if (value === 'metadata') return 'Metadata'
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
