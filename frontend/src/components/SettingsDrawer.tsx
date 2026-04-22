import type { Diagnostics, Settings, StorageOverview } from '../types'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { SettingsPanel } from './SettingsPanel'

type SettingsDrawerProps = {
  open: boolean
  diagnostics: Diagnostics | null
  settings: Settings | null
  storageOverview: StorageOverview | null
  savingSettings: boolean
  cleaningTempStorage: boolean
  cleaningExportBundles: boolean
  cleaningLibraryRuns: boolean
  backfillingMetrics: boolean
  onClose: () => void
  onSaveSettings: (settings: Omit<Settings, 'profiles'>) => Promise<void>
  onCleanupTempStorage: () => Promise<void>
  onCleanupExportBundles: () => Promise<void>
  onCleanupLibraryRuns: () => void
  onBackfillMetrics: () => Promise<void>
}

const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: 'j  ·  ↓', label: 'Next track' },
  { keys: 'k  ·  ↑', label: 'Previous track' },
  { keys: 'r', label: 'Render current track again' },
  { keys: 'c', label: 'Toggle compare' },
  { keys: '1 – 9', label: 'Switch to run N' },
  { keys: '⌘ ,', label: 'Toggle settings' },
  { keys: 'Esc', label: 'Close overlay' },
]

export function SettingsDrawer({
  open,
  diagnostics,
  settings,
  storageOverview,
  savingSettings,
  cleaningTempStorage,
  cleaningExportBundles,
  cleaningLibraryRuns,
  backfillingMetrics,
  onClose,
  onSaveSettings,
  onCleanupTempStorage,
  onCleanupExportBundles,
  onCleanupLibraryRuns,
  onBackfillMetrics,
}: SettingsDrawerProps) {
  if (!open) return null

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Settings">
      <button type="button" className="drawer-backdrop" aria-label="Close" onClick={onClose} />
      <aside className="drawer-panel">
        <header className="drawer-head">
          <h2>Settings</h2>
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">
          <DiagnosticsPanel
            diagnostics={diagnostics}
            backfillingMetrics={backfillingMetrics}
            onBackfillMetrics={onBackfillMetrics}
          />
          <SettingsPanel
            settings={settings}
            storageOverview={storageOverview}
            saving={savingSettings}
            cleaningTempStorage={cleaningTempStorage}
            cleaningExportBundles={cleaningExportBundles}
            cleaningLibraryRuns={cleaningLibraryRuns}
            onSave={onSaveSettings}
            onCleanupTempStorage={onCleanupTempStorage}
            onCleanupExportBundles={onCleanupExportBundles}
            onCleanupLibraryRuns={onCleanupLibraryRuns}
          />
          <section className="section">
            <div className="section-head">
              <h2>Keyboard shortcuts</h2>
            </div>
            <dl className="shortcut-list">
              {SHORTCUTS.map((entry) => (
                <div key={entry.keys} className="shortcut-row">
                  <dt>{entry.keys}</dt>
                  <dd>{entry.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </aside>
    </div>
  )
}
