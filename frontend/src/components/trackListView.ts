import type { TrackSummary } from '../types'
import { isActiveRunStatus } from './runStatus'

export type LibrarySort = 'recent' | 'created' | 'title' | 'runs'
export type LibraryFilter =
  | 'all'
  | 'needs-attention'
  | 'ready-to-render'
  | 'ready'
  | 'final'
export type TrackStage = LibraryFilter | 'rendering'

export type LibraryView = {
  search: string
  sort: LibrarySort
  filter: LibraryFilter
}

export type LibraryStageSummary = {
  key: Exclude<TrackStage, 'all'>
  label: string
  detail: string
  toneClassName: string
}

export type LibraryFilterMeta = {
  value: LibraryFilter
  label: string
  description: string
}

export const DEFAULT_LIBRARY_VIEW: LibraryView = {
  search: '',
  sort: 'recent',
  filter: 'all',
}

export const LIBRARY_FILTERS: LibraryFilterMeta[] = [
  {
    value: 'all',
    label: 'All songs',
    description: 'Everything in the library, regardless of where it sits in the workflow.',
  },
  {
    value: 'needs-attention',
    label: 'Needs retry',
    description: 'Splits that failed or were cancelled and need a retry or a different setup.',
  },
  {
    value: 'ready-to-render',
    label: 'Ready to split',
    description: 'Imported songs that have not been split yet.',
  },
  {
    value: 'ready',
    label: 'Review result',
    description: 'Completed splits that still need a final choice.',
  },
  {
    value: 'final',
    label: 'Final version',
    description: 'Songs with a chosen result ready to export again any time.',
  },
]

export function libraryFilterMeta(filter: LibraryFilter): LibraryFilterMeta {
  return LIBRARY_FILTERS.find((item) => item.value === filter) ?? LIBRARY_FILTERS[0]
}

export function trackStageSummary(track: TrackSummary): LibraryStageSummary {
  const latestStatus = track.latest_run?.status ?? null

  if (track.keeper_run_id) {
    return {
      key: 'final',
      label: 'Final version',
      detail: track.has_custom_mix
        ? 'A final version is chosen and a custom mix is saved.'
        : 'A final version is chosen and ready to export again any time.',
      toneClassName: 'track-card-stage-finished',
    }
  }

  if (latestStatus === 'failed' || latestStatus === 'cancelled') {
    return {
      key: 'needs-attention',
      label: 'Needs retry',
      detail: 'The latest split needs a retry or a different setup before this song is usable.',
      toneClassName: 'track-card-stage-attention',
    }
  }

  if (latestStatus && isActiveRunStatus(latestStatus)) {
    return {
      key: 'rendering',
      label: 'Rendering',
      detail: track.latest_run?.status_message || 'Processing in the background.',
      toneClassName: 'track-card-stage-active',
    }
  }

  if (latestStatus === 'completed') {
    return {
      key: 'ready',
      label: 'Review result',
      detail: track.has_custom_mix
        ? 'Custom mix saved. Choose the final version or export it.'
        : 'The split is usable. Review it, compare it, then choose the final version.',
      toneClassName: 'track-card-stage-ready',
    }
  }

  return {
    key: 'ready-to-render',
    label: 'Ready to split',
    detail: 'Import is done. Start the first split when you are ready.',
    toneClassName: 'track-card-stage-pending',
  }
}

export function countLibraryFilters(tracks: TrackSummary[]): Record<LibraryFilter, number> {
  const counts: Record<LibraryFilter, number> = {
    all: tracks.length,
    'needs-attention': 0,
    'ready-to-render': 0,
    ready: 0,
    final: 0,
  }

  for (const track of tracks) {
    const stage = trackStageSummary(track)
    if (stage.key === 'rendering') continue
    counts[stage.key] += 1
  }

  return counts
}

export function applyLibraryView(tracks: TrackSummary[], view: LibraryView): TrackSummary[] {
  const query = view.search.trim().toLowerCase()
  const matches = tracks.filter((track) => {
    if (query) {
      const haystack = `${track.title} ${track.artist ?? ''}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }

    const stage = trackStageSummary(track)
    switch (view.filter) {
      case 'needs-attention':
      case 'ready-to-render':
      case 'ready':
      case 'final':
        return stage.key === view.filter
      default:
        return true
    }
  })
  return [...matches].sort((a, b) => {
    switch (view.sort) {
      case 'title':
        return a.title.localeCompare(b.title)
      case 'runs':
        return b.run_count - a.run_count
      case 'created':
        return b.created_at.localeCompare(a.created_at)
      default:
        return b.updated_at.localeCompare(a.updated_at)
    }
  })
}
