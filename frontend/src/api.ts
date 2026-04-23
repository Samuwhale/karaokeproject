import type {
  BatchDeleteResponse,
  BatchTrackIdsInput,
  CachedModelsResponse,
  ConfirmImportDraftsInput,
  ConfirmImportDraftsResponse,
  Diagnostics,
  ExportBundleCleanupResponse,
  ExportBundleInput,
  ExportBundleResponse,
  ExportPlanInput,
  ExportPlanResponse,
  ExportStemsInput,
  ExportStemsResponse,
  ImportDraft,
  NonKeeperCleanupResponse,
  RevealFolderInput,
  RevealFolderResponse,
  QueueRunEntry,
  ResolveLocalImportResponse,
  ResolveYouTubeImportResponse,
  RunDetail,
  RunMixStemEntry,
  RunProcessingConfigInput,
  RunSummary,
  Settings,
  StorageOverview,
  TempCleanupResponse,
  TrackDetail,
  TrackSummary,
  UpdateImportDraftInput,
} from './types'

async function parseErrorBody(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as { detail?: unknown } | null
      if (payload && typeof payload.detail === 'string' && payload.detail.trim()) {
        return payload.detail
      }
    } catch {
      return null
    }
    return null
  }
  try {
    const text = (await response.text()).trim()
    if (!text) return null
    return text.length > 200 ? `${text.slice(0, 200)}…` : text
  } catch {
    return null
  }
}

export class ApiError extends Error {
  status: number
  statusText: string
  detail: string | null

  constructor(response: Response, detail: string | null) {
    const status = `${response.status} ${response.statusText}`.trim()
    super(detail ? `${status} — ${detail}` : `Request failed (${status}).`)
    this.name = 'ApiError'
    this.status = response.status
    this.statusText = response.statusText
    this.detail = detail
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch (error) {
    const cause = error instanceof Error ? error.message : 'Network request failed.'
    throw new Error(`Network error: ${cause}`)
  }

  if (!response.ok) {
    const detail = await parseErrorBody(response)
    throw new ApiError(response, detail)
  }

  return (await response.json()) as T
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function putJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function postKeepalive(url: string, body?: unknown) {
  const init: RequestInit = {
    method: 'POST',
    keepalive: true,
  }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  void fetch(url, init).catch(() => undefined)
}

export function getDiagnostics() {
  return fetchJson<Diagnostics>('/api/diagnostics')
}

export function getSettings() {
  return fetchJson<Settings>('/api/settings')
}

export function updateSettings(settings: Omit<Settings, 'profiles'>) {
  return putJson<Settings>('/api/settings', settings)
}

export function getStorageOverview() {
  return fetchJson<StorageOverview>('/api/storage')
}

export function getCachedModels() {
  return fetchJson<CachedModelsResponse>('/api/models/cached')
}

export function cleanupTempStorage() {
  return fetchJson<TempCleanupResponse>('/api/storage/cleanup/temp', {
    method: 'POST',
  })
}

export function cleanupExportBundles() {
  return fetchJson<ExportBundleCleanupResponse>('/api/storage/cleanup/export-bundles', {
    method: 'POST',
  })
}

export function cleanupNonKeeperRunsLibrary() {
  return fetchJson<NonKeeperCleanupResponse>('/api/storage/cleanup/non-keeper-runs', {
    method: 'POST',
  })
}

export function flushPendingLibraryCleanup() {
  postKeepalive('/api/storage/cleanup/non-keeper-runs')
}

// --- Tracks ---

export function getTracks() {
  return fetchJson<TrackSummary[]>('/api/tracks')
}

export function getTrack(trackId: string) {
  return fetchJson<TrackDetail>(`/api/tracks/${trackId}`)
}

export function updateTrack(trackId: string, payload: { title?: string; artist?: string | null }) {
  return putJson<TrackDetail>(`/api/tracks/${trackId}`, payload)
}

// --- Runs ---

export function createRun(trackId: string, processing: RunProcessingConfigInput) {
  return postJson<{ run: RunSummary }>(`/api/tracks/${trackId}/runs`, { processing })
}

export function cancelRun(runId: string) {
  return fetchJson<{ run: RunSummary }>(`/api/runs/${runId}/cancel`, { method: 'POST' })
}

export function retryRun(runId: string) {
  return fetchJson<{ run: RunSummary }>(`/api/runs/${runId}/retry`, { method: 'POST' })
}

export function dismissRun(runId: string) {
  return fetchJson<{ run: RunSummary }>(`/api/runs/${runId}/dismiss`, { method: 'POST' })
}

export async function deleteRun(runId: string) {
  await fetchJson(`/api/runs/${runId}`, { method: 'DELETE' })
}

export function updateRunMix(trackId: string, runId: string, stems: RunMixStemEntry[]) {
  return putJson<RunDetail>(`/api/tracks/${trackId}/runs/${runId}/mix`, { stems })
}

export function getActiveRuns() {
  return fetchJson<QueueRunEntry[]>('/api/runs/active')
}

// --- Keeper / cleanup ---

export function setKeeperRun(trackId: string, runId: string | null) {
  return putJson<TrackDetail>(`/api/tracks/${trackId}/keeper`, { run_id: runId })
}

export function batchDeleteTracks(payload: BatchTrackIdsInput) {
  return postJson<BatchDeleteResponse>('/api/tracks/batch/delete', payload)
}

export function flushPendingTrackDeletes(trackIds: string[]) {
  if (!trackIds.length) return
  postKeepalive('/api/tracks/batch/delete', { track_ids: trackIds })
}

// --- Imports (drafts) ---

export function resolveYouTubeImport(sourceUrl: string) {
  return postJson<ResolveYouTubeImportResponse>('/api/imports/youtube/resolve', {
    source_url: sourceUrl,
  })
}

export function resolveLocalImport(files: File[]) {
  const formData = new FormData()
  for (const file of files) formData.append('files', file)
  return fetchJson<ResolveLocalImportResponse>('/api/imports/local/resolve', {
    method: 'POST',
    body: formData,
  })
}

export function listImportDrafts() {
  return fetchJson<ImportDraft[]>('/api/imports/drafts')
}

export function updateImportDraft(draftId: string, payload: UpdateImportDraftInput) {
  return patchJson<ImportDraft>(`/api/imports/drafts/${draftId}`, payload)
}

export async function discardImportDraft(draftId: string) {
  await fetchJson(`/api/imports/drafts/${draftId}`, { method: 'DELETE' })
}

export function confirmImportDrafts(payload: ConfirmImportDraftsInput) {
  return postJson<ConfirmImportDraftsResponse>('/api/imports/drafts/confirm', payload)
}

// --- Exports ---

export function createExportBundle(payload: ExportBundleInput) {
  return postJson<ExportBundleResponse>('/api/exports/bundle', payload)
}

export function planExportBundle(payload: ExportPlanInput) {
  return postJson<ExportPlanResponse>('/api/exports/plan', payload)
}

export function listExportStems(payload: ExportStemsInput) {
  return postJson<ExportStemsResponse>('/api/exports/stems', payload)
}

// --- System ---

export function revealFolder(payload: RevealFolderInput) {
  return postJson<RevealFolderResponse>('/api/system/reveal', payload)
}

// --- Admin ---

export function backfillMetrics() {
  return fetchJson<{ updated_artifact_count: number }>('/api/admin/backfill-metrics', {
    method: 'POST',
  })
}
