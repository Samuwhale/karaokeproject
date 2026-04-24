import { useEffect, useMemo, useState } from 'react'

import { discardRejection } from '../../async'
import { createExportBundle, planExportBundle } from '../../api'
import { Spinner } from '../feedback/Spinner'
import type {
  ExportArtifactKind,
  ExportBundleResponse,
  RevealFolderInput,
  RunDetail,
  TrackDetail,
} from '../../types'
import { exportStemKind } from '../../stems'

type MixExportPopoverProps = {
  track: TrackDetail
  run: RunDetail
  defaultBitrate: string
  onClose: () => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  onError: (message: string) => void
}

type Format = 'mp3' | 'wav'

function stemNames(run: RunDetail): string[] {
  const names = new Set<string>()
  for (const artifact of run.artifacts) {
    if (artifact.kind.startsWith('stem-wav:') || artifact.kind.startsWith('stem-mp3:')) {
      const [, name] = artifact.kind.split(':')
      if (name) names.add(name)
    } else if (artifact.kind.startsWith('stem:')) {
      const name = artifact.kind.slice('stem:'.length)
      if (name) names.add(name)
    }
  }
  return Array.from(names)
}

function buildArtifactList(
  includeMix: boolean,
  includeStems: boolean,
  stems: string[],
  mixFmt: Format,
  stemFmt: Format,
): ExportArtifactKind[] {
  const kinds: ExportArtifactKind[] = []
  if (includeMix) kinds.push(mixFmt === 'wav' ? 'mix-wav' : 'mix-mp3')
  if (includeStems) {
    for (const name of stems) {
      kinds.push(exportStemKind(name, stemFmt) as ExportArtifactKind)
    }
  }
  return kinds
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${bytes} B`
}

export function MixExportPopover({
  track,
  run,
  defaultBitrate,
  onClose,
  onReveal,
  onError,
}: MixExportPopoverProps) {
  const stems = useMemo(() => stemNames(run), [run])
  const hasStems = stems.length > 0

  const [includeMix, setIncludeMix] = useState(true)
  const [includeStems, setIncludeStems] = useState(false)
  const [mixFmt, setMixFmt] = useState<Format>('mp3')
  const [stemFmt, setStemFmt] = useState<Format>('wav')
  const [planResult, setPlanResult] = useState<{
    key: string
    bytes: number | null
    error: string | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportBundleResponse | null>(null)

  const effectiveIncludeStems = includeStems && hasStems
  const artifactList = useMemo(
    () => buildArtifactList(includeMix, effectiveIncludeStems, stems, mixFmt, stemFmt),
    [includeMix, effectiveIncludeStems, stems, mixFmt, stemFmt],
  )
  const planKey = useMemo(
    () => `${track.id}|${run.id}|${artifactList.slice().sort().join(',')}|${defaultBitrate}`,
    [artifactList, defaultBitrate, run.id, track.id],
  )
  const plannedBytes = artifactList.length > 0 && planResult?.key === planKey ? planResult.bytes : null
  const planError = artifactList.length > 0 && planResult?.key === planKey ? planResult.error : null

  useEffect(() => {
    if (result || artifactList.length === 0) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const plan = await planExportBundle({
          track_ids: [track.id],
          run_ids: { [track.id]: run.id },
          artifacts: artifactList,
          mode: 'single-bundle',
          bitrate: defaultBitrate,
        })
        if (!cancelled) {
          setPlanResult({ key: planKey, bytes: plan.total_bytes, error: null })
        }
      } catch (error) {
        if (!cancelled) {
          setPlanResult({
            key: planKey,
            bytes: null,
            error: error instanceof Error ? error.message : 'Could not estimate export size.',
          })
        }
      }
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [artifactList, defaultBitrate, planKey, result, run.id, track.id])

  async function handleExport() {
    if (!artifactList.length) return
    setBusy(true)
    try {
      const response = await createExportBundle({
        track_ids: [track.id],
        run_ids: { [track.id]: run.id },
        artifacts: artifactList,
        mode: 'single-bundle',
        bitrate: defaultBitrate,
      })
      setResult(response)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <>
        <div className="popover-backdrop" onClick={onClose} aria-hidden />
        <div className="popover popover-right popover-wide" role="dialog" aria-label="Export ready">
          <div className="popover-title">{result.filename}</div>
          <div className="export-pop-status">
            {formatBytes(result.byte_count)} · {result.included_track_count} track
          </div>
          <div className="popover-foot">
            <a className="button-primary" href={result.download_url} download={result.filename}>
              Download
            </a>
            <button
              type="button"
              className="button-secondary"
              onClick={() => discardRejection(() => onReveal({ kind: 'bundle', job_id: result.job_id }))}
            >
              Reveal
            </button>
            <button type="button" className="button-link" onClick={() => setResult(null)}>
              Export again
            </button>
          </div>
        </div>
      </>
    )
  }

  const canBuild = artifactList.length > 0 && !busy

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} aria-hidden />
      <div className="popover popover-right popover-wide" role="dialog" aria-label="Export">
        <div className="popover-title">Export</div>
        <div className="export-pop-rows">
          <ExportPopRow
            checked={includeMix}
            onToggle={() => setIncludeMix((value) => !value)}
            label="Edited mix"
            hint="Rendered with your current stem levels."
            format={mixFmt}
            onFormatChange={setMixFmt}
          />
          <ExportPopRow
            checked={effectiveIncludeStems}
            disabled={!hasStems}
            onToggle={() => setIncludeStems((value) => !value)}
            label="Raw stems"
            hint={hasStems ? 'Separated tracks, untouched.' : 'This version has no stems.'}
            format={stemFmt}
            onFormatChange={setStemFmt}
          />
        </div>

        <div className="export-pop-status">
          {artifactList.length === 0
            ? 'Select at least one output to export.'
            : planError
              ? planError
            : plannedBytes !== null
              ? `Estimated ${formatBytes(plannedBytes)}.`
              : 'Estimating size…'}
        </div>

        <div className="popover-foot">
          <button
            type="button"
            className="button-primary"
            disabled={!canBuild}
            onClick={() => discardRejection(handleExport)}
          >
            {busy ? (
              <>
                <Spinner /> Exporting…
              </>
            ) : (
              'Export'
            )}
          </button>
          <button type="button" className="button-link" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

type ExportPopRowProps = {
  checked: boolean
  disabled?: boolean
  onToggle: () => void
  label: string
  hint: string
  format: Format
  onFormatChange: (next: Format) => void
}

function ExportPopRow({ checked, disabled, onToggle, label, hint, format, onFormatChange }: ExportPopRowProps) {
  return (
    <label className={`export-pop-row ${checked ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      <div className="export-pop-row-copy">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
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
    </label>
  )
}
