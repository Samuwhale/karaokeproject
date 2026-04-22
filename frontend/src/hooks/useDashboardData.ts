import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  backfillMetrics,
  batchApplyTrackFields,
  batchCancelTrackRuns,
  batchDeleteTracks,
  batchDiscardImportDrafts,
  batchPurgeNonKeepers,
  batchQueueRuns,
  batchUpdateImportDrafts,
  cancelRun,
  cleanupExportBundles,
  cleanupNonKeeperRunsLibrary,
  cleanupTempStorage,
  confirmImportDrafts,
  createRun,
  discardImportDraft,
  dismissRun,
  getActiveRuns,
  getDiagnostics,
  getSettings,
  getStorageOverview,
  getTrack,
  getTracks,
  listImportDrafts,
  purgeNonKeeperRuns,
  resolveLocalImport,
  resolveYouTubeImport,
  retryRun,
  revealFolder,
  setKeeperRun,
  setRunNote,
  stepUpRun,
  updateImportDraft,
  updateRunMix,
  updateSettings,
  updateTrack,
} from '../api'
import type { Toast, ToastAction, ToastTone } from '../components/feedback/ToastStack'
import type {
  BatchUpdateImportDraftInput,
  ConfirmImportDraftsInput,
  Diagnostics,
  ExportBundleCleanupResponse,
  ImportDraft,
  NonKeeperCleanupResponse,
  QueueRunEntry,
  RevealFolderInput,
  RunMixStemEntry,
  RunProcessingConfigInput,
  Settings,
  StorageOverview,
  TempCleanupResponse,
  TrackDetail,
  TrackSummary,
  UpdateImportDraftInput,
} from '../types'

const IDLE_REFRESH_MS = 3000
const ACTIVE_REFRESH_MS = 1000
const MAX_REFRESH_MS = 30000
const DELETE_UNDO_MS = 5000
const PURGE_UNDO_MS = 5000

const ACTIVE_RUN_STATUSES = new Set(['queued', 'preparing', 'separating', 'exporting'])

export type ConnectionState = 'ready' | 'syncing' | 'offline'
export type DashboardSurface = 'inbox' | 'queue' | 'library'

export type Connection = {
  state: ConnectionState
  consecutiveFailures: number
  lastSyncAt: number
  nextRetryAt: number | null
  lastError: string | null
}

type PendingPurge = {
  trackId: string
  runIds: Set<string>
}

const INITIAL_CONNECTION: Connection = {
  state: 'syncing',
  consecutiveFailures: 0,
  lastSyncAt: 0,
  nextRetryAt: null,
  lastError: null,
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unexpected application error.'
}

function resolveSelectedTrackId(tracks: TrackSummary[], currentSelection: string | null) {
  if (!tracks.length) return null
  if (currentSelection && tracks.some((track) => track.id === currentSelection)) return currentSelection
  return tracks[0].id
}

function resolveSelectedRunId(track: TrackDetail | null, currentSelection: string | null) {
  if (!track?.runs.length) return null
  if (currentSelection && track.runs.some((run) => run.id === currentSelection)) return currentSelection
  return track.runs[0].id
}

