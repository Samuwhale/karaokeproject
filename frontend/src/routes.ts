import type { LibraryFilter, LibrarySort, LibraryView } from './components/trackListView'

export type AppPage = 'library' | 'queue' | 'studio'
export type StudioTab = 'mix' | 'versions'

const LIBRARY_FILTERS = new Set<LibraryFilter>(['all', 'processing', 'ready'])

const LIBRARY_SORTS = new Set<LibrarySort>(['recent', 'created', 'title', 'runs'])
const STUDIO_TABS = new Set<StudioTab>(['mix', 'versions'])

export function parseLibraryView(searchParams: URLSearchParams): LibraryView {
  const filter = searchParams.get('filter')
  const sort = searchParams.get('sort')
  const search = searchParams.get('search')?.trim() ?? ''

  return {
    filter: filter && LIBRARY_FILTERS.has(filter as LibraryFilter) ? (filter as LibraryFilter) : 'all',
    sort: sort && LIBRARY_SORTS.has(sort as LibrarySort) ? (sort as LibrarySort) : 'recent',
    search,
  }
}

export function buildLibraryPath(view: LibraryView) {
  const searchParams = new URLSearchParams()

  if (view.filter !== 'all') searchParams.set('filter', view.filter)
  if (view.sort !== 'recent') searchParams.set('sort', view.sort)
  if (view.search.trim()) searchParams.set('search', view.search.trim())

  const search = searchParams.toString()
  return search ? `/library?${search}` : '/library'
}

export function normalizeStudioTab(tab: string | undefined): StudioTab {
  if (tab && STUDIO_TABS.has(tab as StudioTab)) return tab as StudioTab
  return 'mix'
}

export function buildStudioPath(
  trackId: string,
  tab: StudioTab,
  options?: {
    runId?: string | null
    compareRunId?: string | null
  },
) {
  const searchParams = new URLSearchParams()

  if (options?.runId) searchParams.set('run', options.runId)
  if (tab === 'versions' && options?.compareRunId) {
    searchParams.set('compare', options.compareRunId)
  }

  const search = searchParams.toString()
  return search ? `/studio/${trackId}/${tab}?${search}` : `/studio/${trackId}/${tab}`
}
