import type { RunDetail } from './types'

type RunOwner = {
  runs: RunDetail[]
  keeper_run_id?: string | null
}

export function resolveSelectedRun(track: RunOwner, selectedRunId: string | null): RunDetail | null {
  if (!track.runs.length) return null
  if (selectedRunId) {
    const matchingRun = track.runs.find((run) => run.id === selectedRunId)
    if (matchingRun) return matchingRun
  }
  if (track.keeper_run_id) {
    const keeperRun = track.runs.find((run) => run.id === track.keeper_run_id)
    if (keeperRun) return keeperRun
  }
  return track.runs[0]
}