function hasActiveWork(track: TrackDetail | null, queueSize: number) {
  if (queueSize > 0) return true
  return !!track?.runs.some((run) => ACTIVE_RUN_STATUSES.has(run.status))
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function useDashboardData() {
  const [activeSurface, setActiveSurface] = useState<DashboardSurface>('library')
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [storageOverview, setStorageOverview] = useState<StorageOverview | null>(null)
  const [tracks, setTracks] = useState<TrackSummary[]>([])
  const [drafts, setDrafts] = useState<ImportDraft[]>([])
  const [queueRuns, setQueueRuns] = useState<QueueRunEntry[]>([])

  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<TrackDetail | null>(null)

  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set())
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set())
  const [selectedQueueRunIds, setSelectedQueueRunIds] = useState<Set<string>>(new Set())

  const [toasts, setToasts] = useState<Toast[]>([])
  const [resolvingYoutubeImport, setResolvingYoutubeImport] = useState(false)
  const [resolvingLocalImport, setResolvingLocalImport] = useState(false)
  const [confirmingDrafts, setConfirmingDrafts] = useState(false)
  const [creatingRun, setCreatingRun] = useState(false)
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null)
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null)
  const [steppingUpRunId, setSteppingUpRunId] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [cleaningTempStorage, setCleaningTempStorage] = useState(false)
  const [cleaningExportBundles, setCleaningExportBundles] = useState(false)
  const [cleaningLibraryRuns, setCleaningLibraryRuns] = useState(false)
  const [connection, setConnection] = useState<Connection>(INITIAL_CONNECTION)
  const [compareRunId, setCompareRunId] = useState<string | null>(null)
  const [settingKeeper, setSettingKeeper] = useState(false)
  const [backfillingMetrics, setBackfillingMetrics] = useState(false)
  const [savingNoteRunId, setSavingNoteRunId] = useState<string | null>(null)
  const [savingMixRunId, setSavingMixRunId] = useState<string | null>(null)
  const [updatingTrack, setUpdatingTrack] = useState(false)
  const [batching, setBatching] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set())
  const [pendingPurge, setPendingPurge] = useState<PendingPurge | null>(null)

  const selectedTrackIdRef = useRef<string | null>(selectedTrackId)
  const selectedRunIdRef = useRef<string | null>(selectedRunId)
  const refreshIntervalMsRef = useRef<number>(IDLE_REFRESH_MS)
  const lastPollAtRef = useRef<number>(0)
  const inFlightRef = useRef<boolean>(false)
  const pendingDeleteTimerRef = useRef<number | null>(null)
  const pendingDeleteIdsRef = useRef<Set<string>>(pendingDeleteIds)
  const pendingPurgeTimerRef = useRef<number | null>(null)
  const pendingPurgeRef = useRef<PendingPurge | null>(pendingPurge)
  const pendingLibraryCleanupTimerRef = useRef<number | null>(null)

  useEffect(() => {
    selectedTrackIdRef.current = selectedTrackId
  }, [selectedTrackId])
  useEffect(() => {
    selectedRunIdRef.current = selectedRunId
  }, [selectedRunId])

  const pushToast = useCallback(
    (tone: ToastTone, message: string, options?: { autoDismissMs?: number | null; action?: ToastAction }) => {
      const toast: Toast = {
        id: createId(),
        tone,
        message,
        createdAt: Date.now(),
        autoDismissMs:
          options?.autoDismissMs !== undefined
            ? options.autoDismissMs
            : tone === 'error'
              ? null
              : 4000,
        action: options?.action,
      }
      setToasts((current) => [...current, toast])
    },
    [],
  )

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  async function refreshDashboard() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    lastPollAtRef.current = Date.now()

    try {
      const [nextDiagnostics, nextSettings, nextStorageOverview, nextTracks, nextDrafts, nextQueue] = await Promise.all([
        getDiagnostics(),
        getSettings(),
        getStorageOverview(),
        getTracks(),
        listImportDrafts(),
        getActiveRuns(),
      ])
      const pending = pendingDeleteIdsRef.current
      const visibleNextTracks = pending.size
        ? nextTracks.filter((track) => !pending.has(track.id))
        : nextTracks
      const nextSelectedTrackId = resolveSelectedTrackId(visibleNextTracks, selectedTrackIdRef.current)

      setDiagnostics(nextDiagnostics)
      setSettings(nextSettings)
      setStorageOverview(nextStorageOverview)
      setTracks(nextTracks)
      setDrafts(nextDrafts)
      setQueueRuns(nextQueue)

      // Prune stale selections
      setSelectedLibraryIds((current) => {
        const valid = new Set(nextTracks.map((track) => track.id))
        const next = new Set<string>()
        for (const id of current) if (valid.has(id)) next.add(id)
        return next.size === current.size ? current : next
      })
      setSelectedDraftIds((current) => {
        const valid = new Set(nextDrafts.map((draft) => draft.id))
        const next = new Set<string>()
        for (const id of current) if (valid.has(id)) next.add(id)
        return next.size === current.size ? current : next
      })
      setSelectedQueueRunIds((current) => {
        const valid = new Set(nextQueue.map((entry) => entry.run.id))
        const next = new Set<string>()
        for (const id of current) if (valid.has(id)) next.add(id)
        return next.size === current.size ? current : next
      })

      setSelectedTrackId(nextSelectedTrackId)

      if (!nextSelectedTrackId) {
        setSelectedTrack(null)
        setSelectedRunId(null)
        refreshIntervalMsRef.current = nextQueue.length > 0 ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS
      } else {
        const nextTrack = await getTrack(nextSelectedTrackId)
        const nextSelectedRunId = resolveSelectedRunId(nextTrack, selectedRunIdRef.current)
        setSelectedTrack(nextTrack)
        setSelectedRunId(nextSelectedRunId)
        refreshIntervalMsRef.current = hasActiveWork(nextTrack, nextQueue.length)
          ? ACTIVE_REFRESH_MS
          : IDLE_REFRESH_MS
      }

      setConnection({
        state: 'ready',
        consecutiveFailures: 0,
        lastSyncAt: Date.now(),
        nextRetryAt: null,
        lastError: null,
      })
    } catch (error) {
      const message = getErrorMessage(error)
      setConnection((current) => {
        const failures = current.consecutiveFailures + 1
        const backoff = Math.min(IDLE_REFRESH_MS * 2 ** failures, MAX_REFRESH_MS)
        refreshIntervalMsRef.current = backoff
        return {
          state: 'offline',
          consecutiveFailures: failures,
          lastSyncAt: current.lastSyncAt,
          nextRetryAt: Date.now() + backoff,
          lastError: message,
        }
      })
    } finally {
      inFlightRef.current = false
    }
  }

  useEffect(() => {
    let disposed = false

    const initialLoadId = window.setTimeout(() => {
      void refreshDashboard()
    }, 0)

    function tick() {
      if (disposed) return
      if (document.hidden) return
      const sinceLast = Date.now() - lastPollAtRef.current
      if (sinceLast < refreshIntervalMsRef.current) return
      void refreshDashboard()
    }

    const intervalId = window.setInterval(tick, 500)

    function handleVisibility() {
      if (!document.hidden) void refreshDashboard()
    }

    function flushPendingDestructive() {
      const pendingIds = Array.from(pendingDeleteIdsRef.current)
      if (pendingIds.length) {
        fetch('/api/tracks/batch/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ track_ids: pendingIds }),
          keepalive: true,
        }).catch(() => undefined)
      }
      const purge = pendingPurgeRef.current
      if (purge) {
        fetch(`/api/tracks/${purge.trackId}/purge-non-keepers`, {
          method: 'POST',
          keepalive: true,
        }).catch(() => undefined)
      }
      if (pendingLibraryCleanupTimerRef.current !== null) {
        fetch('/api/storage/cleanup/non-keeper-runs', {
          method: 'POST',
          keepalive: true,
        }).catch(() => undefined)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', flushPendingDestructive)

    return () => {
      disposed = true
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', flushPendingDestructive)
    }
  }, [])

  // ----- Surface + selection helpers -----

  function focusSurface(surface: DashboardSurface) {
    setActiveSurface(surface)
  }

  function toggleDraftSelected(draftId: string) {
    setSelectedDraftIds((current) => toggleInSet(current, draftId))
  }
  function toggleLibrarySelected(trackId: string) {
    setSelectedLibraryIds((current) => toggleInSet(current, trackId))
  }
  function toggleQueueRunSelected(runId: string) {
    setSelectedQueueRunIds((current) => toggleInSet(current, runId))
  }
  function clearSelection(surface: DashboardSurface) {
    if (surface === 'inbox') setSelectedDraftIds(new Set())
    if (surface === 'library') setSelectedLibraryIds(new Set())
    if (surface === 'queue') setSelectedQueueRunIds(new Set())
  }
  function selectAll(surface: DashboardSurface, ids: string[]) {
    if (surface === 'inbox') setSelectedDraftIds(new Set(ids))
    if (surface === 'library') setSelectedLibraryIds(new Set(ids))
    if (surface === 'queue') setSelectedQueueRunIds(new Set(ids))
  }

  // ----- Import (Add Sources) -----

  async function handleResolveYouTube(sourceUrl: string) {
    setResolvingYoutubeImport(true)
    try {
      const result = await resolveYouTubeImport(sourceUrl)
      pushToast(
        'success',
        result.source_kind === 'playlist'
          ? `Added ${result.drafts.length} drafts to Inbox.`
          : 'Added draft to Inbox.',
      )
      setActiveSurface('inbox')
      await refreshDashboard()
    } finally {
      setResolvingYoutubeImport(false)
    }
  }

  async function handleResolveLocalImport(files: File[]) {
    setResolvingLocalImport(true)
    try {
      const result = await resolveLocalImport(files)
      pushToast(
        'success',
        `Staged ${result.drafts.length} draft${result.drafts.length === 1 ? '' : 's'} in Inbox.`,
      )
      setActiveSurface('inbox')
      await refreshDashboard()
    } finally {
      setResolvingLocalImport(false)
    }
  }

  // ----- Inbox (drafts) -----

  async function handleUpdateDraft(draftId: string, payload: UpdateImportDraftInput) {
    try {
      await updateImportDraft(draftId, payload)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    }
  }

  async function handleBatchUpdateDrafts(payload: BatchUpdateImportDraftInput) {
    if (!payload.draft_ids.length) return
    setBatching(true)
    try {
      await batchUpdateImportDrafts(payload)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setBatching(false)
    }
  }

  async function handleDiscardDraft(draftId: string) {
    try {
      await discardImportDraft(draftId)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    }
  }

  async function handleBatchDiscardDrafts(draftIds: string[]) {
    if (!draftIds.length) return
    setBatching(true)
    try {
      await batchDiscardImportDrafts({ draft_ids: draftIds })
      setSelectedDraftIds(new Set())
      pushToast('success', `Discarded ${draftIds.length} draft${draftIds.length === 1 ? '' : 's'}.`)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setBatching(false)
    }
  }

  async function handleConfirmDrafts(payload: ConfirmImportDraftsInput) {
    if (!payload.draft_ids.length) return
    setConfirmingDrafts(true)
    try {
      const result = await confirmImportDrafts(payload)
      setSelectedDraftIds(new Set())
      const createdMsg = result.created_track_count
        ? `${result.created_track_count} new track${result.created_track_count === 1 ? '' : 's'}`
        : ''
      const reusedMsg = result.reused_track_count
        ? `${result.reused_track_count} reused`
        : ''
      const queuedMsg = result.queued_run_count
        ? `${result.queued_run_count} queued`
        : 'no runs queued'
      const parts = [createdMsg, reusedMsg, queuedMsg].filter(Boolean)
      pushToast('success', `Confirmed: ${parts.join(' · ')}.`)
      if (result.queued_run_count > 0) setActiveSurface('queue')
      else setActiveSurface('library')
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setConfirmingDrafts(false)
    }
  }

  // ----- Runs -----

  async function handleCreateRun(trackId: string, processing: RunProcessingConfigInput) {
    setCreatingRun(true)
    try {
      await createRun(trackId, processing)
      pushToast('success', 'Render queued.')
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setCreatingRun(false)
    }
  }

  async function handleCancelRun(runId: string) {
    setCancellingRunId(runId)
    try {
      await cancelRun(runId)
      pushToast('success', 'Cancellation requested.')
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setCancellingRunId(null)
    }
  }

  async function handleDismissRun(runId: string) {
    try {
      await dismissRun(runId)
      setSelectedQueueRunIds((current) => {
        if (!current.has(runId)) return current
        const next = new Set(current)
        next.delete(runId)
        return next
      })
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    }
  }

  async function handleRevealFolder(payload: RevealFolderInput) {
    try {
      await revealFolder(payload)
    } catch (error) {
      pushToast('error', getErrorMessage(error))
    }
  }

  async function handleRetryRun(runId: string) {
    setRetryingRunId(runId)
    try {
      const result = await retryRun(runId)
      pushToast('success', 'Retry queued with the same config.')
      await refreshDashboard()
      setSelectedRunId(result.run.id)
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setRetryingRunId(null)
    }
  }

  async function handleStepUpRun(runId: string) {
    setSteppingUpRunId(runId)
    try {
      const result = await stepUpRun(runId)
      pushToast('success', 'Queued a higher-quality render.')
      await refreshDashboard()
      setSelectedRunId(result.run.id)
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setSteppingUpRunId(null)
    }
  }

  async function handleSetKeeper(trackId: string, runId: string | null) {
    setSettingKeeper(true)
    try {
      await setKeeperRun(trackId, runId)
      if (runId) setCompareRunId(null)
      pushToast('success', runId ? 'Marked as final.' : 'Cleared final.')
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setSettingKeeper(false)
    }
  }

  function setPendingPurgeImmediate(next: PendingPurge | null) {
    pendingPurgeRef.current = next
    setPendingPurge(next)
  }

  async function commitPurge(trackId: string) {
    try {
      await purgeNonKeeperRuns(trackId)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      if (pendingPurgeRef.current?.trackId === trackId) {
        setPendingPurgeImmediate(null)
      }
    }
  }

  function restorePendingPurge(trackId: string) {
    if (pendingPurgeTimerRef.current === null) return
    if (pendingPurgeRef.current?.trackId !== trackId) return
    window.clearTimeout(pendingPurgeTimerRef.current)
    pendingPurgeTimerRef.current = null
    setPendingPurgeImmediate(null)
  }

  function handlePurgeNonKeepers(trackId: string) {
    const source = selectedTrack?.id === trackId ? selectedTrack : null
    const keeperId = source?.keeper_run_id ?? null
    const targetRunIds = source
      ? source.runs
          .filter(
            (run) =>
              run.id !== keeperId &&
              (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled'),
          )
          .map((run) => run.id)
      : []

    if (pendingPurgeTimerRef.current !== null) {
      const previous = pendingPurgeRef.current
      window.clearTimeout(pendingPurgeTimerRef.current)
      pendingPurgeTimerRef.current = null
      if (previous) void commitPurge(previous.trackId)
    }

    setPendingPurgeImmediate({ trackId, runIds: new Set(targetRunIds) })
    if (compareRunId && targetRunIds.includes(compareRunId)) setCompareRunId(null)
    if (selectedRunIdRef.current && targetRunIds.includes(selectedRunIdRef.current)) {
      setSelectedRunId(null)
    }

    pushToast(
      'success',
      targetRunIds.length
        ? `Deleted ${targetRunIds.length} other run${targetRunIds.length === 1 ? '' : 's'}.`
        : 'Purged other runs.',
      {
        autoDismissMs: PURGE_UNDO_MS,
        action: {
          label: 'Undo',
          onInvoke: () => restorePendingPurge(trackId),
        },
      },
    )

    pendingPurgeTimerRef.current = window.setTimeout(() => {
      pendingPurgeTimerRef.current = null
      void commitPurge(trackId)
    }, PURGE_UNDO_MS)
  }

  async function handleBackfillMetrics() {
    setBackfillingMetrics(true)
    try {
      const result = await backfillMetrics()
      pushToast(
        'success',
        `Backfilled metrics for ${result.updated_artifact_count} artifact${result.updated_artifact_count === 1 ? '' : 's'}.`,
      )
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setBackfillingMetrics(false)
    }
  }

  async function handleUpdateTrack(trackId: string, payload: { title?: string; artist?: string | null }) {
    setUpdatingTrack(true)
    try {
      await updateTrack(trackId, payload)
      pushToast('success', 'Track updated.')
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setUpdatingTrack(false)
    }
  }

  function handleDeleteTrack(trackId: string) {
    scheduleTrackDelete([trackId])
  }

  async function handleSaveMix(trackId: string, runId: string, stems: RunMixStemEntry[]) {
    setSavingMixRunId(runId)
    try {
      await updateRunMix(trackId, runId, stems)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setSavingMixRunId(null)
    }
  }

  async function handleSetRunNote(runId: string, note: string) {
    setSavingNoteRunId(runId)
    try {
      await setRunNote(runId, note)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setSavingNoteRunId(null)
    }
  }

  // ----- Batch track ops (library surface) -----

  async function handleBatchQueueRuns(trackIds: string[], processing: RunProcessingConfigInput) {
    if (!trackIds.length) return
    setBatching(true)
    try {
      const result = await batchQueueRuns({ track_ids: trackIds, processing })
      pushToast(
        'success',
        `Queued ${result.queued_run_count} run${result.queued_run_count === 1 ? '' : 's'}.`,
      )
      setActiveSurface('queue')
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setBatching(false)
    }
  }

  async function handleBatchApplyArtist(trackIds: string[], artist: string | null) {
    if (!trackIds.length) return
    setBatching(true)
    try {
      const result = await batchApplyTrackFields({ track_ids: trackIds, artist })
      pushToast('success', `Updated ${result.updated_track_count} track${result.updated_track_count === 1 ? '' : 's'}.`)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setBatching(false)
    }
  }

  function setPendingDeleteIdsImmediate(next: Set<string>) {
    pendingDeleteIdsRef.current = next
    setPendingDeleteIds(next)
  }

  async function commitTrackDelete(trackIds: string[]) {
    if (!trackIds.length) return
    setBatching(true)
    try {
      await batchDeleteTracks({ track_ids: trackIds })
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      const next = new Set(pendingDeleteIdsRef.current)
      for (const id of trackIds) next.delete(id)
      setPendingDeleteIdsImmediate(next)
    } finally {
      setBatching(false)
    }
  }

  function restorePendingDelete(ids: string[]) {
    if (pendingDeleteTimerRef.current === null) return
    const current = pendingDeleteIdsRef.current
    if (ids.length !== current.size || !ids.every((id) => current.has(id))) return
    window.clearTimeout(pendingDeleteTimerRef.current)
    pendingDeleteTimerRef.current = null
    setPendingDeleteIdsImmediate(new Set())
  }

  function scheduleTrackDelete(trackIds: string[]) {
    if (!trackIds.length) return
    if (pendingDeleteTimerRef.current !== null) {
      const previous = Array.from(pendingDeleteIdsRef.current)
      window.clearTimeout(pendingDeleteTimerRef.current)
      pendingDeleteTimerRef.current = null
      if (previous.length) void commitTrackDelete(previous)
    }
    const scheduled = [...trackIds]
    setPendingDeleteIdsImmediate(new Set(scheduled))
    setSelectedLibraryIds(new Set())
    if (selectedTrackIdRef.current && scheduled.includes(selectedTrackIdRef.current)) {
      setSelectedTrackId(null)
      setSelectedTrack(null)
      setSelectedRunId(null)
      setCompareRunId(null)
    }
    pushToast(
      'success',
      `Deleted ${scheduled.length} track${scheduled.length === 1 ? '' : 's'}.`,
      {
        autoDismissMs: DELETE_UNDO_MS,
        action: {
          label: 'Undo',
          onInvoke: () => restorePendingDelete(scheduled),
        },
      },
    )
    pendingDeleteTimerRef.current = window.setTimeout(() => {
      pendingDeleteTimerRef.current = null
      void commitTrackDelete(scheduled)
    }, DELETE_UNDO_MS)
  }

  function handleBatchDeleteTracks(trackIds: string[]) {
    scheduleTrackDelete(trackIds)
  }

  async function handleBatchCancelTrackRuns(trackIds: string[]) {
    if (!trackIds.length) return
    setBatching(true)
    try {
      const result = await batchCancelTrackRuns({ track_ids: trackIds })
      pushToast(
        'success',
        `Cancelled ${result.cancelled_run_count} run${result.cancelled_run_count === 1 ? '' : 's'}.`,
      )
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setBatching(false)
    }
  }

  async function handleBatchPurgeNonKeepers(trackIds: string[]) {
    if (!trackIds.length) return
    setBatching(true)
    try {
      const result = await batchPurgeNonKeepers({ track_ids: trackIds })
      const mb = (result.bytes_reclaimed / (1024 * 1024)).toFixed(1)
      pushToast(
        'success',
        `Purged ${result.deleted_run_count} runs across ${result.purged_track_count} tracks · ${mb} MB reclaimed.`,
      )
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setBatching(false)
    }
  }

  async function handleBatchCancelQueueRuns(runIds: string[]) {
    if (!runIds.length) return
    setBatching(true)
    try {
      await Promise.all(runIds.map((id) => cancelRun(id).catch(() => null)))
      setSelectedQueueRunIds(new Set())
      pushToast('success', `Cancellation requested for ${runIds.length} run${runIds.length === 1 ? '' : 's'}.`)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setBatching(false)
    }
  }

  function handleToggleCompare(runId: string) {
    setCompareRunId((current) => (current === runId ? null : runId))
  }

  function handleSelectTrack(trackId: string | null) {
    setSelectedTrackId(trackId)
    setSelectedRunId(null)
    setCompareRunId(null)
  }

  async function handleSaveSettings(payload: Omit<Settings, 'profiles'>) {
    setSavingSettings(true)
    try {
      await updateSettings(payload)
      pushToast('success', 'Preferences saved.')
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setSavingSettings(false)
    }
  }

  function formatReclaimed(bytes: number) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function handleCleanupTempStorage() {
    setCleaningTempStorage(true)
    try {
      const result: TempCleanupResponse = await cleanupTempStorage()
      pushToast(
        'success',
        `Cleared ${result.deleted_entry_count} temp item${result.deleted_entry_count === 1 ? '' : 's'} · ${formatReclaimed(result.bytes_reclaimed)} reclaimed.`,
      )
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setCleaningTempStorage(false)
    }
  }

  async function handleCleanupExportBundles() {
    setCleaningExportBundles(true)
    try {
      const result: ExportBundleCleanupResponse = await cleanupExportBundles()
      pushToast(
        'success',
        `Deleted ${result.deleted_bundle_count} export bundle${result.deleted_bundle_count === 1 ? '' : 's'} · ${formatReclaimed(result.bytes_reclaimed)} reclaimed.`,
      )
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setCleaningExportBundles(false)
    }
  }

  async function commitLibraryCleanup() {
    try {
      const result: NonKeeperCleanupResponse = await cleanupNonKeeperRunsLibrary()
      const skipped =
        result.skipped_track_count > 0
          ? ` · ${result.skipped_track_count} track${result.skipped_track_count === 1 ? '' : 's'} skipped`
          : ''
      pushToast(
        'success',
        `Purged ${result.deleted_run_count} non-final run${result.deleted_run_count === 1 ? '' : 's'} across ${result.purged_track_count} track${result.purged_track_count === 1 ? '' : 's'} · ${formatReclaimed(result.bytes_reclaimed)} reclaimed${skipped}.`,
      )
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
    } finally {
      setCleaningLibraryRuns(false)
    }
  }

  function restorePendingLibraryCleanup() {
    if (pendingLibraryCleanupTimerRef.current === null) return
    window.clearTimeout(pendingLibraryCleanupTimerRef.current)
    pendingLibraryCleanupTimerRef.current = null
    setCleaningLibraryRuns(false)
  }

  function handleCleanupLibraryRuns() {
    if (pendingLibraryCleanupTimerRef.current !== null) {
      window.clearTimeout(pendingLibraryCleanupTimerRef.current)
      pendingLibraryCleanupTimerRef.current = null
      void commitLibraryCleanup()
      return
    }
    setCleaningLibraryRuns(true)
    pushToast(
      'success',
      'Purging non-final runs across the library.',
      {
        autoDismissMs: PURGE_UNDO_MS,
        action: {
          label: 'Undo',
          onInvoke: () => restorePendingLibraryCleanup(),
        },
      },
    )
    pendingLibraryCleanupTimerRef.current = window.setTimeout(() => {
      pendingLibraryCleanupTimerRef.current = null
      void commitLibraryCleanup()
    }, PURGE_UNDO_MS)
  }

  const draftsNeedingAttention = drafts.filter(
    (draft) => draft.duplicate_action === null,
  ).length

  const visibleTracks = useMemo(
    () => (pendingDeleteIds.size ? tracks.filter((track) => !pendingDeleteIds.has(track.id)) : tracks),
    [tracks, pendingDeleteIds],
  )

  const visibleSelectedTrack = useMemo(() => {
    if (!selectedTrack) return null
    if (!pendingPurge || pendingPurge.trackId !== selectedTrack.id) return selectedTrack
    return {
      ...selectedTrack,
      runs: selectedTrack.runs.filter((run) => !pendingPurge.runIds.has(run.id)),
    }
  }, [selectedTrack, pendingPurge])

  return {
    activeSurface,
    focusSurface,
    diagnostics,
    settings,
    storageOverview,
    tracks: visibleTracks,
    drafts,
    queueRuns,
    draftsNeedingAttention,
    selectedTrack: visibleSelectedTrack,
    selectedTrackId,
    selectedRunId,
    selectedDraftIds,
    selectedLibraryIds,
    selectedQueueRunIds,
    toggleDraftSelected,
    toggleLibrarySelected,
    toggleQueueRunSelected,
    clearSelection,
    selectAll,
    toasts,
    dismissToast,
    pushToast,
    connection,
    resolvingYoutubeImport,
    resolvingLocalImport,
    confirmingDrafts,
    creatingRun,
    cancellingRunId,
    retryingRunId,
    steppingUpRunId,
    savingSettings,
    cleaningTempStorage,
    cleaningExportBundles,
    cleaningLibraryRuns,
    compareRunId,
    settingKeeper,
    backfillingMetrics,
    savingNoteRunId,
    savingMixRunId,
    updatingTrack,
    batching,
    setSelectedTrackId,
    setSelectedRunId,
    handleResolveYouTube,
    handleResolveLocalImport,
    handleUpdateDraft,
    handleBatchUpdateDrafts,
    handleDiscardDraft,
    handleBatchDiscardDrafts,
    handleConfirmDrafts,
    handleCreateRun,
    handleCancelRun,
    handleRetryRun,
    handleStepUpRun,
    handleDismissRun,
    handleRevealFolder,
    handleSaveSettings,
    handleCleanupTempStorage,
    handleCleanupExportBundles,
    handleCleanupLibraryRuns,
    handleSetKeeper,
    handlePurgeNonKeepers,
    handleBackfillMetrics,
    handleSetRunNote,
    handleSaveMix,
    handleUpdateTrack,
    handleDeleteTrack,
    handleToggleCompare,
    handleSelectTrack,
    handleBatchQueueRuns,
    handleBatchApplyArtist,
    handleBatchDeleteTracks,
    handleBatchCancelTrackRuns,
    handleBatchPurgeNonKeepers,
    handleBatchCancelQueueRuns,
    refreshDashboard,
  }
}

export type DashboardData = ReturnType<typeof useDashboardData>
