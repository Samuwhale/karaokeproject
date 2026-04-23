import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom'

import './App.css'
import { ApplyArtistPrompt, BatchActionBar, OverflowMenu } from './components/BatchActionBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ExportModal, type ExportPreset } from './components/ExportModal'
import { ImportFlowDialog } from './components/ImportFlowDialog'
import { LibraryPage } from './components/library/LibraryPage'
import { QueuePage } from './components/queue/QueuePage'
import { SettingsDrawer } from './components/SettingsDrawer'
import { StudioPage } from './components/studio/StudioPage'
import {
  DEFAULT_LIBRARY_VIEW,
  applyLibraryView,
  countLibraryFilters,
} from './components/trackListView'
import type { LibraryView } from './components/trackListView'
import { ConfirmInline } from './components/feedback/ConfirmInline'
import { ToastStack } from './components/feedback/ToastStack'
import { isActiveRunStatus } from './components/runStatus'
import { useDashboardData } from './hooks/useDashboardData'
import type { Connection } from './hooks/useDashboardData'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { filterImportableMediaFiles } from './importableMedia'
import {
  buildLibraryPath,
  buildQueuePath,
  buildStudioPath,
  normalizeStudioTab,
  parseLibraryView,
} from './routes'
import { resolveSelectedRun } from './runSelection'
import type { RunProcessingConfigInput } from './types'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const studioMatch = useMatch('/studio/:trackId/:tab')
  const queueMatch = useMatch('/queue')
  const libraryActive = location.pathname === '/library'
  const queueActive = !!queueMatch
  const studioActive = !!studioMatch
  const studioTrackId = studioMatch?.params.trackId ?? null
  const studioTab = normalizeStudioTab(studioMatch?.params.tab)
  const studioSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const studioRunId = studioActive ? studioSearchParams.get('run') : null
  const studioCompareRunId = studioActive ? studioSearchParams.get('compare') : null

  const dashboard = useDashboardData({ trackId: studioTrackId })
  const {
    diagnostics,
    settings,
    storageOverview,
    tracks,
    drafts,
    queueRuns,
    cachedModels,
    selectedTrack,
    selectedLibraryIds,
    selectedQueueRunIds,
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
    savingSettings,
    cleaningTempStorage,
    cleaningExportBundles,
    cleaningLibraryRuns,
    settingKeeper,
    backfillingMetrics,
    savingNoteRunId,
    savingMixRunId,
    updatingTrack,
    batching,
    handleResolveYouTube,
    handleResolveLocalImport,
    handleUpdateDraft,
    handleDiscardDraft,
    handleConfirmDrafts,
    handleCreateRun,
    handleCancelRun,
    handleRetryRun,
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
    handleBatchQueueRuns,
    handleBatchApplyArtist,
    handleBatchDeleteTracks,
    handleBatchCancelTrackRuns,
    handleBatchPurgeNonKeepers,
    handleBatchCancelQueueRuns,
    handleBatchRetryQueueRuns,
    handleBatchDismissQueueRuns,
  } = dashboard

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsView, setSettingsView] = useState<'preferences' | 'maintenance' | 'storage'>(
    'preferences',
  )
  const [importOpen, setImportOpen] = useState(false)
  const [dragOverlayActive, setDragOverlayActive] = useState(false)
  const [librarySelectionMode, setLibrarySelectionMode] = useState(false)
  const [exportSelection, setExportSelection] = useState<{
    trackIds: string[]
    runIds: Record<string, string>
    initialPreset?: ExportPreset
    lockPreset?: boolean
    contextTitle?: string
    contextDescription?: string
  } | null>(null)
  const dragCounterRef = useRef(0)

  const libraryView = useMemo(
    () => (libraryActive ? parseLibraryView(new URLSearchParams(location.search)) : DEFAULT_LIBRARY_VIEW),
    [libraryActive, location.search],
  )
  const visibleTracks = useMemo(() => applyLibraryView(tracks, libraryView), [tracks, libraryView])
  const defaultTrackList = useMemo(
    () => applyLibraryView(tracks, DEFAULT_LIBRARY_VIEW),
    [tracks],
  )
  const countsByFilter = useMemo(() => countLibraryFilters(tracks), [tracks])
  const defaultProcessing: RunProcessingConfigInput = {
    profile_key: settings?.default_profile ?? 'standard',
  }
  const defaultBitrate = settings?.export_mp3_bitrate ?? '320k'
  const hasFirstSync = connection.lastSyncAt > 0
  const setupRequired = hasFirstSync && diagnostics ? !diagnostics.app_ready : false
  const selectedStudioRun = selectedTrack ? resolveSelectedRun(selectedTrack, studioRunId) : null

  function openSettings(view: 'preferences' | 'maintenance' | 'storage') {
    setSettingsView(view)
    setSettingsOpen(true)
  }

  function openLibrary(view: LibraryView = libraryView) {
    navigate(buildLibraryPath(view))
  }

  function openStudio(
    trackId: string,
    options?: { runId?: string | null; tab?: ReturnType<typeof normalizeStudioTab>; compareRunId?: string | null },
  ) {
    navigate(
      buildStudioPath(trackId, options?.tab ?? 'mix', {
        runId: options?.runId ?? null,
        compareRunId: options?.compareRunId ?? null,
      }),
    )
  }

  function openBatchExport(trackIds: string[]) {
    const tracksById = new Map(tracks.map((track) => [track.id, track]))
    const exportableTrackIds: string[] = []
    const runIds: Record<string, string> = {}
    let skippedCount = 0

    for (const trackId of trackIds) {
      const track = tracksById.get(trackId)
      if (!track) continue
      if (!track.keeper_run_id) {
        skippedCount += 1
        continue
      }
      exportableTrackIds.push(track.id)
      runIds[track.id] = track.keeper_run_id
    }

    if (exportableTrackIds.length === 0) {
      pushToast('error', 'Batch export only works for songs with a final version selected.')
      return
    }

    if (skippedCount > 0) {
      pushToast(
        'error',
        `${skippedCount} song${skippedCount === 1 ? '' : 's'} skipped because no final version is selected.`,
      )
    }

    setExportSelection({
      trackIds: exportableTrackIds,
      runIds,
      contextTitle: `Export final versions for ${exportableTrackIds.length} track${exportableTrackIds.length === 1 ? '' : 's'}`,
      contextDescription: 'Batch export uses the selected final version for each song.',
    })
  }

  useEffect(() => {
    if (!studioActive) return
    const trackKnown = studioTrackId ? tracks.some((track) => track.id === studioTrackId) : false
    if (hasFirstSync && !selectedTrack && !trackKnown) {
      navigate('/library', { replace: true })
      return
    }
    if (!selectedTrack) return

    const resolvedRun = resolveSelectedRun(selectedTrack, studioRunId)
    const validCompare =
      studioCompareRunId &&
      resolvedRun &&
      studioCompareRunId !== resolvedRun.id &&
      selectedTrack.runs.some((run) => run.id === studioCompareRunId && run.status === 'completed')
        ? studioCompareRunId
        : null
    const nextPath = buildStudioPath(selectedTrack.id, studioTab, {
      runId: resolvedRun?.id ?? null,
      compareRunId: studioTab === 'splits' ? validCompare : null,
    })

    if (`${location.pathname}${location.search}` !== nextPath) {
      navigate(nextPath, { replace: true })
    }
  }, [
    hasFirstSync,
    location.pathname,
    location.search,
    navigate,
    selectedTrack,
    studioActive,
    studioCompareRunId,
    studioTrackId,
    studioRunId,
    studioTab,
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
        handleResolveLocalImport(files)
          .then(() => navigate(buildQueuePath()))
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
        .then(() => navigate(buildQueuePath()))
        .catch(() => undefined)
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleResolveYouTube, navigate, pushToast])

  const activePageTracks = studioActive ? defaultTrackList : visibleTracks

  function selectAdjacentTrack(offset: number) {
    if (!activePageTracks.length) return
    const currentIndex = studioTrackId
      ? activePageTracks.findIndex((track) => track.id === studioTrackId)
      : -1
    const nextIndex =
      currentIndex < 0 ? 0 : Math.max(0, Math.min(activePageTracks.length - 1, currentIndex + offset))
    const nextTrack = activePageTracks[nextIndex]
    if (!nextTrack) return
    if (studioActive) {
      openStudio(nextTrack.id, { tab: studioTab })
      return
    }
    openStudio(nextTrack.id)
  }

  useKeyboardShortcuts({
    onNavigateNext: () => selectAdjacentTrack(1),
    onNavigatePrev: () => selectAdjacentTrack(-1),
    onRerun: () => {
      if (!studioActive || !selectedTrack || creatingRun || !settings) return
      void handleCreateRun(selectedTrack.id, defaultProcessing)
    },
    onSelectRunByIndex: (index) => {
      if (!studioActive || !selectedTrack || (studioTab !== 'mix' && studioTab !== 'splits')) return
      const run = selectedTrack.runs[index]
      if (!run) return
      openStudio(selectedTrack.id, {
        tab: studioTab,
        runId: run.id,
      })
    },
    onToggleCompare: () => {
      if (!studioActive || !selectedTrack || !selectedStudioRun) return
      if (studioTab !== 'splits') {
        const candidate = selectedTrack.runs.find(
          (run) => run.status === 'completed' && run.id !== selectedStudioRun.id,
        )
        openStudio(selectedTrack.id, {
          tab: 'splits',
          runId: selectedStudioRun.id,
          compareRunId: candidate?.id ?? null,
        })
        return
      }
      openStudio(selectedTrack.id, {
        tab: 'splits',
        runId: selectedStudioRun.id,
        compareRunId: studioCompareRunId ? null : selectedTrack.runs.find(
          (run) => run.status === 'completed' && run.id !== selectedStudioRun.id,
        )?.id ?? null,
      })
    },
    onToggleSettings: () => {
      if (settingsOpen) setSettingsOpen(false)
      else openSettings('preferences')
    },
    onEscape: () => {
      if (settingsOpen) setSettingsOpen(false)
      else if (importOpen) setImportOpen(false)
      else if (exportSelection !== null) setExportSelection(null)
      else if (queueActive && selectedQueueRunIds.size > 0) clearSelection('queue')
      else if (libraryActive && selectedLibraryIds.size > 0) {
        clearSelection('library')
        setLibrarySelectionMode(false)
      }
    },
  })

  const anyDialogOpen = settingsOpen || importOpen || exportSelection !== null
  const librarySelectionList = Array.from(selectedLibraryIds)
  const queueSelectionList = Array.from(selectedQueueRunIds)
  const selectedQueueEntries = useMemo(
    () => queueRuns.filter((entry) => selectedQueueRunIds.has(entry.run.id)),
    [queueRuns, selectedQueueRunIds],
  )
  const selectedQueueActiveIds = useMemo(
    () =>
      selectedQueueEntries
        .filter((entry) => isActiveRunStatus(entry.run.status))
        .map((entry) => entry.run.id),
    [selectedQueueEntries],
  )
  const selectedQueueFollowUpIds = useMemo(
    () =>
      selectedQueueEntries
        .filter((entry) => !isActiveRunStatus(entry.run.status))
        .map((entry) => entry.run.id),
    [selectedQueueEntries],
  )
  const selectedFinalCount = useMemo(() => {
    const selectedIds = new Set(librarySelectionList)
    return tracks.filter((track) => selectedIds.has(track.id) && track.keeper_run_id).length
  }, [librarySelectionList, tracks])
  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="topbar" inert={anyDialogOpen || undefined}>
          <div className="topbar-brand">stems</div>
          <nav className="topbar-nav" aria-label="Primary navigation">
            <NavLink to="/library" className={({ isActive }) => `topbar-nav-link ${isActive ? 'topbar-nav-link-active' : ''}`}>
              Songs
            </NavLink>
            <NavLink to={buildQueuePath()} className={({ isActive }) => `topbar-nav-link ${isActive ? 'topbar-nav-link-active' : ''}`}>
              Queue
            </NavLink>
            {tracks[0] ? (
              <NavLink
                to={studioActive ? location.pathname + location.search : buildStudioPath(studioTrackId ?? tracks[0].id, 'mix')}
                className={({ isActive }) => `topbar-nav-link ${isActive ? 'topbar-nav-link-active' : ''}`}
              >
                Studio
              </NavLink>
            ) : (
              <span className="topbar-nav-link topbar-nav-link-disabled">Studio</span>
            )}
          </nav>
          <div className="topbar-meta">
            <button type="button" className="button-primary topbar-add" onClick={() => setImportOpen(true)}>
              Add songs
            </button>
            <StatusChip
              connection={connection}
              setupRequired={setupRequired}
              onOpenSettings={() => openSettings('maintenance')}
            />
            <button
              type="button"
              className="topbar-gear"
              onClick={() => openSettings('preferences')}
              aria-label="Open settings"
              title="Settings (⌘,)"
            >
              <GearIcon />
            </button>
          </div>
        </header>

        <main className="suite-main" inert={anyDialogOpen || undefined}>
          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route
              path="/library"
              element={
                <LibraryPage
                  view={libraryView}
                  tracks={visibleTracks}
                  totalCount={tracks.length}
                  hasFirstSync={hasFirstSync}
                  countsByFilter={countsByFilter}
                  currentTrackId={studioTrackId}
                  selectionMode={librarySelectionMode || librarySelectionList.length > 0}
                  selectedIds={selectedLibraryIds}
                  onViewChange={(nextView) => openLibrary(nextView)}
                  onSelectionModeChange={setLibrarySelectionMode}
                  onToggleSelect={toggleLibrarySelected}
                  onSelectAll={(ids) => selectAll('library', ids)}
                  onClearSelection={() => {
                    clearSelection('library')
                    setLibrarySelectionMode(false)
                  }}
                  onOpenTrack={(trackId) => openStudio(trackId)}
                  onAddSongs={() => setImportOpen(true)}
                />
              }
            />
            <Route
              path="/queue"
              element={
                <QueuePage
                  draftsCount={drafts.length}
                  queueCount={queueRuns.length}
                  stagedImports={drafts}
                  profiles={settings?.profiles ?? []}
                  defaultProfileKey={defaultProcessing.profile_key}
                  confirmingDrafts={confirmingDrafts}
                  selectedQueueRunIds={selectedQueueRunIds}
                  queueRuns={queueRuns}
                  cancellingRunId={cancellingRunId}
                  retryingRunId={retryingRunId}
                  onAddSongs={() => setImportOpen(true)}
                  onSelectRun={(trackId, runId) => openStudio(trackId, { runId })}
                  onToggleQueueSelected={toggleQueueRunSelected}
                  onSelectAllQueue={(ids) => selectAll('queue', ids)}
                  onClearQueueSelection={() => clearSelection('queue')}
                  onCancelRun={handleCancelRun}
                  onRetryRun={async (runId) => {
                    const result = await handleRetryRun(runId)
                    const trackId = queueRuns.find((entry) => entry.run.id === runId)?.track_id
                    if (trackId && result && typeof result === 'object' && 'run' in result) {
                      openStudio(trackId, { runId: (result as { run: { id: string } }).run.id })
                    }
                  }}
                  onDismissRun={handleDismissRun}
                  onUpdateStagedImport={handleUpdateDraft}
                  onDiscardStagedImport={handleDiscardDraft}
                  onConfirmStagedImports={async (payload) => {
                    await handleConfirmDrafts(payload)
                    if (payload.queue) navigate(buildQueuePath())
                    else navigate(buildLibraryPath({ ...DEFAULT_LIBRARY_VIEW, filter: 'ready-to-render' }))
                  }}
                />
              }
            />
            <Route
              path="/studio/:trackId/:tab"
              element={
                <StudioPage
                  track={selectedTrack}
                  tab={studioTab}
                  selectedRunId={studioRunId}
                  compareRunId={studioCompareRunId}
                  profiles={settings?.profiles ?? []}
                  cachedModels={cachedModels}
                  defaultProfileKey={defaultProcessing.profile_key}
                  defaultBitrate={defaultBitrate}
                  creatingRun={creatingRun}
                  cancellingRunId={cancellingRunId}
                  retryingRunId={retryingRunId}
                  settingKeeper={settingKeeper}
                  savingNoteRunId={savingNoteRunId}
                  savingMixRunId={savingMixRunId}
                  updatingTrack={updatingTrack}
                  onBackToLibrary={() => openLibrary()}
                  onChangeTab={(tab) => {
                    if (!selectedTrack) return
                    openStudio(selectedTrack.id, {
                      tab,
                      runId: selectedStudioRun?.id ?? null,
                      compareRunId: tab === 'splits' ? studioCompareRunId : null,
                    })
                  }}
                  onSelectRun={(runId) => {
                    if (!selectedTrack) return
                    const nextCompare = studioCompareRunId === runId ? null : studioCompareRunId
                    openStudio(selectedTrack.id, {
                      tab: studioTab,
                      runId,
                      compareRunId: studioTab === 'splits' ? nextCompare : null,
                    })
                  }}
                  onSelectCompare={(runId) => {
                    if (!selectedTrack) return
                    openStudio(selectedTrack.id, {
                      tab: 'splits',
                      runId: selectedStudioRun?.id ?? null,
                      compareRunId: runId,
                    })
                  }}
                  onCreateRun={async (trackId, processing) => {
                    const result = await handleCreateRun(trackId, processing)
                    if (result && typeof result === 'object' && 'run' in result) {
                      openStudio(trackId, { tab: 'splits', runId: (result as { run: { id: string } }).run.id })
                    }
                  }}
                  onCancelRun={handleCancelRun}
                  onRetryRun={async (runId) => {
                    const result = await handleRetryRun(runId)
                    if (selectedTrack && result && typeof result === 'object' && 'run' in result) {
                      openStudio(selectedTrack.id, { tab: 'splits', runId: (result as { run: { id: string } }).run.id })
                    }
                  }}
                  onSetKeeper={handleSetKeeper}
                  onPurgeNonKeepers={handlePurgeNonKeepers}
                  onSetRunNote={handleSetRunNote}
                  onSaveMix={handleSaveMix}
                  onUpdateTrack={handleUpdateTrack}
                  onDeleteTrack={(trackId) => {
                    handleDeleteTrack(trackId)
                    navigate('/library')
                  }}
                  onReveal={handleRevealFolder}
                  onError={(message) => pushToast('error', message)}
                />
              }
            />
            <Route path="*" element={<Navigate to="/library" replace />} />
          </Routes>
        </main>

        {libraryActive && librarySelectionList.length > 0 ? (
          <BatchActionBar
            selectedCount={librarySelectionList.length}
            selectionLabel="songs"
            onClear={() => {
              clearSelection('library')
              setLibrarySelectionMode(false)
            }}
            busy={batching}
            inert={anyDialogOpen}
          >
            <button
              type="button"
              className="button-primary"
              disabled={batching}
              onClick={() => void handleBatchQueueRuns(librarySelectionList, defaultProcessing)}
            >
              Queue splits
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={selectedFinalCount === 0}
              onClick={() => openBatchExport(librarySelectionList)}
            >
              Export final versions ({selectedFinalCount}/{librarySelectionList.length})
            </button>
            <ConfirmInline
              label="Delete"
              pendingLabel="Deleting…"
              confirmLabel={`Delete ${librarySelectionList.length} track${librarySelectionList.length === 1 ? '' : 's'}`}
              cancelLabel="Keep them"
              prompt={`Delete ${librarySelectionList.length} track${librarySelectionList.length === 1 ? '' : 's'}?`}
              pending={batching}
              onConfirm={() => handleBatchDeleteTracks(librarySelectionList)}
            />
            <ApplyArtistPrompt
              disabled={batching}
              buttonLabel="Set artist"
              onApply={(artist) => void handleBatchApplyArtist(librarySelectionList, artist)}
              onClear={() => void handleBatchApplyArtist(librarySelectionList, null)}
            />
            <OverflowMenu label="More library tools">
              <button
                type="button"
                className="button-secondary"
                disabled={batching}
                onClick={() => void handleBatchCancelTrackRuns(librarySelectionList)}
              >
                Cancel splits
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={batching}
                onClick={() => void handleBatchPurgeNonKeepers(librarySelectionList)}
              >
                Clean up non-final splits
              </button>
            </OverflowMenu>
          </BatchActionBar>
        ) : null}

        {queueActive && queueSelectionList.length > 0 ? (
          <BatchActionBar
            selectedCount={queueSelectionList.length}
            selectionLabel="queue items"
            onClear={() => clearSelection('queue')}
            busy={batching}
            inert={anyDialogOpen}
          >
            {selectedQueueActiveIds.length > 0 ? (
              <button
                type="button"
                className="button-secondary"
                disabled={batching}
                onClick={() => void handleBatchCancelQueueRuns(selectedQueueActiveIds)}
              >
                Cancel active splits ({selectedQueueActiveIds.length})
              </button>
            ) : null}
            {selectedQueueFollowUpIds.length > 0 ? (
              <button
                type="button"
                className="button-primary"
                disabled={batching}
                onClick={() => void handleBatchRetryQueueRuns(selectedQueueFollowUpIds)}
              >
                Retry follow-up ({selectedQueueFollowUpIds.length})
              </button>
            ) : null}
            {selectedQueueFollowUpIds.length > 0 ? (
              <button
                type="button"
                className="button-secondary"
                disabled={batching}
                onClick={() => void handleBatchDismissQueueRuns(selectedQueueFollowUpIds)}
              >
                Dismiss follow-up ({selectedQueueFollowUpIds.length})
              </button>
            ) : null}
          </BatchActionBar>
        ) : null}

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
          onSourcesStaged={() => navigate(buildQueuePath())}
          resolvingYoutubeImport={resolvingYoutubeImport}
          resolvingLocalImport={resolvingLocalImport}
          onResolveYouTube={async (sourceUrl) => {
            await handleResolveYouTube(sourceUrl)
          }}
          onResolveLocalImport={async (files) => {
            await handleResolveLocalImport(files)
          }}
        />

        <ExportModal
          open={exportSelection !== null}
          onClose={() => setExportSelection(null)}
          tracks={tracks}
          selectedTrackIds={exportSelection?.trackIds ?? []}
          defaultBitrate={defaultBitrate}
          selectedRunIdByTrack={exportSelection?.runIds}
          initialPreset={exportSelection?.initialPreset}
          lockPreset={exportSelection?.lockPreset}
          contextTitle={exportSelection?.contextTitle}
          contextDescription={exportSelection?.contextDescription}
          onError={(message) => pushToast('error', message)}
          onReveal={handleRevealFolder}
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
  connection: Connection
  setupRequired: boolean
  onOpenSettings: () => void
}

function StatusChip({ connection, setupRequired, onOpenSettings }: StatusChipProps) {
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
        className="topbar-chip topbar-chip-warn"
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
      <span className="topbar-chip" title={connection.lastError ?? 'Connection error'}>
        <span className="topbar-dot topbar-dot-offline" />
        offline · retry {retryIn}s
      </span>
    )
  }

  if (connection.lastSyncAt === 0) {
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
