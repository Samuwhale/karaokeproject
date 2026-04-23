import type { TrackSummary } from '../types'
import { isActiveRunStatus } from './runStatus'

export type LibrarySort = 'recent' | 'created' | 'title' | 'runs'
export type LibraryFilter =
  | 'all'
  | 'needs-attention'
  | 'ready-to-render'
  | 'rendering'
  | 'ready'
  | 'final'

export type LibraryView = {
  search: string
  sort: LibrarySort
  filter: LibraryFilter
}

export type LibraryStageSummary = {
  key: Exclude<LibraryFilter, 'all'>
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
    description: 'Everything in the library, regardless of stage.',
  },
  {
    value: 'needs-attention',
    label: 'Needs work',
    description: 'Failed or cancelled renders that need a decision.',
  },
  {
    value: 'ready-to-render',
    label: 'To render',
    description: 'Imported songs that have not been rendered yet.',
  },
  {
    value: 'rendering',
    label: 'Rendering',
    description: 'Runs that are still working in the background.',
  },
  {
    value: 'ready',
    label: 'Ready',
    description: 'Usable results that still need a final decision or export.',
  },
  {
    value: 'final',
    label: 'Final',
    description: 'Songs with a chosen final version.',
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
      label: 'Final',
      detail: track.has_custom_mix
        ? 'A final version is chosen and a custom mix is saved.'
        : 'A final version is chosen and ready to export again anytime.',
      toneClassName: 'track-card-stage-finished',
    }
  }

  if (latestStatus === 'failed' || latestStatus === 'cancelled') {
    return {
      key: 'needs-attention',
      label: 'Needs work',
      detail: 'Latest render needs a retry or a different setup before this song is usable.',
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
      label: 'Ready',
      detail: track.has_custom_mix
        ? 'Custom mix saved. Set the final version or export it.'
        : 'The render is usable. Review it, compare it, then set the final version.',
      toneClassName: 'track-card-stage-ready',
    }
  }

  return {
    key: 'ready-to-render',
    label: 'To render',
    detail: 'Import is done. Start the first render when you are ready.',
    toneClassName: 'track-card-stage-pending',
  }
}

export function countLibraryFilters(tracks: TrackSummary[]): Record<LibraryFilter, number> {
  const counts: Record<LibraryFilter, number> = {
    all: tracks.length,
    'needs-attention': 0,
    'ready-to-render': 0,
    rendering: 0,
    ready: 0,
    final: 0,
  }

  for (const track of tracks) {
    counts[trackStageSummary(track).key] += 1
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
      case 'rendering':
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
