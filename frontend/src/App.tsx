import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom'

import './App.css'
import './redesign.css'
import { discardRejection } from './async'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ImportFlowDialog } from './components/ImportFlowDialog'
import { ImportsOverlay } from './components/imports/ImportsOverlay'
import { BatchExportOverlay } from './components/export/BatchExportOverlay'
import { SettingsDrawer } from './components/SettingsDrawer'
import { ToastStack } from './components/feedback/ToastStack'
import { BatchSplitOverlay } from './components/mix/BatchSplitOverlay'
import { MixWorkspace } from './components/mix/MixWorkspace'
import { SongsPage } from './components/songs/SongsPage'
import { applySongBrowse } from './components/trackListView'
import { useDashboardData } from './hooks/useDashboardData'
import type { Connection } from './hooks/useDashboardData'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { filterImportableMediaFiles } from './importableMedia'
import { buildMixPath, buildSongsPath, parseSongsView } from './routes'
import type { SongsView } from './routes'
import { resolveSelectedRun } from './runSelection'
import type { RunProcessingConfigInput, TrackSummary } from './types'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const mixMatch = useMatch('/mix/:trackId')
  const mixActive = !!mixMatch
  const mixTrackId = mixMatch?.params.trackId ?? null
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const mixRunId = mixActive ? searchParams.get('run') : null
  const routeSongsView = useMemo(() => parseSongsView(new URLSearchParams(location.search)), [location.search])
  const navigationState = location.state as { songsView?: SongsView } | null
  const rememberedSongsView = navigationState?.songsView ?? parseSongsView(new URLSearchParams())
  const songsView = !mixActive ? routeSongsView : rememberedSongsView

  const dashboard = useDashboardData({ trackId: mixTrackId })
  const {
    diagnostics,
    settings,
    storageOverview,
    tracks,
    drafts,
    queueRuns,
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
  } = dashboard

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsView, setSettingsView] = useState<'preferences' | 'maintenance' | 'storage'>(
    'preferences',
  )
  const [importOpen, setImportOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [batchExportIds, setBatchExportIds] = useState<string[] | null>(null)
  const [batchSplitIds, setBatchSplitIds] = useState<string[] | null>(null)
  const [dragOverlayActive, setDragOverlayActive] = useState(false)
  const dragCounterRef = useRef(0)

  const browseTracks = useMemo(
    () => applySongBrowse(tracks, { search: songsView.search, sort: songsView.sort }),
    [songsView.search, songsView.sort, tracks],
  )
  const defaultProcessing: RunProcessingConfigInput = {
    profile_key: settings?.default_profile ?? 'standard',
  }
  const defaultBitrate = settings?.export_mp3_bitrate ?? '320k'
  const hasFirstSync = connection.lastSyncAt > 0
  const setupRequired = hasFirstSync && diagnostics ? !diagnostics.app_ready : false

  function openSettings(view: 'preferences' | 'maintenance' | 'storage') {
    setSettingsView(view)
    setSettingsOpen(true)
  }

  function openSongs(view = rememberedSongsView) {
    navigate(buildSongsPath(view), { state: { songsView: view } })
  }

  function openMix(trackId: string, options?: { runId?: string | null }) {
    navigate(buildMixPath(trackId, { runId: options?.runId ?? null }), { state: { songsView } })
  }

  function openTrackWorkspace(track: TrackSummary, options?: { runId?: string | null }) {
    const runId = options?.runId ?? track.keeper_run_id ?? track.latest_run?.id ?? null
    openMix(track.id, { runId })
  }

  const revealImportReview = useEffectEvent(() => {
    if (mixActive) openSongs()
    setReviewOpen(true)
  })

  useEffect(() => {
    if (!mixActive) return
    const trackKnown = mixTrackId ? tracks.some((track) => track.id === mixTrackId) : false
    if (hasFirstSync && !selectedTrack && !trackKnown) {
      navigate(buildSongsPath(songsView), { replace: true, state: { songsView } })
      return
    }
    if (!selectedTrack) return

    const resolvedRun = resolveSelectedRun(selectedTrack, mixRunId)
    const nextPath = buildMixPath(selectedTrack.id, {
      runId: resolvedRun?.id ?? null,
    })

    if (`${location.pathname}${location.search}` !== nextPath) {
      navigate(nextPath, { replace: true, state: { songsView } })
    }
  }, [
    hasFirstSync,
    location.pathname,
    location.search,
    mixActive,
    mixRunId,
    mixTrackId,
    navigate,
    selectedTrack,
    songsView,
    tracks,
  ])

  useEffect(() => {
    if (importOpen) return

    function hasFiles(event: DragEvent) {
      return Array.from(event.dataTransfer?.types ?? []).includes('Files')
    }

    function onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return
      dragCounterRef.current += 1
      if (dragCounterRef.current === 1) setDragOverlayActive(true)
    }

    function onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
      if (dragCounterRef.current === 0) setDragOverlayActive(false)
    }

    function onDragOver(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
    }

    function onDrop(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragCounterRef.current = 0
      setDragOverlayActive(false)
      const files = filterImportableMediaFiles(event.dataTransfer?.files ?? [])
      if (files.length) {
        discardRejection(async () => {
          await handleResolveLocalImport(files)
          revealImportReview()
        })
        return
      }
      pushToast('error', 'Drop audio or video files to import them.')
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      dragCounterRef.current = 0
      setDragOverlayActive(false)
    }
  }, [handleResolveLocalImport, importOpen, pushToast])

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }

      const text = event.clipboardData?.getData('text/plain').trim() ?? ''
      if (!text || !/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\b/i.test(text)) return
      event.preventDefault()
      discardRejection(async () => {
        await handleResolveYouTube(text)
        revealImportReview()
      })
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleResolveYouTube])

  function selectAdjacentTrack(offset: number) {
    if (!browseTracks.length) return
    const currentIndex = mixTrackId ? browseTracks.findIndex((track) => track.id === mixTrackId) : -1
    const nextIndex =
      currentIndex < 0 ? 0 : Math.max(0, Math.min(browseTracks.length - 1, currentIndex + offset))
    const nextTrack = browseTracks[nextIndex]
    if (!nextTrack) return
    openTrackWorkspace(nextTrack)
  }

  useKeyboardShortcuts({
    onNavigateNext: () => selectAdjacentTrack(1),
    onNavigatePrev: () => selectAdjacentTrack(-1),
    onRerun: () => {
      if (!mixActive || !selectedTrack || creatingRun) return
      discardRejection(() => handleCreateRun(selectedTrack.id, defaultProcessing))
    },
    onSelectRunByIndex: (index) => {
      if (!mixActive || !selectedTrack) return
      const run = selectedTrack.runs[index]
      if (!run) return
      openMix(selectedTrack.id, { runId: run.id })
    },
    onToggleSettings: () => {
      if (settingsOpen) setSettingsOpen(false)
      else openSettings('preferences')
    },
    onEscape: () => {
      if (settingsOpen) setSettingsOpen(false)
      else if (importOpen) setImportOpen(false)
      else if (reviewOpen) setReviewOpen(false)
      else if (batchExportIds) setBatchExportIds(null)
      else if (batchSplitIds) setBatchSplitIds(null)
    },
  })

  const anyDialogOpen = settingsOpen || importOpen || reviewOpen || !!batchExportIds || !!batchSplitIds

  return (
    <ErrorBoundary>
      <div className="shell">
        {!mixActive ? (
          <header className="app-top" inert={anyDialogOpen || undefined}>
            <strong className="app-top-brand">Stems</strong>
            <div className="app-top-actions">
              {setupRequired ? (
                <button
                  type="button"
                  className="topbar-chip topbar-chip-warn"
                  onClick={() => openSettings('maintenance')}
                >
                  <span className="topbar-dot topbar-dot-warn" />
                  finish setup
                </button>
              ) : null}
              <ConnectionDot connection={connection} hasFirstSync={hasFirstSync} />
              <button
                type="button"
                className="icon-button"
                onClick={() => openSettings('preferences')}
                aria-label="Settings"
                title="Settings"
              >
                <GearIcon />
              </button>
              <button type="button" className="button-primary" onClick={() => setImportOpen(true)}>
                Add songs
              </button>
            </div>
          </header>
        ) : null}

        <main
          className={mixActive ? 'shell-mix-main' : 'shell-library-main'}
          inert={anyDialogOpen || undefined}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/songs" replace />} />
            <Route
              path="/songs"
              element={
                <SongsPage
                  view={songsView}
                  tracks={tracks}
                  currentTrackId={mixTrackId}
                  stagedImportsCount={drafts.length}
                  queueRuns={queueRuns}
                  cancellingRunId={cancellingRunId}
                  onViewChange={(next) => navigate(buildSongsPath(next), { state: { songsView: next } })}
                  onOpenTrack={openTrackWorkspace}
                  onAddSongs={() => setImportOpen(true)}
                  onReviewImports={() => setReviewOpen(true)}
                  onCancelRun={handleCancelRun}
                  onBatchSplit={(ids) => setBatchSplitIds(ids)}
                  onBatchExport={(ids) => setBatchExportIds(ids)}
                  onBatchDelete={handleBatchDeleteTracks}
                />
              }
            />
            <Route
              path="/mix/:trackId"
              element={
                <MixWorkspace
                  track={selectedTrack}
                  selectedRunId={mixRunId}
                  profiles={settings?.profiles ?? []}
                  defaultBitrate={defaultBitrate}
                  creatingRun={creatingRun}
                  cancellingRunId={cancellingRunId}
                  retryingRunId={retryingRunId}
                  deletingRunId={deletingRunId}
                  settingKeeper={settingKeeper}
                  savingMixRunId={savingMixRunId}
                  updatingTrack={updatingTrack}
                  onBackToSongs={() => openSongs()}
                  onSelectRun={(runId) => {
                    if (!selectedTrack) return
                    openMix(selectedTrack.id, { runId })
                  }}
                  onCreateRun={handleCreateRun}
                  onCancelRun={handleCancelRun}
                  onRetryRun={handleRetryRun}
                  onDeleteRun={handleDeleteRun}
                  onSetKeeper={handleSetKeeper}
                  onSaveMix={handleSaveMix}
                  onUpdateTrack={handleUpdateTrack}
                  onDeleteTrack={(trackId) => {
                    handleDeleteTrack(trackId)
                    openSongs()
                  }}
                  onReveal={handleRevealFolder}
                  onError={(message) => pushToast('error', message)}
                />
              }
            />
            <Route path="*" element={<Navigate to="/songs" replace />} />
          </Routes>
        </main>

        <SettingsDrawer
          open={settingsOpen}
          initialView={settingsView}
          diagnostics={diagnostics}
          settings={settings}
          storageOverview={storageOverview}
          savingSettings={savingSettings}
          cleaningTempStorage={cleaningTempStorage}
          cleaningExportBundles={cleaningExportBundles}
          cleaningLibraryRuns={cleaningLibraryRuns}
          backfillingMetrics={backfillingMetrics}
          onClose={() => setSettingsOpen(false)}
          onSaveSettings={handleSaveSettings}
          onCleanupTempStorage={handleCleanupTempStorage}
          onCleanupExportBundles={handleCleanupExportBundles}
          onCleanupLibraryRuns={handleCleanupLibraryRuns}
          onBackfillMetrics={handleBackfillMetrics}
        />

        <ImportFlowDialog
          open={importOpen}
          stagedImports={drafts}
          onClose={() => setImportOpen(false)}
          onSourcesStaged={() => setReviewOpen(true)}
          resolvingYoutubeImport={resolvingYoutubeImport}
          resolvingLocalImport={resolvingLocalImport}
          onResolveYouTube={async (sourceUrl) => {
            await handleResolveYouTube(sourceUrl)
          }}
          onResolveLocalImport={async (files) => {
            await handleResolveLocalImport(files)
          }}
        />

        <ImportsOverlay
          open={reviewOpen}
          drafts={drafts}
          profiles={settings?.profiles ?? []}
          defaultProfileKey={defaultProcessing.profile_key}
          confirming={confirmingDrafts}
          onClose={() => setReviewOpen(false)}
          onUpdateDraft={handleUpdateDraft}
          onDiscardDraft={handleDiscardDraft}
          onConfirm={async (payload) => {
            await handleConfirmDrafts(payload)
            setReviewOpen(false)
          }}
        />

        <BatchExportOverlay
          open={!!batchExportIds}
          tracks={tracks}
          selectedTrackIds={batchExportIds ?? []}
          defaultBitrate={defaultBitrate}
          onClose={() => setBatchExportIds(null)}
          onReveal={handleRevealFolder}
          onError={(message) => pushToast('error', message)}
        />

        <BatchSplitOverlay
          open={!!batchSplitIds}
          tracks={tracks}
          selectedTrackIds={batchSplitIds ?? []}
          profiles={settings?.profiles ?? []}
          defaultProfileKey={defaultProcessing.profile_key}
          busy={creatingRun}
          onClose={() => setBatchSplitIds(null)}
          onConfirm={async (ids, processing) => {
            await handleBatchCreateRun(ids, processing)
            setBatchSplitIds(null)
          }}
        />

        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        {dragOverlayActive ? (
          <div className="drop-overlay" role="presentation">
            <div className="drop-overlay-panel">
              <strong>Drop to import</strong>
              <span>Audio or video files only.</span>
            </div>
          </div>
        ) : null}
      </div>
    </ErrorBoundary>
  )
}

