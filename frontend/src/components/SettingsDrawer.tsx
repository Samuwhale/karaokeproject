import { useRef, useState } from 'react'

import { useDialogFocus } from '../hooks/useDialogFocus'
import type { Diagnostics, Settings, StorageOverview } from '../types'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { SettingsPanel } from './SettingsPanel'

type SettingsDrawerProps = {
  open: boolean
  initialView: 'preferences' | 'maintenance' | 'storage'
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

export function SettingsDrawer({
  open,
  ...props
}: SettingsDrawerProps) {
  if (!open) return null
  return <SettingsDrawerContent {...props} open={open} initialView={props.initialView} />
}

type SettingsDrawerContentProps = SettingsDrawerProps & {
  initialView: 'preferences' | 'maintenance' | 'storage'
}

function SettingsDrawerContent({
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
  initialView,
}: SettingsDrawerContentProps) {
  const panelRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(open, { containerRef: panelRef, initialFocusRef: closeButtonRef })
  const [view, setView] = useState<'preferences' | 'maintenance' | 'storage'>(initialView)

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="drawer-backdrop" aria-hidden="true" onClick={onClose} />
      <aside className="drawer-panel" ref={panelRef} tabIndex={-1}>
        <header className="drawer-head">
          <div className="drawer-head-copy">
            <h2>Settings</h2>
            <p>
              {view === 'preferences'
                ? 'Set the defaults used when you start new work.'
                : view === 'maintenance'
                  ? 'Check readiness, review workspace usage, and clean up local files.'
                  : 'Edit storage paths and retention only when the workspace layout needs to change.'}
            </p>
          </div>
          <button ref={closeButtonRef} type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">
          <div className="drawer-tabs" role="tablist" aria-label="Settings sections">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'preferences'}
              className={`drawer-tab ${view === 'preferences' ? 'drawer-tab-active' : ''}`}
              onClick={() => setView('preferences')}
            >
              Everyday defaults
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'maintenance'}
              className={`drawer-tab ${view === 'maintenance' ? 'drawer-tab-active' : ''}`}
              onClick={() => setView('maintenance')}
            >
              Workspace cleanup
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'storage'}
              className={`drawer-tab ${view === 'storage' ? 'drawer-tab-active' : ''}`}
              onClick={() => setView('storage')}
            >
              Storage paths
            </button>
          </div>
          {view === 'maintenance' ? (
            <DiagnosticsPanel
              diagnostics={diagnostics}
              backfillingMetrics={backfillingMetrics}
              onBackfillMetrics={onBackfillMetrics}
            />
          ) : null}
          <SettingsPanel
            settings={settings}
            storageOverview={storageOverview}
            saving={savingSettings}
            cleaningTempStorage={cleaningTempStorage}
            cleaningExportBundles={cleaningExportBundles}
            cleaningLibraryRuns={cleaningLibraryRuns}
            view={view}
            onSave={onSaveSettings}
            onCleanupTempStorage={onCleanupTempStorage}
            onCleanupExportBundles={onCleanupExportBundles}
            onCleanupLibraryRuns={onCleanupLibraryRuns}
          />
        </div>
      </aside>
    </div>
  )
}
