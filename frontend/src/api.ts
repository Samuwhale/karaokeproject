import type {
  ConfirmYouTubeImportPayload,
  ConfirmYouTubeImportResponse,
  Diagnostics,
  ResolveYouTubeImportResponse,
  RunProcessingConfigInput,
  RunSummary,
  Settings,
  TrackDetail,
  TrackSummary,
} from './types'

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new Error(payload?.detail ?? `Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

export function getDiagnostics() {
  return fetchJson<Diagnostics>('/api/diagnostics')
}

export function getSettings() {
  return fetchJson<Settings>('/api/settings')
}

export function updateSettings(settings: Omit<Settings, 'profiles'>) {
  return fetchJson<Settings>('/api/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  })
}

export function getTracks() {
  return fetchJson<TrackSummary[]>('/api/tracks')
}

export function getTrack(trackId: string) {
  return fetchJson<TrackDetail>(`/api/tracks/${trackId}`)
}

export async function importLocalTracks(formData: FormData) {
  await fetchJson('/api/tracks/import', {
    method: 'POST',
    body: formData,
  })
}

export function createRun(trackId: string, processing: RunProcessingConfigInput) {
  return fetchJson<{ run: RunSummary }>(`/api/tracks/${trackId}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ processing }),
  })
}

export function resolveYouTubeImport(sourceUrl: string) {
  return fetchJson<ResolveYouTubeImportResponse>('/api/imports/youtube/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source_url: sourceUrl }),
  })
}

export function confirmYouTubeImport(payload: ConfirmYouTubeImportPayload) {
  return fetchJson<ConfirmYouTubeImportResponse>('/api/imports/youtube/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}