function ConnectionDot({ connection, hasFirstSync }: { connection: Connection; hasFirstSync: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (connection.state !== 'offline') return undefined
    const syncNow = () => setNow(Date.now())
    const timeoutId = window.setTimeout(syncNow, 0)
    const intervalId = window.setInterval(syncNow, 1000)
    return () => {
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
    }
  }, [connection.state])

  if (connection.state === 'offline') {
    const retryInMs = connection.nextRetryAt ? connection.nextRetryAt - now : 0
    const retryIn = Math.max(0, Math.ceil(retryInMs / 1000))
    return (
      <span className="topbar-chip" title={connection.lastError ?? 'Connection error'}>
        <span className="topbar-dot topbar-dot-offline" />
        offline · retry {retryIn}s
      </span>
    )
  }
  if (!hasFirstSync) {
    return (
      <span className="topbar-chip">
        <span className="topbar-dot topbar-dot-syncing" />
        loading
      </span>
    )
  }
  return null
}

function GearIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 10.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M13.2 9.6a5.4 5.4 0 0 0 0-3.2l1.3-1-1.3-2.3-1.6.5a5.4 5.4 0 0 0-2.8-1.6L8.5.5h-1L7 2a5.4 5.4 0 0 0-2.8 1.6L2.6 3l-1.3 2.3 1.3 1a5.4 5.4 0 0 0 0 3.2l-1.3 1 1.3 2.3 1.6-.5a5.4 5.4 0 0 0 2.8 1.6l.3 1.6h1l.3-1.6a5.4 5.4 0 0 0 2.8-1.6l1.6.5 1.3-2.3-1.3-1Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default App
