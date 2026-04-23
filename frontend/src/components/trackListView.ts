import type { TrackSummary } from '../types'
import { isActiveRunStatus } from './runStatus'

export type LibrarySort = 'recent' | 'created' | 'title' | 'runs'
export type LibraryFilter = 'all' | 'processing' | 'ready'
export type TrackStage = 'rendering' | 'needs-attention' | 'ready-to-render' | 'ready' | 'final'

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
    label: 'All',
    description: 'Every song in the library.',
  },
  {
    value: 'processing',
    label: 'Processing',
    description: 'Songs still moving through import or split work.',
  },
  {
    value: 'ready',
    label: 'Ready',
    description: 'Songs ready for version review or mixing.',
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
      label: 'Final saved',
      detail: track.has_custom_mix
        ? 'A final version is chosen and a custom mix is saved.'
        : 'A final version is chosen and ready to export again any time.',
      toneClassName: 'track-card-stage-finished',
    }
  }

  if (latestStatus === 'failed' || latestStatus === 'cancelled') {
    return {
      key: 'needs-attention',
      label: 'Retry split',
      detail: 'The latest split failed. Retry it or choose a different setup.',
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
      label: 'Needs final choice',
      detail: track.has_custom_mix
        ? 'A custom mix is saved. Re-open it or compare it before you lock in the final version.'
        : 'The split is usable. Compare versions first, then open the winner in Mix.',
      toneClassName: 'track-card-stage-ready',
    }
  }

  return {
    key: 'ready-to-render',
    label: 'Needs split',
    detail: 'Import is done. Queue the first split when you are ready.',
    toneClassName: 'track-card-stage-pending',
  }
}

export function countLibraryFilters(tracks: TrackSummary[]): Record<LibraryFilter, number> {
  const counts: Record<LibraryFilter, number> = {
    all: tracks.length,
    ready: 0,
    processing: 0,
  }

  for (const track of tracks) {
    const stage = trackStageSummary(track)
    if (stage.key === 'ready' || stage.key === 'final') {
      counts.ready += 1
    } else {
      counts.processing += 1
    }
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
    if (view.filter === 'processing') {
      return stage.key === 'rendering' || stage.key === 'needs-attention' || stage.key === 'ready-to-render'
    }

    if (view.filter === 'ready') {
      return stage.key === 'ready' || stage.key === 'final'
    }

    return true
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
