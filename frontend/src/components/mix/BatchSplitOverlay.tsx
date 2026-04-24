import { useMemo, useRef, useState } from 'react'

import { discardRejection } from '../../async'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { Spinner } from '../feedback/Spinner'
import { trackStageSummary } from '../trackListView'
import type {
  ProcessingProfile,
  RunProcessingConfigInput,
  TrackSummary,
} from '../../types'

type BatchSplitOverlayProps = {
  open: boolean
  tracks: TrackSummary[]
  selectedTrackIds: string[]
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  busy: boolean
  onClose: () => void
  onConfirm: (trackIds: string[], processing: RunProcessingConfigInput) => Promise<void>
}

type SplitPlanRow = {
  track: TrackSummary
  eligible: boolean
  reason: string
}

function planRow(track: TrackSummary): SplitPlanRow {
  const stage = trackStageSummary(track)
  if (stage.key === 'needs-split') return { track, eligible: true, reason: 'Will queue a split' }
  if (stage.key === 'needs-attention') return { track, eligible: true, reason: 'Will retry with a fresh split' }
  if (stage.key === 'ready') return { track, eligible: true, reason: 'Will add another version' }
  if (stage.key === 'final') return { track, eligible: true, reason: 'Will add another version' }
  return { track, eligible: false, reason: 'Already splitting' }
}

export function BatchSplitOverlay(props: BatchSplitOverlayProps) {
  if (!props.open) return null
  return <BatchSplitOverlayContent {...props} />
}

function BatchSplitOverlayContent({
  tracks,
  selectedTrackIds,
  profiles,
  defaultProfileKey,
  busy,
  onClose,
  onConfirm,
}: BatchSplitOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(true, { containerRef: panelRef, initialFocusRef: closeButtonRef })

  const fallbackProfileKey = profiles.some((profile) => profile.key === defaultProfileKey)
    ? defaultProfileKey
    : profiles[0]?.key ?? defaultProfileKey
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null)
  const profileKey =
    selectedProfileKey && profiles.some((profile) => profile.key === selectedProfileKey)
      ? selectedProfileKey
      : fallbackProfileKey

  const rows = useMemo<SplitPlanRow[]>(() => {
    const idSet = new Set(selectedTrackIds)
    return tracks.filter((track) => idSet.has(track.id)).map(planRow)
  }, [selectedTrackIds, tracks])

  const eligibleRows = rows.filter((row) => row.eligible)
  const eligibleIds = eligibleRows.map((row) => row.track.id)

  async function handleConfirm() {
    if (!eligibleIds.length) return
    await onConfirm(eligibleIds, { profile_key: profileKey })
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Batch split"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="overlay-panel overlay-panel-wide" ref={panelRef} tabIndex={-1}>
        <header className="overlay-head">
          <h2>
            Split {eligibleRows.length} song{eligibleRows.length === 1 ? '' : 's'}
          </h2>
          <button ref={closeButtonRef} type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="overlay-body">
          {rows.length === 0 ? (
            <p className="imports-empty">No tracks selected.</p>
          ) : (
            <div className="batch-split">
              <label className="batch-split-profile">
                <span>Profile</span>
                <select
                  value={profileKey}
                  onChange={(event) => setSelectedProfileKey(event.target.value)}
                  disabled={busy || !eligibleRows.length}
                >
                  {profiles.map((profile) => (
                    <option key={profile.key} value={profile.key}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </label>

              <ul className="export-manifest">
                {rows.map((row) => (
                  <li
                    key={row.track.id}
                    className={`export-manifest-row ${row.eligible ? '' : 'export-manifest-row-skipped'}`}
                  >
                    <div className="export-manifest-head">
                      <strong>{row.track.title}</strong>
                    </div>
                    <div className={row.eligible ? 'batch-split-reason' : 'export-manifest-skip'}>
                      {row.reason}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="import-footer">
                {eligibleRows.length === 0 ? (
                  <span>None of the selected tracks can be split right now.</span>
                ) : (
                  <span className="batch-bar-spacer" />
                )}
                <button
                  type="button"
                  className="button-primary"
                  disabled={busy || eligibleRows.length === 0}
                  onClick={() => discardRejection(handleConfirm)}
                >
                  {busy ? (
                    <>
                      <Spinner /> Queueing
                    </>
                  ) : (
                    `Queue ${eligibleRows.length} split${eligibleRows.length === 1 ? '' : 's'}`
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
