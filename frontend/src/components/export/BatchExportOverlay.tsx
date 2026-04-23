import { useRef } from 'react'

import { useDialogFocus } from '../../hooks/useDialogFocus'
import type { RevealFolderInput, TrackSummary } from '../../types'
import { trackStageSummary } from '../trackListView'
import { ExportBuilder } from './ExportBuilder'

type BatchExportOverlayProps = {
  open: boolean
  tracks: TrackSummary[]
  selectedTrackIds: string[]
  defaultBitrate: string
  onClose: () => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
  onError: (message: string) => void
}

function resolveRunId(track: TrackSummary) {
  if (track.keeper_run_id) return track.keeper_run_id
  if (track.latest_run?.status === 'completed') return track.latest_run.id
  return null
}

export function BatchExportOverlay(props: BatchExportOverlayProps) {
  if (!props.open) return null
  return <BatchExportOverlayContent {...props} />
}

function BatchExportOverlayContent({
  tracks,
  selectedTrackIds,
  defaultBitrate,
  onClose,
  onReveal,
  onError,
}: BatchExportOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(true, { containerRef: panelRef, initialFocusRef: closeButtonRef })

  const readyTracks = tracks.filter((track) => {
    if (!selectedTrackIds.includes(track.id)) return false
    const stage = trackStageSummary(track)
    return (stage.key === 'ready' || stage.key === 'final') && resolveRunId(track) !== null
  })
  const runIds = Object.fromEntries(
    readyTracks
      .map((track) => [track.id, resolveRunId(track)])
      .filter((pair): pair is [string, string] => pair[1] !== null),
  )
  const exportableIds = readyTracks.map((track) => track.id)

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Export selection"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="overlay-panel overlay-panel-wide" ref={panelRef} tabIndex={-1}>
        <header className="overlay-head">
          <h2>Export {exportableIds.length} song{exportableIds.length === 1 ? '' : 's'}</h2>
          <button ref={closeButtonRef} type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="overlay-body">
          {exportableIds.length === 0 ? (
            <p className="imports-empty">No exportable tracks in this selection.</p>
          ) : (
            <ExportBuilder
              selectedTrackIds={exportableIds}
              defaultBitrate={defaultBitrate}
              runIds={runIds}
              onReveal={onReveal}
              onError={onError}
            />
          )}
        </div>
      </div>
    </div>
  )
}
