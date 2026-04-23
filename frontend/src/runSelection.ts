import type { RunDetail } from './types'

type RunOwner = {
  runs: RunDetail[]
}

export function resolveSelectedRun(track: RunOwner, selectedRunId: string | null): RunDetail | null {
  if (!track.runs.length) return null
  if (selectedRunId) {
    const matchingRun = track.runs.find((run) => run.id === selectedRunId)
    if (matchingRun) return matchingRun
  }
  return track.runs[0]
}
