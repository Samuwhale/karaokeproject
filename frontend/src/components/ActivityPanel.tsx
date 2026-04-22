import type { QueueRunEntry } from '../types'
import { QueueList } from './QueueList'

type ActivityPanelProps = {
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

export function ActivityPanel(props: ActivityPanelProps) {
  if (props.entries.length === 0) return null

  return (
    <section className="section activity-panel">
      <QueueList
        entries={props.entries}
        selectedIds={props.selectedIds}
        onToggleSelect={props.onToggleSelect}
        onSelectAll={props.onSelectAll}
        onClearSelection={props.onClearSelection}
        onSelectTrack={props.onSelectTrack}
        onCancelRun={props.onCancelRun}
        onRetryRun={props.onRetryRun}
        onDismissRun={props.onDismissRun}
        cancellingRunId={props.cancellingRunId}
        retryingRunId={props.retryingRunId}
      />
    </section>
  )
}
