import { startTransition } from 'react'

import './App.css'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { ImportPanel } from './components/ImportPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { TrackDetailPanel } from './components/TrackDetailPanel'
import { TrackList } from './components/TrackList'
import { useDashboardData } from './hooks/useDashboardData'

function App() {
  const {
    diagnostics,
    settings,
    tracks,
    selectedTrack,
    selectedTrackId,
    selectedRunId,
    notice,
    importing,
    resolvingImport,
    confirmingImport,
    creatingRun,
    savingSettings,
    setSelectedTrackId,
    setSelectedRunId,
    youtubeResolution,
    handleLocalImport,
    handleResolveYouTube,
    handleConfirmYouTube,
    handleDiscardYouTubeReview,
    handleCreateRun,
    handleSaveSettings,
  } = useDashboardData()

  const readyTone = diagnostics ? (diagnostics.app_ready ? 'ok' : 'warn') : 'idle'
  const readyLabel = diagnostics ? (diagnostics.app_ready ? 'ready' : 'setup required') : 'loading'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          karaoke<span>/local</span>
        </div>
        <div className="topbar-meta">
          <span className="topbar-chip">
            <span className={`topbar-dot topbar-dot-${readyTone}`} />
            {readyLabel}
          </span>
          {diagnostics ? (
            <>
              <span className="topbar-chip">accel <b>{diagnostics.acceleration}</b></span>
              <span className="topbar-chip">disk <b>{diagnostics.free_disk_gb} GB</b></span>
              <span className="topbar-chip">yt-dlp <b>{diagnostics.url_import_ready ? 'ok' : 'missing'}</b></span>
              <span className="topbar-chip">tracks <b>{tracks.length}</b></span>
            </>
          ) : null}
        </div>
      </header>

      {notice ? <div className={`flash-message flash-message-${notice.tone}`}>{notice.message}</div> : null}

      <main className="workspace">
        <section className="column column-left">
          <TrackList
            tracks={tracks}
            selectedTrackId={selectedTrackId}
            onSelect={(trackId) => {
              startTransition(() => {
                setSelectedTrackId(trackId)
                setSelectedRunId(null)
              })
            }}
          />
          <ImportPanel
            profiles={settings?.profiles ?? []}
            defaultProfileKey={settings?.default_preset ?? 'balanced'}
            defaultMp3Bitrate={settings?.export_mp3_bitrate ?? '320k'}
            importing={importing}
            resolvingImport={resolvingImport}
            confirmingImport={confirmingImport}
            youtubeResolution={youtubeResolution}
            onLocalImport={handleLocalImport}
            onResolveYouTube={handleResolveYouTube}
            onConfirmYouTube={handleConfirmYouTube}
            onDiscardYouTubeReview={handleDiscardYouTubeReview}
          />
        </section>

        <section className="column column-right">
          <TrackDetailPanel
            track={selectedTrack}
            selectedRunId={selectedRunId}
            profiles={settings?.profiles ?? []}
            defaultProfileKey={settings?.default_preset ?? 'balanced'}
            defaultMp3Bitrate={settings?.export_mp3_bitrate ?? '320k'}
            creatingRun={creatingRun}
            onSelectRun={(runId) => {
              startTransition(() => {
                setSelectedRunId(runId)
              })
            }}
            onCreateRun={handleCreateRun}
          />
          <DiagnosticsPanel diagnostics={diagnostics} />
          <SettingsPanel settings={settings} saving={savingSettings} onSave={handleSaveSettings} />
        </section>
      </main>
    </div>
  )
}

export default App
