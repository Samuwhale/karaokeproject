import { useRef } from 'react'

import { useDialogFocus } from '../hooks/useDialogFocus'
import type { RevealFolderInput, TrackSummary } from '../types'
import { ExportBuilder, type ExportPreset } from './export/ExportBuilder'

type ExportModalProps = {
  open: boolean
  onClose: () => void
  tracks: TrackSummary[]
  selectedTrackIds: string[]
  defaultBitrate: string
  selectedRunIdByTrack?: Record<string, string>
  initialPreset?: ExportPreset
  lockPreset?: boolean
  contextTitle?: string
  contextDescription?: string
  onError: (message: string) => void
  onReveal: (payload: RevealFolderInput) => void | Promise<void>
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

  return (
    <ExportModalContent
      onClose={onClose}
      tracks={tracks}
      selectedTrackIds={selectedTrackIds}
      defaultBitrate={defaultBitrate}
      selectedRunIdByTrack={selectedRunIdByTrack}
      initialPreset={initialPreset}
      lockPreset={lockPreset}
      contextTitle={contextTitle}
      contextDescription={contextDescription}
      onError={onError}
      onReveal={onReveal}
    />
  )
}

function ExportModalContent({
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
}: Omit<ExportModalProps, 'open'>) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(true, { containerRef: panelRef, initialFocusRef: closeButtonRef })

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
                'Review the exact files and packaging before building the export bundle.'}
            </p>
          </div>
          <button ref={closeButtonRef} type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="import-modal-body">
          <ExportBuilder
            tracks={tracks}
            selectedTrackIds={selectedTrackIds}
            defaultBitrate={defaultBitrate}
            runIds={selectedRunIdByTrack}
            initialPreset={initialPreset}
            lockPreset={lockPreset}
            onError={onError}
            onReveal={onReveal}
            footerAction={
              <button type="button" className="button-secondary" onClick={onClose}>
                Close
              </button>
            }
          />
        </div>
      </div>
    </div>
  )
}

export type { ExportPreset }
