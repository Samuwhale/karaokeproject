import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

import {
  backfillMetrics,
  batchDeleteTracks,
  cancelRun,
  cleanupExportBundles,
  cleanupNonKeeperRunsLibrary,
  cleanupTempStorage,
  confirmImportDrafts,
  createRun,
  deleteRun,
  discardImportDraft,
  dismissRun,
  flushPendingLibraryCleanup,
  flushPendingTrackDeletes,
  getActiveRuns,
  getCachedModels,
  getDiagnostics,
  getSettings,
  getStorageOverview,
  getTrack,
  getTracks,
  listImportDrafts,
  resolveLocalImport,
  resolveYouTubeImport,
  retryRun,
  revealFolder,
  setKeeperRun,
  isApiError,
  updateImportDraft,
  updateRunMix,
  updateSettings,
  updateTrack,
} from '../api'
import { discardRejection } from '../async'
import type { Toast, ToastAction, ToastTone } from '../components/feedback/ToastStack'
import { isActiveRunStatus } from '../components/runStatus'
import type {
  CachedModel,
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

export type ConnectionState = 'ready' | 'syncing' | 'offline'

export type Connection = {
  state: ConnectionState
  consecutiveFailures: number
  lastSyncAt: number
  nextRetryAt: number | null
  lastError: string | null
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

function hasActiveWork(track: TrackDetail | null, queueSize: number) {
  if (queueSize > 0) return true
  return !!track?.runs.some((run) => isActiveRunStatus(run.status))
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clearTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current === null) return
  window.clearTimeout(timerRef.current)
  timerRef.current = null
}

async function loadTrackDetail(trackId: string) {
  try {
    return await getTrack(trackId)
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null
    throw error
  }
}

function resolveRefreshInterval(track: TrackDetail | null, queueSize: number) {
  return hasActiveWork(track, queueSize) ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS
}

export function useDashboardData(selection: { trackId: string | null }) {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [storageOverview, setStorageOverview] = useState<StorageOverview | null>(null)
  const [tracks, setTracks] = useState<TrackSummary[]>([])
  const [drafts, setDrafts] = useState<ImportDraft[]>([])
  const [queueRuns, setQueueRuns] = useState<QueueRunEntry[]>([])
  const [cachedModels, setCachedModels] = useState<CachedModel[]>([])

  const [selectedTrack, setSelectedTrack] = useState<TrackDetail | null>(null)

  const [toasts, setToasts] = useState<Toast[]>([])
  const [resolvingYoutubeImport, setResolvingYoutubeImport] = useState(false)
  const [resolvingLocalImport, setResolvingLocalImport] = useState(false)
  const [confirmingDrafts, setConfirmingDrafts] = useState(false)
  const [creatingRun, setCreatingRun] = useState(false)
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null)
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null)
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [cleaningTempStorage, setCleaningTempStorage] = useState(false)
  const [cleaningExportBundles, setCleaningExportBundles] = useState(false)
  const [cleaningLibraryRuns, setCleaningLibraryRuns] = useState(false)
  const [connection, setConnection] = useState<Connection>(INITIAL_CONNECTION)
  const [settingKeeper, setSettingKeeper] = useState(false)
  const [backfillingMetrics, setBackfillingMetrics] = useState(false)
  const [savingMixRunId, setSavingMixRunId] = useState<string | null>(null)
  const [updatingTrack, setUpdatingTrack] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set())

  const selectedTrackRef = useRef<TrackDetail | null>(selectedTrack)
  const routeTrackIdRef = useRef<string | null>(selection.trackId)
  const refreshIntervalMsRef = useRef<number>(IDLE_REFRESH_MS)
  const lastPollAtRef = useRef<number>(0)
  const inFlightRef = useRef<boolean>(false)
  const pendingDeleteTimerRef = useRef<number | null>(null)
  const pendingDeleteIdsRef = useRef<Set<string>>(pendingDeleteIds)
  const pendingLibraryCleanupTimerRef = useRef<number | null>(null)
  const selectedTrackRequestIdRef = useRef(0)
  const queueSizeRef = useRef(queueRuns.length)
  const prevQueueRunsRef = useRef<QueueRunEntry[]>([])

  useEffect(() => {
    selectedTrackRef.current = selectedTrack
  }, [selectedTrack])
  useEffect(() => {
    routeTrackIdRef.current = selection.trackId
  }, [selection.trackId])
  useEffect(() => {
    queueSizeRef.current = queueRuns.length
  }, [queueRuns.length])

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

  function formatTrackLabel(track: { title: string; artist: string | null }) {
    return track.artist ? `${track.title} · ${track.artist}` : track.title
  }

  function findTrackLabel(trackId: string) {
    const track = tracks.find((item) => item.id === trackId)
    return track ? formatTrackLabel(track) : 'this song'
  }

  function findRunTrackLabel(runId: string) {
    const queueEntry = queueRuns.find((entry) => entry.run.id === runId)
    if (queueEntry) {
      return queueEntry.track_artist
        ? `${queueEntry.track_title} · ${queueEntry.track_artist}`
        : queueEntry.track_title
    }

    if (selectedTrack?.runs.some((run) => run.id === runId)) return formatTrackLabel(selectedTrack)

    return 'this song'
  }

  const syncSelectedTrackDetail = useCallback(async (
    trackId: string | null,
    queueSize?: number,
  ) => {
    const requestId = ++selectedTrackRequestIdRef.current
    const nextQueueSize = queueSize ?? queueSizeRef.current

    if (!trackId) {
      setSelectedTrack(null)
      refreshIntervalMsRef.current = resolveRefreshInterval(null, nextQueueSize)
      return
    }

    if (selectedTrackRef.current?.id !== trackId) {
      setSelectedTrack(null)
    }

    const resolvedTrack = await loadTrackDetail(trackId)

    if (requestId !== selectedTrackRequestIdRef.current) return

    if (!resolvedTrack) {
      setSelectedTrack(null)
      refreshIntervalMsRef.current = resolveRefreshInterval(null, nextQueueSize)
      return
    }

    setSelectedTrack(resolvedTrack)
    refreshIntervalMsRef.current = resolveRefreshInterval(resolvedTrack, nextQueueSize)
  }, [])

  const refreshDashboard = useCallback(async () => {
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
      // Detect split completions/failures to surface a toast notification.
      const prevActive = prevQueueRunsRef.current.filter((e) => isActiveRunStatus(e.run.status))
      for (const entry of prevActive) {
        const stillActive = nextQueue.some((q) => q.run.id === entry.run.id && isActiveRunStatus(q.run.status))
        if (stillActive) continue
        const track = nextTracks.find((t) => t.id === entry.track_id)
        if (track?.latest_run?.id === entry.run.id) {
          if (track.latest_run.status === 'completed') {
            pushToast('success', `${entry.track_title} is ready to mix.`)
          } else if (track.latest_run.status === 'failed') {
            pushToast('error', `Split failed for ${entry.track_title}.`)
          }
        }
      }
      prevQueueRunsRef.current = nextQueue

      setDiagnostics(nextDiagnostics)
      setSettings(nextSettings)
      setStorageOverview(nextStorageOverview)
      setTracks(nextTracks)
      setDrafts(nextDrafts)
      setQueueRuns(nextQueue)

      await syncSelectedTrackDetail(routeTrackIdRef.current, nextQueue.length)

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
  }, [pushToast, syncSelectedTrackDetail])

  const refreshCachedModels = useCallback(async () => {
    try {
      const result = await getCachedModels()
      setCachedModels(result.items)
    } catch {
      // Non-critical: a missing cache directory just means the list stays empty.
    }
  }, [])

  useEffect(() => {
    let disposed = false

    const initialLoadId = window.setTimeout(() => {
      discardRejection(refreshDashboard)
      discardRejection(refreshCachedModels)
    }, 0)

    function tick() {
      if (disposed) return
      if (document.hidden) return
      const sinceLast = Date.now() - lastPollAtRef.current
      if (sinceLast < refreshIntervalMsRef.current) return
      discardRejection(refreshDashboard)
    }

    const intervalId = window.setInterval(tick, 500)

    function handleVisibility() {
      if (!document.hidden) discardRejection(refreshDashboard)
    }

    function flushPendingDestructive() {
      const pendingIds = Array.from(pendingDeleteIdsRef.current)
      flushPendingTrackDeletes(pendingIds)
      if (pendingLibraryCleanupTimerRef.current !== null) {
        flushPendingLibraryCleanup()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', flushPendingDestructive)

    return () => {
      disposed = true
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
      clearTimer(pendingDeleteTimerRef)
      clearTimer(pendingLibraryCleanupTimerRef)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', flushPendingDestructive)
    }
  }, [refreshCachedModels, refreshDashboard])

  useEffect(() => {
    const id = window.setTimeout(() => {
      discardRejection(() => syncSelectedTrackDetail(selection.trackId))
    }, 0)
    return () => window.clearTimeout(id)
  }, [selection.trackId, syncSelectedTrackDetail])

  // ----- Import (Add Sources) -----

  async function handleResolveYouTube(sourceUrl: string) {
    setResolvingYoutubeImport(true)
    try {
      const result = await resolveYouTubeImport(sourceUrl)
      const count = result.drafts.length
      pushToast(
        'success',
        `Staged ${count} source${count === 1 ? '' : 's'}. Review imports is the next step.`,
      )
      await refreshDashboard()
      return result
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setResolvingYoutubeImport(false)
    }
  }

  async function handleResolveLocalImport(files: File[]) {
    setResolvingLocalImport(true)
    try {
      const result = await resolveLocalImport(files)
      const count = result.drafts.length
      pushToast(
        'success',
        `Staged ${count} source${count === 1 ? '' : 's'}. Review imports is the next step.`,
      )
      await refreshDashboard()
      return result
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setResolvingLocalImport(false)
    }
  }

  // ----- Drafts -----

  async function handleUpdateDraft(draftId: string, payload: UpdateImportDraftInput) {
    try {
      await updateImportDraft(draftId, payload)
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
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

  async function handleConfirmDrafts(payload: ConfirmImportDraftsInput) {
    if (!payload.draft_ids.length) return
    setConfirmingDrafts(true)
    try {
      const result = await confirmImportDrafts(payload)
      const createdMsg = result.created_track_count
        ? `${result.created_track_count} new track${result.created_track_count === 1 ? '' : 's'}`
        : ''
      const reusedMsg = result.reused_track_count
        ? `${result.reused_track_count} reused`
        : ''
      const queuedMsg = result.queued_run_count
        ? `${result.queued_run_count} split${result.queued_run_count === 1 ? '' : 's'} queued`
        : 'imported without queueing'
      const parts = [createdMsg, reusedMsg, queuedMsg].filter(Boolean)
      pushToast('success', `Imported: ${parts.join(' · ')}.`)
      await refreshDashboard()
      return result
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
      const result = await createRun(trackId, processing)
      pushToast('success', `Queued a split for ${findTrackLabel(trackId)}.`)
      await refreshDashboard()
      return result
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setCreatingRun(false)
    }
  }

  async function handleBatchCreateRun(
    trackIds: string[],
    processing: RunProcessingConfigInput,
  ) {
    if (!trackIds.length) return
    setCreatingRun(true)
    try {
      const results = await Promise.allSettled(
        trackIds.map((id) => createRun(id, processing)),
      )
      const ok = results.filter((result) => result.status === 'fulfilled').length
      const failed = results.length - ok
      if (failed === 0) {
        pushToast('success', `Queued ${ok} split${ok === 1 ? '' : 's'}.`)
      } else if (ok === 0) {
        const firstError = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        )
        pushToast('error', getErrorMessage(firstError?.reason))
      } else {
        pushToast('error', `Queued ${ok} · ${failed} failed.`)
      }
      await refreshDashboard()
    } finally {
      setCreatingRun(false)
    }
  }

  async function handleCancelRun(runId: string) {
    setCancellingRunId(runId)
    try {
      await cancelRun(runId)
      pushToast('success', `Cancellation requested for ${findRunTrackLabel(runId)}.`)
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
      pushToast('success', `Cleared ${findRunTrackLabel(runId)} from queue follow-up.`)
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
      pushToast('success', `Queued another split for ${findRunTrackLabel(runId)} with the same setup.`)
      await refreshDashboard()
      return result
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setRetryingRunId(null)
    }
  }

  async function handleDeleteRun(runId: string) {
    setDeletingRunId(runId)
    try {
      await deleteRun(runId)
      pushToast('success', 'Deleted version.')
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setDeletingRunId(null)
    }
  }

  async function handleSetKeeper(trackId: string, runId: string | null) {
    setSettingKeeper(true)
    try {
      await setKeeperRun(trackId, runId)
      pushToast('success', runId ? 'Set final version.' : 'Cleared final version.')
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      throw error
    } finally {
      setSettingKeeper(false)
    }
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

  function handleBatchDeleteTracks(trackIds: string[]) {
    scheduleTrackDelete(trackIds)
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

  function setPendingDeleteIdsImmediate(next: Set<string>) {
    pendingDeleteIdsRef.current = next
    setPendingDeleteIds(next)
  }

  async function commitTrackDelete(trackIds: string[]) {
    if (!trackIds.length) return
    try {
      await batchDeleteTracks({ track_ids: trackIds })
      setPendingDeleteIdsImmediate(new Set())
      pushToast(
        'success',
        `Deleted ${trackIds.length} track${trackIds.length === 1 ? '' : 's'}.`,
      )
      await refreshDashboard()
    } catch (error) {
      pushToast('error', getErrorMessage(error))
      const next = new Set(pendingDeleteIdsRef.current)
      for (const id of trackIds) next.delete(id)
      setPendingDeleteIdsImmediate(next)
    }
  }

  function restorePendingDelete(ids: string[]) {
    if (pendingDeleteTimerRef.current === null) return
    const current = pendingDeleteIdsRef.current
    if (ids.length !== current.size || !ids.every((id) => current.has(id))) return
    clearTimer(pendingDeleteTimerRef)
    setPendingDeleteIdsImmediate(new Set())
  }

  function scheduleTrackDelete(trackIds: string[]) {
    if (!trackIds.length) return
    if (pendingDeleteTimerRef.current !== null) {
      const previous = Array.from(pendingDeleteIdsRef.current)
      clearTimer(pendingDeleteTimerRef)
      if (previous.length) {
        discardRejection(() => commitTrackDelete(previous))
      }
    }
    const scheduled = [...trackIds]
    setPendingDeleteIdsImmediate(new Set(scheduled))
    pushToast(
      'info',
      `Scheduled ${scheduled.length} track${scheduled.length === 1 ? '' : 's'} for deletion.`,
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
      discardRejection(() => commitTrackDelete(scheduled))
    }, DELETE_UNDO_MS)
  }

  async function handleSaveSettings(payload: Omit<Settings, 'profiles'>) {
    setSavingSettings(true)
    try {
      await updateSettings(payload)
      await refreshCachedModels()
      pushToast('success', 'Settings saved.')
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
        `Purged ${result.deleted_run_count} non-final render${result.deleted_run_count === 1 ? '' : 's'} across ${result.purged_track_count} track${result.purged_track_count === 1 ? '' : 's'} · ${formatReclaimed(result.bytes_reclaimed)} reclaimed${skipped}.`,
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
    clearTimer(pendingLibraryCleanupTimerRef)
    setCleaningLibraryRuns(false)
  }

  function handleCleanupLibraryRuns() {
    if (pendingLibraryCleanupTimerRef.current !== null) {
      clearTimer(pendingLibraryCleanupTimerRef)
      discardRejection(commitLibraryCleanup)
      return
    }
    setCleaningLibraryRuns(true)
    pushToast(
      'info',
      'Scheduled non-final render cleanup across the library.',
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
      discardRejection(commitLibraryCleanup)
    }, PURGE_UNDO_MS)
  }

  const visibleTracks = useMemo(
    () => (pendingDeleteIds.size ? tracks.filter((track) => !pendingDeleteIds.has(track.id)) : tracks),
    [tracks, pendingDeleteIds],
  )

  return {
    diagnostics,
    settings,
    storageOverview,
    tracks: visibleTracks,
    drafts,
    queueRuns,
    cachedModels,
    selectedTrack,
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
    deletingRunId,
    savingSettings,
    cleaningTempStorage,
    cleaningExportBundles,
    cleaningLibraryRuns,
    settingKeeper,
    backfillingMetrics,
    savingMixRunId,
    updatingTrack,
    handleResolveYouTube,
    handleResolveLocalImport,
    handleUpdateDraft,
    handleDiscardDraft,
    handleConfirmDrafts,
    handleCreateRun,
    handleBatchCreateRun,
    handleCancelRun,
    handleRetryRun,
    handleDeleteRun,
    handleDismissRun,
    handleRevealFolder,
    handleSaveSettings,
    handleCleanupTempStorage,
    handleCleanupExportBundles,
    handleCleanupLibraryRuns,
    handleSetKeeper,
    handleBackfillMetrics,
    handleSaveMix,
    handleUpdateTrack,
    handleDeleteTrack,
    handleBatchDeleteTracks,
  }
}

export type DashboardData = ReturnType<typeof useDashboardData>
