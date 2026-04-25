import type { SongsFilter } from '../routes'
import type { TrackSummary } from '../types'
import { isActiveRunStatus } from './runStatus'

export type SongBrowseSort = 'recent' | 'created' | 'title' | 'runs'

export type TrackStageSummary = {
  key: 'processing' | 'needs-attention' | 'needs-stems' | 'ready' | 'final'
  label: string
  description: string
  actionLabel: string
}

export const SONG_BROWSE_SORT_OPTIONS: { value: SongBrowseSort; label: string; shortLabel: string }[] = [
  { value: 'recent', label: 'Recently updated', shortLabel: 'Recent' },
  { value: 'created', label: 'Recently added', shortLabel: 'Added' },
  { value: 'title', label: 'Title A–Z', shortLabel: 'A–Z' },
  { value: 'runs', label: 'Most outputs', shortLabel: 'Outputs' },
]

export function trackStageSummary(track: TrackSummary): TrackStageSummary {
  const latestStatus = track.latest_run?.status ?? null

  if (track.keeper_run_id) {
    return {
      key: 'final',
      label: 'Ready',
      description: track.has_custom_mix ? 'Saved custom mix on the preferred output.' : 'Preferred output ready to export.',
      actionLabel: 'Open mix',
    }
  }

  if (latestStatus === 'failed' || latestStatus === 'cancelled') {
    return {
      key: 'needs-attention',
      label: 'Needs attention',
      description: 'The latest stem job failed or was cancelled.',
      actionLabel: 'Review output',
    }
  }

  if (latestStatus && isActiveRunStatus(latestStatus)) {
    return {
      key: 'processing',
      label: 'Creating stems',
      description: track.latest_run?.status_message || 'Stems are still being created.',
      actionLabel: 'Open workspace',
    }
  }

  if (latestStatus === 'completed') {
    return {
      key: 'ready',
      label: track.has_custom_mix ? 'Mix saved' : 'Ready',
      description: track.has_custom_mix ? 'A saved stem balance is ready to reopen.' : 'The latest output is ready in Mix.',
      actionLabel: 'Open mix',
    }
  }

  return {
    key: 'needs-stems',
    label: 'Needs stems',
    description: 'The source is imported, but no stems have been queued yet.',
    actionLabel: 'Open workspace',
  }
}

export function applySongBrowse(
  tracks: TrackSummary[],
  view: {
    search: string
    sort: SongBrowseSort
    filter?: SongsFilter
  },
) {
  const query = view.search.trim().toLowerCase()
  const filter = view.filter ?? 'all'

  const matches = tracks.filter((track) => {
    if (query) {
      const haystack = `${track.title} ${track.artist ?? ''}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    if (filter !== 'all') {
      const stage = trackStageSummary(track)
      if (filter === 'needs-stems') return stage.key === 'needs-stems'
      if (filter === 'processing') return stage.key === 'processing'
      if (filter === 'attention') return stage.key === 'needs-attention'
      if (filter === 'ready') return stage.key === 'ready' || stage.key === 'final'
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
