import { useEffect, useMemo, useState } from 'react'

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

type Preset = 'final-mix' | 'stems-for-editing' | 'full-package'

type MixExportPopoverProps = {
  track: TrackDetail
  run: RunDetail
  defaultBitrate: string
  onClose: () => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  onError: (message: string) => void
}

const PRESET_LABEL: Record<Preset, string> = {
  'final-mix': 'Edited mix',
  'stems-for-editing': 'Raw stems',
  'full-package': 'Mix + raw stems',
}

const PRESET_DESC: Record<Preset, string> = {
  'final-mix': 'One rendered file using your saved balance.',
  'stems-for-editing': 'Separated stems, untouched.',
  'full-package': 'Edited mix plus raw stems.',
}

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
  preset: Preset,
  stems: string[],
  mixdownFmt: 'mp3' | 'wav',
  stemFmt: 'mp3' | 'wav',
): ExportArtifactKind[] {
  const kinds: ExportArtifactKind[] = []
  if (preset === 'final-mix' || preset === 'full-package') {
    kinds.push(mixdownFmt === 'wav' ? 'mix-wav' : 'mix-mp3')
  }
  if (preset === 'stems-for-editing' || preset === 'full-package') {
    for (const name of stems) {
      kinds.push(exportStemKind(name, stemFmt) as ExportArtifactKind)
    }
  }
  if (preset === 'full-package') kinds.push('source')
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
  const [preset, setPreset] = useState<Preset>('final-mix')
  const [mixdownFmt, setMixdownFmt] = useState<'mp3' | 'wav'>('mp3')
  const [stemFmt, setStemFmt] = useState<'mp3' | 'wav'>('wav')
  const [plannedBytes, setPlannedBytes] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportBundleResponse | null>(null)

  const stems = useMemo(() => stemNames(run), [run])
  const hasStems = stems.length > 0
  const artifactList = useMemo(
    () => buildArtifactList(preset, stems, mixdownFmt, stemFmt),
    [preset, stems, mixdownFmt, stemFmt],
  )

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
        if (!cancelled) setPlannedBytes(plan.total_bytes)
      } catch {
        if (!cancelled) setPlannedBytes(null)
      }
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [artifactList, defaultBitrate, result, run.id, track.id])

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
              onClick={() => void onReveal({ kind: 'bundle', job_id: result.job_id })}
            >
              Reveal
            </button>
            <button type="button" className="button-link" onClick={() => setResult(null)}>
              Build another
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} aria-hidden />
      <div className="popover popover-right popover-wide" role="dialog" aria-label="Export">
        <div className="popover-title">Export</div>
        <div className="export-pop-presets">
          {(['final-mix', 'stems-for-editing', 'full-package'] as Preset[]).map((value) => {
            const active = preset === value
            const disabled = (value === 'stems-for-editing' || value === 'full-package') && !hasStems
            return (
              <button
                key={value}
                type="button"
                className={`export-pop-preset ${active ? 'is-active' : ''}`}
                disabled={disabled}
                onClick={() => setPreset(value)}
              >
                <strong>{PRESET_LABEL[value]}</strong>
                <span>{PRESET_DESC[value]}</span>
              </button>
            )
          })}
        </div>

        {preset === 'final-mix' || preset === 'full-package' ? (
          <div className="export-pop-format">
            <span>Mix</span>
            <div className="import-source-toggle">
              <button
                type="button"
                className={`segmented ${mixdownFmt === 'mp3' ? 'segmented-active' : ''}`}
                onClick={() => setMixdownFmt('mp3')}
              >
                MP3
              </button>
              <button
                type="button"
                className={`segmented ${mixdownFmt === 'wav' ? 'segmented-active' : ''}`}
                onClick={() => setMixdownFmt('wav')}
              >
                WAV
              </button>
            </div>
          </div>
        ) : null}

        {preset === 'stems-for-editing' || preset === 'full-package' ? (
          <div className="export-pop-format">
            <span>Stems</span>
            <div className="import-source-toggle">
              <button
                type="button"
                className={`segmented ${stemFmt === 'mp3' ? 'segmented-active' : ''}`}
                onClick={() => setStemFmt('mp3')}
              >
                MP3
              </button>
              <button
                type="button"
                className={`segmented ${stemFmt === 'wav' ? 'segmented-active' : ''}`}
                onClick={() => setStemFmt('wav')}
              >
                WAV
              </button>
            </div>
          </div>
        ) : null}

        <div className="export-pop-status">
          {plannedBytes !== null ? `Estimated ${formatBytes(plannedBytes)}.` : 'Sizing…'}
        </div>

        <div className="popover-foot">
          <button
            type="button"
            className="button-primary"
            disabled={busy || !artifactList.length}
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
          <button type="button" className="button-link" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
