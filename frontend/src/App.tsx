import { startTransition, useEffect, useMemo, useState } from 'react'

import './App.css'
import { ApplyArtistPrompt, BatchActionBar, ConfirmDraftsPrompt } from './components/BatchActionBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ExportModal } from './components/ExportModal'
import { ImportModal } from './components/ImportModal'
import { InboxList } from './components/InboxList'
import { QueueList } from './components/QueueList'
import { SettingsDrawer } from './components/SettingsDrawer'
import { TrackDetailPanel } from './components/TrackDetailPanel'
import { DEFAULT_LIBRARY_VIEW, TrackList, applyLibraryView } from './components/TrackList'
import type { LibraryView } from './components/TrackList'
import { ConfirmInline } from './components/feedback/ConfirmInline'
import { ToastStack } from './components/feedback/ToastStack'
import { useDashboardData } from './hooks/useDashboardData'
import type { Connection, DashboardSurface } from './hooks/useDashboardData'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import type { RunProcessingConfigInput } from './types'

function App() {
  const {
    activeSurface,
    focusSurface,
    diagnostics,
    settings,
    storageOverview,
    tracks,
    drafts,
    queueRuns,
    draftsNeedingAttention,
    selectedTrack,
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
    rerunningRunId,
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
    handleBatchUpdateDrafts,
    handleDiscardDraft,
    handleBatchDiscardDrafts,
    handleConfirmDrafts,
    handleCreateRun,
    handleCancelRun,
    handleRetryRun,
    handleRerunWithPreset,
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
  const [exportTargetIds, setExportTargetIds] = useState<string[] | null>(null)
  const [libraryView, setLibraryView] = useState<LibraryView>(DEFAULT_LIBRARY_VIEW)

  const visibleTracks = useMemo(() => applyLibraryView(tracks, libraryView), [tracks, libraryView])

  const defaultProcessing: RunProcessingConfigInput = {
    profile_key: settings?.default_preset ?? 'standard',
    export_mp3_bitrate: settings?.export_mp3_bitrate ?? '320k',
  }

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
      if (activeSurface !== 'library' || !visibleTracks.length) return
      const idx = currentTrackIndex()
      selectTrackAt(idx < 0 ? 0 : Math.min(idx + 1, visibleTracks.length - 1))
    },
    onNavigatePrev: () => {
      if (activeSurface !== 'library' || !visibleTracks.length) return
      const idx = currentTrackIndex()
      selectTrackAt(idx <= 0 ? 0 : idx - 1)
    },
    onRerun: () => {
      if (!selectedTrack || creatingRun || !settings) return
      void handleCreateRun(selectedTrack.id, defaultProcessing)
    },
    onSurfaceByIndex: (index) => {
      if (index === 0) focusSurface('inbox')
      else if (index === 1) focusSurface('queue')
      else if (index === 2) focusSurface('library')
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
      else clearSelection(activeSurface)
    },
  })

  const hasFirstSync = connection.lastSyncAt > 0
  const setupRequired = hasFirstSync && diagnostics ? !diagnostics.app_ready : false

  const draftSelectionList = Array.from(selectedDraftIds)
  const librarySelectionList = Array.from(selectedLibraryIds)
  const queueSelectionList = Array.from(selectedQueueRunIds)

  const selectedDrafts = drafts.filter((draft) => selectedDraftIds.has(draft.id))
  const confirmDisabled =
    !selectedDrafts.length ||
    selectedDrafts.some((draft) => draft.duplicate_action === null) ||
    confirmingDrafts

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

        <nav className="tab-strip" role="tablist" aria-label="Workspace">
          <TabButton
            surface="inbox"
            active={activeSurface === 'inbox'}
            label="Inbox"
            count={drafts.length}
            countTone={draftsNeedingAttention > 0 ? 'attention' : undefined}
            countTitle={
              draftsNeedingAttention > 0
                ? `${draftsNeedingAttention} draft${draftsNeedingAttention === 1 ? '' : 's'} need an action before confirming`
                : undefined
            }
            onSelect={focusSurface}
          />
          <TabButton
            surface="queue"
            active={activeSurface === 'queue'}
            label="Queue"
            count={queueRuns.length}
            onSelect={focusSurface}
          />
          <TabButton
            surface="library"
            active={activeSurface === 'library'}
            label="Library"
            count={tracks.length}
            onSelect={focusSurface}
          />
        </nav>

        <main className="workspace">
          <section className="column column-left">
            {activeSurface === 'inbox' ? (
              <InboxList
                drafts={drafts}
                selectedIds={selectedDraftIds}
                onToggleSelect={toggleDraftSelected}
                onSelectAll={(ids) => selectAll('inbox', ids)}
                onClearSelection={() => clearSelection('inbox')}
                onUpdateDraft={handleUpdateDraft}
                onDiscardDraft={handleDiscardDraft}
                onOpenImport={() => setImportOpen(true)}
              />
            ) : activeSurface === 'queue' ? (
              <QueueList
                entries={queueRuns}
                selectedIds={selectedQueueRunIds}
                onToggleSelect={toggleQueueRunSelected}
                onSelectAll={(ids) => selectAll('queue', ids)}
                onClearSelection={() => clearSelection('queue')}
                onSelectTrack={(trackId) => {
                  focusSurface('library')
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
            ) : (
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
                selectedIds={selectedLibraryIds}
                onToggleSelect={toggleLibrarySelected}
                onSelectAll={(ids) => selectAll('library', ids)}
                onClearSelection={() => clearSelection('library')}
              />
            )}
          </section>

          <section className="column column-right">
            <TrackDetailPanel
              track={selectedTrack}
              selectedRunId={selectedRunId}
              compareRunId={compareRunId}
              profiles={settings?.profiles ?? []}
              defaultProfileKey={defaultProcessing.profile_key}
              defaultMp3Bitrate={defaultProcessing.export_mp3_bitrate}
              hasFirstSync={hasFirstSync}
              tracksCount={tracks.length}
              creatingRun={creatingRun}
              cancellingRunId={cancellingRunId}
              retryingRunId={retryingRunId}
              rerunningRunId={rerunningRunId}
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
              onRerunWithPreset={handleRerunWithPreset}
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

        {activeSurface === 'inbox' && draftSelectionList.length > 0 ? (
          <BatchActionBar
            selectedCount={draftSelectionList.length}
            onClear={() => clearSelection('inbox')}
            busy={batching || confirmingDrafts}
          >
            <ApplyArtistPrompt
              disabled={batching}
              buttonLabel="Set artist"
              onApply={(artist) =>
                void handleBatchUpdateDrafts({ draft_ids: draftSelectionList, artist })
              }
            />
            <button
              type="button"
              className="button-secondary"
              disabled={batching}
              onClick={() =>
                void handleBatchUpdateDrafts({
                  draft_ids: draftSelectionList,
                  duplicate_action: 'create-new',
                })
              }
            >
              Mark: create separate
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={batching}
              onClick={() => void handleBatchDiscardDrafts(draftSelectionList)}
            >
              Discard
            </button>
            <ConfirmDraftsPrompt
              selectedCount={draftSelectionList.length}
              disabled={confirmDisabled}
              profiles={settings?.profiles ?? []}
              defaultProcessing={defaultProcessing}
              onConfirm={(queue, processing) =>
                void handleConfirmDrafts({
                  draft_ids: draftSelectionList,
                  queue,
                  processing: queue ? processing : undefined,
                })
              }
            />
          </BatchActionBar>
        ) : null}

        {activeSurface === 'library' && librarySelectionList.length > 0 ? (
          <BatchActionBar
            selectedCount={librarySelectionList.length}
            onClear={() => clearSelection('library')}
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
              Cancel runs
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={batching}
              onClick={() => void handleBatchPurgeNonKeepers(librarySelectionList)}
            >
              Purge non-final runs
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setExportTargetIds(librarySelectionList)}
            >
              Export…
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
          </BatchActionBar>
        ) : null}

        {activeSurface === 'queue' && queueSelectionList.length > 0 ? (
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
              Cancel runs
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

        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          resolvingYoutubeImport={resolvingYoutubeImport}
          resolvingLocalImport={resolvingLocalImport}
          onResolveYouTube={handleResolveYouTube}
          onResolveLocalImport={handleResolveLocalImport}
        />

        <ExportModal
          open={exportTargetIds !== null}
          onClose={() => setExportTargetIds(null)}
          tracks={tracks}
          selectedTrackIds={exportTargetIds ?? []}
          onError={(message) => pushToast('error', message)}
          onReveal={handleRevealFolder}
        />

        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </ErrorBoundary>
  )
}

type TabButtonProps = {
  surface: DashboardSurface
  active: boolean
  label: string
  count: number
  countTone?: 'attention'
  countTitle?: string
  onSelect: (surface: DashboardSurface) => void
}

function TabButton({ surface, active, label, count, countTone, countTitle, onSelect }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tab ${active ? 'tab-active' : ''}`}
      onClick={() => onSelect(surface)}
    >
      <span>{label}</span>
      <span
        className={`tab-count ${countTone ? `tab-count-${countTone}` : ''}`}
        title={countTitle}
      >
        {count}
      </span>
    </button>
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
