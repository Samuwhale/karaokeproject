import { startTransition, useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { ActivityPanel } from './components/ActivityPanel'
import { ApplyArtistPrompt, BatchActionBar, OverflowMenu } from './components/BatchActionBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ExportModal } from './components/ExportModal'
import { ImportFlowDialog } from './components/ImportFlowDialog'
import { SettingsDrawer } from './components/SettingsDrawer'
import { TrackDetailPanel } from './components/TrackDetailPanel'
import { DEFAULT_LIBRARY_VIEW, TrackList, applyLibraryView } from './components/TrackList'
import type { LibraryView } from './components/TrackList'
import { ConfirmInline } from './components/feedback/ConfirmInline'
import { ToastStack } from './components/feedback/ToastStack'
import { useDashboardData } from './hooks/useDashboardData'
import type { Connection } from './hooks/useDashboardData'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import type { RunProcessingConfigInput } from './types'

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
  const [importOpen, setImportOpen] = useState(false)
  const [dragOverlayActive, setDragOverlayActive] = useState(false)
  const dragCounterRef = useRef(0)
  const [exportTargetIds, setExportTargetIds] = useState<string[] | null>(null)
  const [libraryView, setLibraryView] = useState<LibraryView>(DEFAULT_LIBRARY_VIEW)
  const [librarySelectionMode, setLibrarySelectionMode] = useState(false)

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
      const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
        /^(audio|video)\//.test(file.type),
      )
      if (files.length) {
        setImportOpen(true)
        handleResolveLocalImport(files).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Drop import failed.'
          pushToast('error', message)
        })
      }
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
      setImportOpen(true)
      handleResolveYouTube(text).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Paste import failed.'
        pushToast('error', message)
      })
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleResolveYouTube, pushToast])

  const visibleTracks = useMemo(() => applyLibraryView(tracks, libraryView), [tracks, libraryView])

  const defaultProcessing: RunProcessingConfigInput = {
    profile_key: settings?.default_profile ?? 'standard',
  }
  const defaultBitrate = settings?.export_mp3_bitrate ?? '320k'

  function selectTrackAt(index: number) {
    if (index < 0 || index >= visibleTracks.length) return
    const nextId = visibleTracks[index].id
    startTransition(() => {
      handleSelectTrack(nextId)
    })
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
    onToggleSettings: () => setSettingsOpen((value) => !value),
    onEscape: () => {
      if (settingsOpen) setSettingsOpen(false)
      else if (importOpen) setImportOpen(false)
      else {
        clearSelection('library')
        setLibrarySelectionMode(false)
      }
    },
  })

  const hasFirstSync = connection.lastSyncAt > 0
  const setupRequired = hasFirstSync && diagnostics ? !diagnostics.app_ready : false

  const librarySelectionList = Array.from(selectedLibraryIds)
  const queueSelectionList = Array.from(selectedQueueRunIds)

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-brand">stems</div>
          <div className="topbar-meta">
            <StatusChip
              connection={connection}
              setupRequired={setupRequired}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            <button
              type="button"
              className="topbar-gear"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              title="Settings (⌘,)"
            >
              <GearIcon />
            </button>
          </div>
        </header>

        <main className="workspace">
          <section className="column column-left">
            <TrackList
              tracks={visibleTracks}
              totalCount={tracks.length}
              selectedTrackId={selectedTrackId}
              hasFirstSync={hasFirstSync}
              view={libraryView}
              onViewChange={setLibraryView}
              onSelect={(trackId) => {
                startTransition(() => {
                  handleSelectTrack(trackId)
                })
              }}
              onAddTracks={() => setImportOpen(true)}
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

          <section className="column column-right column-right-stack">
            <ActivityPanel
              entries={queueRuns}
              selectedIds={selectedQueueRunIds}
              onToggleSelect={toggleQueueRunSelected}
              onSelectAll={(ids) => selectAll('queue', ids)}
              onClearSelection={() => clearSelection('queue')}
              onSelectTrack={(trackId) => {
                startTransition(() => {
                  handleSelectTrack(trackId)
                })
              }}
              onCancelRun={handleCancelRun}
              onRetryRun={handleRetryRun}
              onDismissRun={handleDismissRun}
              cancellingRunId={cancellingRunId}
              retryingRunId={retryingRunId}
            />
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
              onOpenExport={() => {
                if (selectedTrack) setExportTargetIds([selectedTrack.id])
              }}
              onReveal={handleRevealFolder}
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
          >
            <button
              type="button"
              className="button-primary"
              disabled={batching}
              onClick={() => void handleBatchQueueRuns(librarySelectionList, defaultProcessing)}
            >
              Queue renders
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setExportTargetIds(librarySelectionList)}
            >
              Export Files
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
            <OverflowMenu>
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
                Cancel renders
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={batching}
                onClick={() => void handleBatchPurgeNonKeepers(librarySelectionList)}
              >
                Purge non-final renders
              </button>
            </OverflowMenu>
          </BatchActionBar>
        ) : null}

        {queueSelectionList.length > 0 ? (
          <BatchActionBar
            selectedCount={queueSelectionList.length}
            onClear={() => clearSelection('queue')}
            busy={batching}
          >
            <button
              type="button"
              className="button-secondary"
              disabled={batching}
              onClick={() => void handleBatchCancelQueueRuns(queueSelectionList)}
            >
              Cancel renders
            </button>
          </BatchActionBar>
        ) : null}

        <SettingsDrawer
          open={settingsOpen}
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
          profiles={settings?.profiles ?? []}
          cachedModels={cachedModels}
          defaultProfileKey={defaultProcessing.profile_key}
          onClose={() => setImportOpen(false)}
          resolvingYoutubeImport={resolvingYoutubeImport}
          resolvingLocalImport={resolvingLocalImport}
          confirming={confirmingDrafts}
          onResolveYouTube={async (sourceUrl) => {
            await handleResolveYouTube(sourceUrl)
          }}
          onResolveLocalImport={async (files) => {
            await handleResolveLocalImport(files)
          }}
          onUpdateStagedImport={handleUpdateDraft}
          onDiscardStagedImport={handleDiscardDraft}
          onConfirmStagedImports={async (payload) => {
            await handleConfirmDrafts(payload)
          }}
        />

        <ExportModal
          open={exportTargetIds !== null}
          onClose={() => setExportTargetIds(null)}
          tracks={tracks}
          selectedTrackIds={exportTargetIds ?? []}
          defaultBitrate={defaultBitrate}
          selectedRunIdByTrack={selectedRunId && selectedTrack ? { [selectedTrack.id]: selectedRunId } : {}}
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
        Setup needed
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
