import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom'

import './App.css'
import './redesign.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ImportFlowDialog } from './components/ImportFlowDialog'
import { SettingsDrawer } from './components/SettingsDrawer'
import { ToastStack } from './components/feedback/ToastStack'
import { MixWorkspace } from './components/mix/MixWorkspace'
import { SongsPage } from './components/songs/SongsPage'
import { applySongBrowse } from './components/trackListView'
import { useDashboardData } from './hooks/useDashboardData'
import type { Connection } from './hooks/useDashboardData'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { filterImportableMediaFiles } from './importableMedia'
import { buildMixPath, buildSongsPath, parseSongsView } from './routes'
import { resolveSelectedRun } from './runSelection'
import type { RunProcessingConfigInput, TrackSummary } from './types'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const mixMatch = useMatch('/mix/:trackId')
  const songsActive = location.pathname === '/songs'
  const mixActive = !!mixMatch
  const mixTrackId = mixMatch?.params.trackId ?? null
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const mixRunId = mixActive ? searchParams.get('run') : null
  const songsView = useMemo(
    () => (songsActive ? parseSongsView(new URLSearchParams(location.search)) : parseSongsView(new URLSearchParams())),
    [songsActive, location.search],
  )

  const dashboard = useDashboardData({ trackId: mixTrackId })
  const {
    diagnostics,
    settings,
    storageOverview,
    tracks,
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
  } = dashboard

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsView, setSettingsView] = useState<'preferences' | 'maintenance' | 'storage'>(
    'preferences',
  )
  const [importOpen, setImportOpen] = useState(false)
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

  function openSongs(view = songsView) {
    navigate(buildSongsPath(view))
  }

  function openMix(trackId: string, options?: { runId?: string | null }) {
    navigate(buildMixPath(trackId, { runId: options?.runId ?? null }))
  }

  function openTrackWorkspace(track: TrackSummary, options?: { runId?: string | null }) {
    const runId = options?.runId ?? track.keeper_run_id ?? track.latest_run?.id ?? null
    openMix(track.id, { runId })
  }

  useEffect(() => {
    if (!mixActive) return
    const trackKnown = mixTrackId ? tracks.some((track) => track.id === mixTrackId) : false
    if (hasFirstSync && !selectedTrack && !trackKnown) {
      navigate('/songs', { replace: true })
      return
    }
    if (!selectedTrack) return

    const resolvedRun = resolveSelectedRun(selectedTrack, mixRunId)
    const nextPath = buildMixPath(selectedTrack.id, {
      runId: resolvedRun?.id ?? null,
    })

    if (`${location.pathname}${location.search}` !== nextPath) {
      navigate(nextPath, { replace: true })
    }
  }, [hasFirstSync, location.pathname, location.search, mixActive, mixRunId, mixTrackId, navigate, selectedTrack, tracks])

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
        handleResolveLocalImport(files)
          .then(() =>
            navigate(
              buildSongsPath({
                mode: 'needs-attention',
                search: '',
                sort: 'recent',
              }),
            ),
          )
          .catch(() => undefined)
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
  }, [handleResolveLocalImport, importOpen, navigate, pushToast])

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
      handleResolveYouTube(text)
        .then(() =>
          navigate(
            buildSongsPath({
              mode: 'needs-attention',
              search: '',
              sort: 'recent',
            }),
          ),
        )
        .catch(() => undefined)
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleResolveYouTube, navigate])

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
      void handleCreateRun(selectedTrack.id, defaultProcessing)
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
    },
  })

  const anyDialogOpen = settingsOpen || importOpen
  const showRailStatus = setupRequired || connection.state !== 'ready'
  const suiteMainClassName = `suite-main ${mixActive ? 'suite-main-fixed-workspace' : ''}`
  const appShellClassName = `app-shell ${mixActive ? 'app-shell-mix-focus' : ''}`

  return (
    <ErrorBoundary>
      <div className={appShellClassName}>
        <aside className="shell-rail" inert={anyDialogOpen || undefined}>
          <div className="shell-rail-brand">
            <strong>Karaoke</strong>
            <span>Mix workspace</span>
          </div>

          <nav className="shell-rail-nav" aria-label="Primary navigation">
            <NavLink to="/songs" className={({ isActive }) => `shell-rail-link ${isActive ? 'shell-rail-link-active' : ''}`}>
              <LibraryIcon />
              <span>Songs</span>
            </NavLink>
          </nav>

          <div className="shell-rail-footer">
            <button type="button" className="button-primary shell-rail-add" onClick={() => setImportOpen(true)}>
              Add songs
            </button>
            {showRailStatus ? (
              <StatusChip
                className="shell-rail-status"
                connection={connection}
                setupRequired={setupRequired}
                onOpenSettings={() => openSettings(setupRequired ? 'maintenance' : 'preferences')}
              />
            ) : null}
            <button
              type="button"
              className="shell-rail-settings"
              onClick={() => openSettings('preferences')}
            >
              <GearIcon />
              <span>Settings</span>
            </button>
          </div>
        </aside>

        <div className={`shell-canvas ${mixActive ? 'shell-canvas-focus-mode' : ''}`}>
          <main className={suiteMainClassName} inert={anyDialogOpen || undefined}>
            <Routes>
              <Route path="/" element={<Navigate to="/songs" replace />} />
              <Route
                path="/songs"
                element={
                  <SongsPage
                    view={songsView}
                    tracks={tracks}
                    currentTrackId={mixTrackId}
                    stagedImports={drafts}
                    queueRuns={queueRuns}
                    profiles={settings?.profiles ?? []}
                    defaultProfileKey={defaultProcessing.profile_key}
                    confirmingDrafts={confirmingDrafts}
                    cancellingRunId={cancellingRunId}
                    retryingRunId={retryingRunId}
                    onViewChange={openSongs}
                    onOpenTrack={(track, options) => openTrackWorkspace(track, options)}
                    onAddSongs={() => setImportOpen(true)}
                    onCancelRun={handleCancelRun}
                    onRetryRun={async (runId) => {
                      await handleRetryRun(runId)
                    }}
                    onDismissRun={handleDismissRun}
                    onUpdateStagedImport={handleUpdateDraft}
                    onDiscardStagedImport={handleDiscardDraft}
                    onConfirmStagedImports={async (payload) => {
                      await handleConfirmDrafts(payload)
                      navigate(
                        buildSongsPath({
                          mode: payload.queue ? 'needs-attention' : 'library',
                          search: '',
                          sort: 'recent',
                        }),
                      )
                    }}
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
                    cachedModels={cachedModels}
                    defaultProfileKey={defaultProcessing.profile_key}
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
                      navigate('/songs')
                    }}
                    onReveal={handleRevealFolder}
                    onError={(message) => pushToast('error', message)}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/songs" replace />} />
            </Routes>
          </main>
        </div>

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
          onSourcesStaged={() =>
            navigate(
              buildSongsPath({
                mode: 'needs-attention',
                search: '',
                sort: 'recent',
              }),
            )
          }
          resolvingYoutubeImport={resolvingYoutubeImport}
          resolvingLocalImport={resolvingLocalImport}
          onResolveYouTube={async (sourceUrl) => {
            await handleResolveYouTube(sourceUrl)
          }}
          onResolveLocalImport={async (files) => {
            await handleResolveLocalImport(files)
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

type StatusChipProps = {
  className?: string
  connection: Connection
  setupRequired: boolean
  onOpenSettings: () => void
}

function StatusChip({ className, connection, setupRequired, onOpenSettings }: StatusChipProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (connection.state !== 'offline') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [connection.state])

  if (setupRequired) {
    return (
      <button
        type="button"
        className={className ?? 'topbar-chip topbar-chip-warn'}
        onClick={onOpenSettings}
        title="Open settings to resolve"
      >
        <span className="topbar-dot topbar-dot-warn" />
        finish setup
      </button>
    )
  }

  if (connection.state === 'offline') {
    const retryInMs = connection.nextRetryAt ? connection.nextRetryAt - now : 0
    const retryIn = Math.max(0, Math.ceil(retryInMs / 1000))
    return (
      <span className={className ?? 'topbar-chip'} title={connection.lastError ?? 'Connection error'}>
        <span className="topbar-dot topbar-dot-offline" />
        offline · retry {retryIn}s
      </span>
    )
  }

  if (connection.lastSyncAt === 0) {
    return (
      <span className={className ?? 'topbar-chip'}>
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

function LibraryIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.25" y="3" width="11.5" height="10" rx="1.75" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5.25 3V13" stroke="currentColor" strokeWidth="1.25" />
      <path d="M7.75 5.5H11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M7.75 8H11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

export default App
