import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { ApplyArtistPrompt, BatchActionBar, OverflowMenu } from './components/BatchActionBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ExportModal, type ExportPreset } from './components/ExportModal'
import { ImportFlowDialog } from './components/ImportFlowDialog'
import { SettingsDrawer } from './components/SettingsDrawer'
import { TrackDetailPanel } from './components/TrackDetailPanel'
import { WorkspacePanel } from './components/WorkspacePanel'
import {
  DEFAULT_LIBRARY_VIEW,
  applyLibraryView,
  countLibraryFilters,
} from './components/trackListView'
import type { LibraryFilter } from './components/trackListView'
import type { LibraryView } from './components/trackListView'
import { ConfirmInline } from './components/feedback/ConfirmInline'
import { ToastStack } from './components/feedback/ToastStack'
import { isActiveRunStatus } from './components/runStatus'
import { useDashboardData } from './hooks/useDashboardData'
import type { Connection } from './hooks/useDashboardData'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { filterImportableMediaFiles } from './importableMedia'
import type { RunProcessingConfigInput } from './types'

type WorkspaceSection = 'inbox' | 'queue' | LibraryFilter

function App() {
  const {
    diagnostics,
    settings,
    storageOverview,
    tracks,
    drafts,
    queueRuns,
    cachedModels,
    selectedTrack,
    selectedTrackId,
    selectedRunId,
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
    compareRunId,
    settingKeeper,
    backfillingMetrics,
    savingNoteRunId,
    savingMixRunId,
    updatingTrack,
    batching,
    setSelectedRunId,
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
    handleToggleCompare,
    handleSelectTrack,
    handleBatchQueueRuns,
    handleBatchApplyArtist,
    handleBatchDeleteTracks,
    handleBatchCancelTrackRuns,
    handleBatchPurgeNonKeepers,
    handleBatchCancelQueueRuns,
  } = useDashboardData()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsView, setSettingsView] = useState<'preferences' | 'maintenance' | 'storage'>(
    'preferences',
  )
  const [importOpen, setImportOpen] = useState(false)
  const [dragOverlayActive, setDragOverlayActive] = useState(false)
  const dragCounterRef = useRef(0)
  const [exportSelection, setExportSelection] = useState<{
    trackIds: string[]
    runIds: Record<string, string>
    initialPreset?: ExportPreset
    lockPreset?: boolean
    contextTitle?: string
    contextDescription?: string
  } | null>(null)
  const [libraryView, setLibraryView] = useState<LibraryView>(DEFAULT_LIBRARY_VIEW)
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('all')
  const [librarySelectionMode, setLibrarySelectionMode] = useState(false)
  const [compactPane, setCompactPane] = useState<'library' | 'detail'>('library')
  const clearWorkspaceSelections = useCallback(() => {
    setLibrarySelectionMode(false)
    clearSelection('library')
    clearSelection('queue')
  }, [clearSelection])
  const focusInbox = useCallback(() => {
    setWorkspaceSection('inbox')
    setCompactPane('library')
    clearWorkspaceSelections()
  }, [clearWorkspaceSelections])

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
        handleResolveLocalImport(files).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Drop import failed.'
          pushToast('error', message)
        })
        focusInbox()
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
  }, [focusInbox, handleResolveLocalImport, importOpen, pushToast])

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
      handleResolveYouTube(text).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Paste import failed.'
        pushToast('error', message)
      })
      focusInbox()
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [focusInbox, handleResolveYouTube, pushToast])

  const visibleTracks = useMemo(() => applyLibraryView(tracks, libraryView), [tracks, libraryView])
  const countsByFilter = useMemo(() => countLibraryFilters(tracks), [tracks])
  const openLibraryFilter = useCallback(
    (filter: LibraryFilter) => {
      const nextView = { ...libraryView, filter }
      setWorkspaceSection(filter)
      setLibraryView(nextView)
      setCompactPane('library')
      clearWorkspaceSelections()
      const nextTracks = applyLibraryView(tracks, nextView)
      if (nextTracks[0]) {
        startTransition(() => {
          handleSelectTrack(nextTracks[0].id, null)
        })
      }
    },
    [clearWorkspaceSelections, handleSelectTrack, libraryView, tracks],
  )
  const openWorkspaceSection = useCallback(
    (section: WorkspaceSection) => {
      setWorkspaceSection(section)
      setCompactPane('library')

      if (section === 'queue') {
        clearSelection('library')
        setLibrarySelectionMode(false)
        return
      }

      clearSelection('queue')

      if (section === 'inbox') {
        clearSelection('library')
        setLibrarySelectionMode(false)
        return
      }

      const nextView = { ...libraryView, filter: section }
      setLibraryView(nextView)
      clearSelection('library')
      setLibrarySelectionMode(false)
    },
    [clearSelection, libraryView],
  )
  const openSettings = useCallback((view: 'preferences' | 'maintenance' | 'storage') => {
    setSettingsView(view)
    setSettingsOpen(true)
  }, [])
  const workflowSummary = useMemo(() => {
    const attentionTracks = tracks.filter(
      (track) =>
        track.latest_run?.status === 'failed' || track.latest_run?.status === 'cancelled',
    ).length
    const readyToRender = tracks.filter((track) => track.run_count === 0).length
    const ready = tracks.filter(
      (track) => !track.keeper_run_id && track.latest_run?.status === 'completed',
    ).length
    const final = tracks.filter(
      (track) => !!track.keeper_run_id,
    ).length
    const activeRuns = queueRuns.filter((entry) => isActiveRunStatus(entry.run.status)).length
    const queueAttention = queueRuns.length - activeRuns
    return {
      drafts: drafts.length,
      readyToRender,
      ready,
      final,
      activeRuns,
      queueAttention,
      attentionCount: attentionTracks + queueAttention,
    }
  }, [drafts.length, queueRuns, tracks])
  const hasFirstSync = connection.lastSyncAt > 0
  const setupRequired = hasFirstSync && diagnostics ? !diagnostics.app_ready : false
  const workflowFocus = useMemo(() => {
    if (setupRequired) {
      return {
        title: 'Finish setup before processing',
        description: 'Resolve missing tools or storage issues before you queue more work.',
        actionLabel: 'Open Settings',
        action: () => openSettings('maintenance'),
      }
    }
    if (workflowSummary.drafts > 0) {
      return {
        title: 'Review imported songs',
        description: `${workflowSummary.drafts} song${workflowSummary.drafts === 1 ? '' : 's'} need title or duplicate decisions before they enter the library.`,
        actionLabel: 'Review Imports',
        action: focusInbox,
      }
    }
    if (workflowSummary.attentionCount > 0) {
      return {
        title: 'Clear blocked work',
        description:
          workflowSummary.queueAttention > 0
            ? 'The queue has splits that finished badly or need follow-up before the workspace is clean again.'
            : 'Failed or cancelled splits need a retry or a different setup before they become usable.',
        actionLabel: 'Review Queue',
        action: () =>
          workflowSummary.queueAttention > 0
            ? openWorkspaceSection('queue')
            : openLibraryFilter('needs-attention'),
      }
    }
    if (workflowSummary.readyToRender > 0) {
      return {
        title: 'Queue the next splits',
        description: `${workflowSummary.readyToRender} song${workflowSummary.readyToRender === 1 ? '' : 's'} are ready for a first split.`,
        actionLabel: 'Open Ready To Split',
        action: () => openLibraryFilter('ready-to-render'),
      }
    }
    if (workflowSummary.ready > 0) {
      return {
        title: 'Review completed results',
        description: `${workflowSummary.ready} song${workflowSummary.ready === 1 ? '' : 's'} already have a usable split ready for a final choice.`,
        actionLabel: 'Open Results To Review',
        action: () => openLibraryFilter('ready'),
      }
    }
    if (workflowSummary.final > 0) {
      return {
        title: 'Revisit final songs',
        description: `${workflowSummary.final} song${workflowSummary.final === 1 ? '' : 's'} already have a chosen final version.`,
        actionLabel: 'Open Final Versions',
        action: () => openLibraryFilter('final'),
      }
    }
    return {
      title: 'Start by adding a song',
      description: 'Import local files or paste a YouTube URL to start a new split.',
      actionLabel: 'Add Songs',
      action: () => {
        setImportOpen(true)
      },
    }
  }, [focusInbox, openLibraryFilter, openSettings, openWorkspaceSection, setupRequired, workflowSummary])
  const defaultProcessing: RunProcessingConfigInput = {
    profile_key: settings?.default_profile ?? 'standard',
  }
  const defaultBitrate = settings?.export_mp3_bitrate ?? '320k'
  const openTrackRun = useCallback(
    (trackId: string, runId: string | null) => {
      setCompactPane('detail')
      startTransition(() => {
        handleSelectTrack(trackId, runId)
      })
    },
    [handleSelectTrack],
  )

  const openExportForTrack = useCallback(
    (
      trackId: string,
      runId: string | null,
      options?: {
        initialPreset?: ExportPreset
        lockPreset?: boolean
        contextTitle?: string
        contextDescription?: string
      },
    ) => {
      setExportSelection({
        trackIds: [trackId],
        runIds: runId ? { [trackId]: runId } : {},
        initialPreset: options?.initialPreset,
        lockPreset: options?.lockPreset,
        contextTitle: options?.contextTitle,
        contextDescription: options?.contextDescription,
      })
    },
    [],
  )

  const openBatchExport = useCallback(
    (trackIds: string[]) => {
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
    },
    [pushToast, tracks],
  )

  function selectTrackAt(index: number) {
    if (index < 0 || index >= visibleTracks.length) return
    const nextId = visibleTracks[index].id
    openTrackRun(nextId, null)
  }

  function currentTrackIndex() {
    if (!selectedTrackId) return -1
    return visibleTracks.findIndex((track) => track.id === selectedTrackId)
  }

  useKeyboardShortcuts({
    onNavigateNext: () => {
      if (!visibleTracks.length) return
      const idx = currentTrackIndex()
      selectTrackAt(idx < 0 ? 0 : Math.min(idx + 1, visibleTracks.length - 1))
    },
    onNavigatePrev: () => {
      if (!visibleTracks.length) return
      const idx = currentTrackIndex()
      selectTrackAt(idx <= 0 ? 0 : idx - 1)
    },
    onRerun: () => {
      if (!selectedTrack || creatingRun || !settings) return
      void handleCreateRun(selectedTrack.id, defaultProcessing)
    },
    onSelectRunByIndex: (index) => {
      const run = selectedTrack?.runs[index]
      if (!run) return
      startTransition(() => setSelectedRunId(run.id))
    },
    onToggleCompare: () => {
      if (!selectedTrack) return
      if (compareRunId) {
        handleToggleCompare(compareRunId)
        return
      }
      const candidate = selectedTrack.runs.find(
        (run) => run.status === 'completed' && run.id !== selectedRunId,
      )
      if (candidate) handleToggleCompare(candidate.id)
    },
    onToggleSettings: () => {
      if (settingsOpen) setSettingsOpen(false)
      else openSettings('preferences')
    },
    onEscape: () => {
      if (settingsOpen) setSettingsOpen(false)
      else if (importOpen) setImportOpen(false)
      else if (exportSelection !== null) setExportSelection(null)
      else if (selectedQueueRunIds.size > 0) clearSelection('queue')
      else {
        clearSelection('library')
        setLibrarySelectionMode(false)
      }
    },
  })

  const anyDialogOpen = settingsOpen || importOpen || exportSelection !== null

  const librarySelectionList = Array.from(selectedLibraryIds)
  const queueSelectionList = Array.from(selectedQueueRunIds)
  const selectedFinalCount = useMemo(() => {
    const selectedIds = new Set(librarySelectionList)
    return tracks.filter((track) => selectedIds.has(track.id) && track.keeper_run_id).length
  }, [librarySelectionList, tracks])

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="topbar" inert={anyDialogOpen || undefined}>
          <div className="topbar-brand">stems</div>
          <div className="topbar-meta">
            <button
              type="button"
              className="button-primary topbar-add"
              onClick={() => {
                setImportOpen(true)
                setCompactPane('library')
              }}
            >
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

        <div className="workspace-mobile-nav" inert={anyDialogOpen || undefined}>
          <button
            type="button"
            className={`workspace-mobile-nav-button ${compactPane === 'library' ? 'workspace-mobile-nav-button-active' : ''}`}
            onClick={() => setCompactPane('library')}
          >
            Workspace
          </button>
          <button
            type="button"
            className={`workspace-mobile-nav-button ${compactPane === 'detail' ? 'workspace-mobile-nav-button-active' : ''}`}
            onClick={() => setCompactPane('detail')}
            disabled={!selectedTrack && tracks.length === 0}
          >
            Current song
          </button>
        </div>

        <main className={`workspace workspace-pane-${compactPane}`} inert={anyDialogOpen || undefined}>
          <section className="column column-main">
            <WorkspacePanel
              workflowFocus={workflowFocus}
              workflowSummary={workflowSummary}
              drafts={drafts}
              queueRuns={queueRuns}
              setupRequired={setupRequired}
              profiles={settings?.profiles ?? []}
              defaultProfileKey={defaultProcessing.profile_key}
              confirmingDrafts={confirmingDrafts}
              selectedQueueRunIds={selectedQueueRunIds}
              onToggleQueueSelected={toggleQueueRunSelected}
              onSelectAllQueue={(ids) => selectAll('queue', ids)}
              onClearQueueSelection={() => clearSelection('queue')}
              onSelectRun={openTrackRun}
              onCancelRun={handleCancelRun}
              onRetryRun={handleRetryRun}
              onDismissRun={handleDismissRun}
              cancellingRunId={cancellingRunId}
              retryingRunId={retryingRunId}
              onAddSongs={() => {
                setImportOpen(true)
                setCompactPane('library')
              }}
              onOpenSettings={() => openSettings('maintenance')}
              onUpdateStagedImport={handleUpdateDraft}
              onDiscardStagedImport={handleDiscardDraft}
              onConfirmStagedImports={async (payload) => {
                await handleConfirmDrafts(payload)
                setCompactPane('library')
                if (payload.queue) openWorkspaceSection('queue')
                else openLibraryFilter('ready-to-render')
              }}
              tracks={visibleTracks}
              totalCount={tracks.length}
              selectedTrackId={selectedTrackId}
              hasFirstSync={hasFirstSync}
              activeSection={workspaceSection}
              onSectionChange={openWorkspaceSection}
              view={libraryView}
              countsByFilter={countsByFilter}
              onViewChange={setLibraryView}
              onFilterChange={openLibraryFilter}
              selectionMode={librarySelectionMode || librarySelectionList.length > 0}
              onSelectionModeChange={setLibrarySelectionMode}
              selectedIds={selectedLibraryIds}
              onToggleSelect={toggleLibrarySelected}
              onSelectAll={(ids) => selectAll('library', ids)}
              onClearSelection={() => {
                clearSelection('library')
                setLibrarySelectionMode(false)
              }}
            />
          </section>

          <section className="column column-detail">
            <TrackDetailPanel
              track={selectedTrack}
              selectedRunId={selectedRunId}
              compareRunId={compareRunId}
              profiles={settings?.profiles ?? []}
              cachedModels={cachedModels}
              defaultProfileKey={defaultProcessing.profile_key}
              hasFirstSync={hasFirstSync}
              tracksCount={tracks.length}
              creatingRun={creatingRun}
              cancellingRunId={cancellingRunId}
              retryingRunId={retryingRunId}
              settingKeeper={settingKeeper}
              savingNoteRunId={savingNoteRunId}
              savingMixRunId={savingMixRunId}
              updatingTrack={updatingTrack}
              onSelectRun={(runId) => {
                startTransition(() => {
                  setSelectedRunId(runId)
                })
              }}
              onCreateRun={handleCreateRun}
              onCancelRun={handleCancelRun}
              onRetryRun={handleRetryRun}
              onSetKeeper={handleSetKeeper}
              onPurgeNonKeepers={handlePurgeNonKeepers}
              onSetRunNote={handleSetRunNote}
              onSaveMix={handleSaveMix}
              onUpdateTrack={handleUpdateTrack}
              onDeleteTrack={handleDeleteTrack}
              onToggleCompare={handleToggleCompare}
              onOpenExport={(request) => {
                if (selectedTrack) openExportForTrack(selectedTrack.id, selectedRunId, request)
              }}
              onReveal={handleRevealFolder}
              onBackToLibrary={() => setCompactPane('library')}
            />
          </section>
        </main>

        {librarySelectionList.length > 0 ? (
          <BatchActionBar
            selectedCount={librarySelectionList.length}
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
            <OverflowMenu label="Library tools">
              <ApplyArtistPrompt
                disabled={batching}
                buttonLabel="Set artist"
                onApply={(artist) => void handleBatchApplyArtist(librarySelectionList, artist)}
              />
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

        {queueSelectionList.length > 0 ? (
          <BatchActionBar
            selectedCount={queueSelectionList.length}
            onClear={() => clearSelection('queue')}
            busy={batching}
            inert={anyDialogOpen}
          >
            <button
              type="button"
              className="button-secondary"
              disabled={batching}
              onClick={() => void handleBatchCancelQueueRuns(queueSelectionList)}
            >
              Cancel splits
            </button>
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
          onSourcesStaged={() => {
            focusInbox()
          }}
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
        setup needed
      </button>
    )
  }

  if (connection.state === 'offline') {
    const retryInMs = connection.nextRetryAt ? connection.nextRetryAt - now : 0
    const retryIn = Math.max(0, Math.ceil(retryInMs / 1000))
    return (
      <span
        className="topbar-chip"
        title={connection.lastError ?? 'Connection error'}
      >
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
