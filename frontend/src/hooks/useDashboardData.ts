import { useEffect, useRef, useState } from 'react'

import {
  confirmYouTubeImport,
  createRun,
  getDiagnostics,
  getSettings,
  getTrack,
  getTracks,
  importLocalTracks,
  resolveYouTubeImport,
  updateSettings,
} from '../api'
import type {
  ConfirmYouTubeImportPayload,
  Diagnostics,
  ResolveYouTubeImportResponse,
  RunProcessingConfigInput,
  Settings,
  TrackDetail,
  TrackSummary,
} from '../types'

const REFRESH_INTERVAL_MS = 3000

type Notice = {
  tone: 'success' | 'error'
  message: string
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected application error.'
}

function resolveSelectedTrackId(tracks: TrackSummary[], currentSelection: string | null) {
  if (!tracks.length) {
    return null
  }

  if (currentSelection && tracks.some((track) => track.id === currentSelection)) {
    return currentSelection
  }

  return tracks[0].id
}

function resolveSelectedRunId(track: TrackDetail | null, currentSelection: string | null) {
  if (!track?.runs.length) {
    return null
  }

  if (currentSelection && track.runs.some((run) => run.id === currentSelection)) {
    return currentSelection
  }

  return track.runs[0].id
}

export function useDashboardData() {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tracks, setTracks] = useState<TrackSummary[]>([])
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<TrackDetail | null>(null)
  const [youtubeResolution, setYoutubeResolution] = useState<ResolveYouTubeImportResponse | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [importing, setImporting] = useState(false)
  const [resolvingImport, setResolvingImport] = useState(false)
  const [confirmingImport, setConfirmingImport] = useState(false)
  const [creatingRun, setCreatingRun] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  const selectedTrackIdRef = useRef<string | null>(selectedTrackId)
  const selectedRunIdRef = useRef<string | null>(selectedRunId)

  useEffect(() => {
    selectedTrackIdRef.current = selectedTrackId
  }, [selectedTrackId])

  useEffect(() => {
    selectedRunIdRef.current = selectedRunId
  }, [selectedRunId])

  async function refreshDashboard() {
    try {
      const [nextDiagnostics, nextSettings, nextTracks] = await Promise.all([getDiagnostics(), getSettings(), getTracks()])
      const nextSelectedTrackId = resolveSelectedTrackId(nextTracks, selectedTrackIdRef.current)

      setDiagnostics(nextDiagnostics)
      setSettings(nextSettings)
      setTracks(nextTracks)
      setSelectedTrackId(nextSelectedTrackId)

      if (!nextSelectedTrackId) {
        setSelectedTrack(null)
        setSelectedRunId(null)
        return
      }

      const nextTrack = await getTrack(nextSelectedTrackId)
      const nextSelectedRunId = resolveSelectedRunId(nextTrack, selectedRunIdRef.current)
      setSelectedTrack(nextTrack)
      setSelectedRunId(nextSelectedRunId)
    } catch (error) {
      setNotice({ tone: 'error', message: getErrorMessage(error) })
    }
  }

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void refreshDashboard()
    }, 0)
    const intervalId = window.setInterval(() => {
      void refreshDashboard()
    }, REFRESH_INTERVAL_MS)

    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
    }
  }, [])

  async function handleLocalImport(formData: FormData) {
    setImporting(true)
    try {
      await importLocalTracks(formData)
      setNotice({ tone: 'success', message: 'Tracks created and added to the local worker queue.' })
      await refreshDashboard()
    } catch (error) {
      setNotice({ tone: 'error', message: getErrorMessage(error) })
    } finally {
      setImporting(false)
    }
  }

  async function handleResolveYouTube(sourceUrl: string) {
    setResolvingImport(true)
    try {
      const resolution = await resolveYouTubeImport(sourceUrl)
      setYoutubeResolution(resolution)
      setNotice({
        tone: 'success',
        message:
          resolution.source_kind === 'playlist'
            ? `Resolved ${resolution.item_count} playlist entries. Review them before queueing.`
            : 'Resolved the YouTube source. Review metadata and processing settings before queueing.',
      })
    } catch (error) {
      const message = getErrorMessage(error)
      setYoutubeResolution(null)
      setNotice({ tone: 'error', message })
      throw error
    } finally {
      setResolvingImport(false)
    }
  }

  async function handleConfirmYouTube(payload: ConfirmYouTubeImportPayload) {
    setConfirmingImport(true)
    try {
      const result = await confirmYouTubeImport(payload)
      setYoutubeResolution(null)
      setNotice({
        tone: 'success',
        message: `Queued ${result.tracks.length} track${result.tracks.length === 1 ? '' : 's'} from YouTube import.`,
      })
      await refreshDashboard()
    } catch (error) {
      setNotice({ tone: 'error', message: getErrorMessage(error) })
      throw error
    } finally {
      setConfirmingImport(false)
    }
  }

  function handleDiscardYouTubeReview() {
    setYoutubeResolution(null)
  }

  async function handleCreateRun(trackId: string, processing: RunProcessingConfigInput) {
    setCreatingRun(true)
    try {
      await createRun(trackId, processing)
      setNotice({ tone: 'success', message: 'A new run was added to the queue.' })
      await refreshDashboard()
    } catch (error) {
      setNotice({ tone: 'error', message: getErrorMessage(error) })
    } finally {
      setCreatingRun(false)
    }
  }

  async function handleSaveSettings(payload: Omit<Settings, 'profiles'>) {
    setSavingSettings(true)
    try {
      await updateSettings(payload)
      setNotice({ tone: 'success', message: 'Local settings saved.' })
      await refreshDashboard()
    } catch (error) {
      setNotice({ tone: 'error', message: getErrorMessage(error) })
    } finally {
      setSavingSettings(false)
    }
  }

  return {
    diagnostics,
    settings,
    tracks,
    selectedTrack,
    selectedTrackId,
    selectedRunId,
    youtubeResolution,
    notice,
    importing,
    resolvingImport,
    confirmingImport,
    creatingRun,
    savingSettings,
    setSelectedTrackId,
    setSelectedRunId,
    handleLocalImport,
    handleResolveYouTube,
    handleConfirmYouTube,
    handleDiscardYouTubeReview,
    handleCreateRun,
    handleSaveSettings,
  }
}
