import { useEffect, useState } from 'react'

import type { QueueRunEntry } from '../types'
import { ProgressBar } from './feedback/ProgressBar'
import { QueueList } from './QueueList'
import { RUN_STATUS_LABELS, describeRun } from './runStatus'

type QueueDockProps = {
  entries: QueueRunEntry[]
  selectedIds: Set<string>
  onToggleSelect: (runId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  onSelectTrack: (trackId: string) => void
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<void>
  onDismissRun: (runId: string) => Promise<void>
  cancellingRunId: string | null
  retryingRunId: string | null
}

const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'separating', 'exporting'])

function pickLead(entries: QueueRunEntry[]) {
  return entries.find((entry) => ACTIVE_STATUSES.has(entry.run.status)) ?? entries[0] ?? null
}

export function QueueDock(props: QueueDockProps) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (props.entries.length === 0) setExpanded(false)
  }, [props.entries.length])

  if (props.entries.length === 0) return null

  const lead = pickLead(props.entries)
  const leadRun = lead?.run ?? null
  const remaining = props.entries.length - (lead ? 1 : 0)
  const leadStatus = leadRun ? RUN_STATUS_LABELS[leadRun.status] ?? leadRun.status : ''
  const leadMessage = leadRun ? describeRun(leadRun) : ''
  const isLeadActive = leadRun ? ACTIVE_STATUSES.has(leadRun.status) : false

  return (
    <div className={`queue-dock ${expanded ? 'queue-dock-expanded' : ''}`} role="region" aria-label="Queue">
      {expanded ? (
        <div className="queue-dock-panel">
          <QueueList
            entries={props.entries}
            selectedIds={props.selectedIds}
            onToggleSelect={props.onToggleSelect}
            onSelectAll={props.onSelectAll}
            onClearSelection={props.onClearSelection}
            onSelectTrack={(trackId) => {
              props.onSelectTrack(trackId)
              setExpanded(false)
            }}
            onCancelRun={props.onCancelRun}
            onRetryRun={props.onRetryRun}
            onDismissRun={props.onDismissRun}
            cancellingRunId={props.cancellingRunId}
            retryingRunId={props.retryingRunId}
          />
        </div>
      ) : null}

      <button
        type="button"
        className="queue-dock-strip"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <div className="queue-dock-lead">
          {lead ? (
            <>
              <div className="queue-dock-lead-title">
                <strong>{lead.track_title}</strong>
                {lead.track_artist ? <span> · {lead.track_artist}</span> : null}
              </div>
              <div className="queue-dock-lead-meta">
                {leadStatus}
                {leadMessage ? ` · ${leadMessage}` : ''}
              </div>
              {isLeadActive && leadRun ? <ProgressBar value={leadRun.progress} /> : null}
            </>
          ) : null}
        </div>
        <div className="queue-dock-tail">
          {remaining > 0 ? (
            <span className="queue-dock-count">
              +{remaining} more
            </span>
          ) : null}
          <span className="queue-dock-toggle" aria-hidden>
            {expanded ? '▾' : '▴'}
          </span>
        </div>
      </button>
    </div>
  )
}
