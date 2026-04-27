import { useMemo, useRef, useState } from 'react'

import { discardRejection } from '../../async'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { stemSelectionLabel } from '../../stems'
import { StemSelectionPicker } from '../StemSelectionPicker'
import { Spinner } from '../feedback/Spinner'
import { trackStageSummary } from '../trackListView'
import type {
  QualityOption,
  RunProcessingConfigInput,
  StemOption,
  TrackSummary,
} from '../../types'

type BatchStemOverlayProps = {
  open: boolean
  tracks: TrackSummary[]
  selectedTrackIds: string[]
  stemOptions: StemOption[]
  qualityOptions: QualityOption[]
  defaultSelection: RunProcessingConfigInput
  busy: boolean
  onClose: () => void
  onConfirm: (trackIds: string[], processing: RunProcessingConfigInput) => Promise<void>
}

type StemPlanRow = {
  track: TrackSummary
  eligible: boolean
  reason: string
}

function planRow(track: TrackSummary): StemPlanRow {
  const stage = trackStageSummary(track)
  if (stage.key === 'needs-stems') return { track, eligible: true, reason: 'Will create stems' }
  if (stage.key === 'needs-attention') return { track, eligible: true, reason: 'Will retry stem creation' }
  if (stage.key === 'ready') return { track, eligible: true, reason: 'Will create or unlock stems' }
  if (stage.key === 'final') return { track, eligible: true, reason: 'Will create or unlock stems' }
  return { track, eligible: false, reason: 'Already creating stems' }
}

export function BatchStemOverlay(props: BatchStemOverlayProps) {
  if (!props.open) return null
  return <BatchStemOverlayContent {...props} />
}

function BatchStemOverlayContent({
  tracks,
  selectedTrackIds,
  stemOptions,
  qualityOptions,
  defaultSelection,
  busy,
  onClose,
  onConfirm,
}: BatchStemOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(true, { containerRef: panelRef, initialFocusRef: closeButtonRef })

  const [selection, setSelection] = useState(defaultSelection)

  const rows = useMemo<StemPlanRow[]>(() => {
    const idSet = new Set(selectedTrackIds)
    return tracks.filter((track) => idSet.has(track.id)).map(planRow)
  }, [selectedTrackIds, tracks])

  const eligibleRows = rows.filter((row) => row.eligible)
  const eligibleIds = eligibleRows.map((row) => row.track.id)

  async function handleConfirm() {
    if (!eligibleIds.length || selection.stems.length === 0) return
    await onConfirm(eligibleIds, selection)
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Create stems"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="overlay-panel overlay-panel-wide" ref={panelRef} tabIndex={-1}>
        <header className="overlay-head">
          <h2>
            Create stems for {eligibleRows.length} song{eligibleRows.length === 1 ? '' : 's'}
          </h2>
          <button ref={closeButtonRef} type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="overlay-body">
          {rows.length === 0 ? (
            <p className="imports-empty">No tracks selected.</p>
          ) : (
            <div className="batch-stems">
              <StemSelectionPicker
                value={selection}
                stemOptions={stemOptions}
                qualityOptions={qualityOptions}
                disabled={busy || !eligibleRows.length}
                onChange={setSelection}
              />

              <ul className="export-manifest">
                {rows.map((row) => (
                  <li
                    key={row.track.id}
                    className={`export-manifest-row ${row.eligible ? '' : 'export-manifest-row-skipped'}`}
                  >
                    <div className="export-manifest-head">
                      <strong>{row.track.title}</strong>
                    </div>
                    <div className={row.eligible ? 'batch-stems-reason' : 'export-manifest-skip'}>
                      {row.reason}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="import-footer">
                {eligibleRows.length === 0 ? (
                  <span>None of the selected tracks can create stems right now.</span>
                ) : (
                  <span>{stemSelectionLabel(selection.stems, stemOptions)}</span>
                )}
                <button
                  type="button"
                  className="button-primary"
                  disabled={busy || eligibleRows.length === 0 || selection.stems.length === 0}
                  onClick={() => discardRejection(handleConfirm)}
                >
                  {busy ? (
                    <>
                      <Spinner /> Queueing
                    </>
                  ) : (
                    `Queue ${eligibleRows.length} stem job${eligibleRows.length === 1 ? '' : 's'}`
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
