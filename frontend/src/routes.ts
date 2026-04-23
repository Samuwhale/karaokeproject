import type { SongBrowseSort } from './components/trackListView'

export type SongsView = {
  search: string
  sort: SongBrowseSort
}

const SONG_SORTS = new Set<SongBrowseSort>(['recent', 'created', 'title', 'runs'])

export function parseSongsView(searchParams: URLSearchParams): SongsView {
  const sort = searchParams.get('sort')
  const search = searchParams.get('search')?.trim() ?? ''

  return {
    sort: sort && SONG_SORTS.has(sort as SongBrowseSort) ? (sort as SongBrowseSort) : 'recent',
    search,
  }
}

export function buildSongsPath(view: SongsView) {
  const searchParams = new URLSearchParams()

  if (view.sort !== 'recent') searchParams.set('sort', view.sort)
  if (view.search.trim()) searchParams.set('search', view.search.trim())

  const search = searchParams.toString()
  return search ? `/songs?${search}` : '/songs'
}

export function buildMixPath(trackId: string, options?: { runId?: string | null }) {
  const searchParams = new URLSearchParams()

  if (options?.runId) searchParams.set('run', options.runId)

  const search = searchParams.toString()
  return search ? `/mix/${trackId}?${search}` : `/mix/${trackId}`
}
