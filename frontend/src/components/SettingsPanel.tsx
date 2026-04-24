import { useEffect, useState } from 'react'

import type { Settings, StorageBucket, StorageOverview } from '../types'
import { Spinner } from './feedback/Spinner'
import { Skeleton } from './feedback/Skeleton'
import { ConfirmInline } from './feedback/ConfirmInline'
import { formatSize } from './metrics'
import { ModelPicker } from './ModelPicker'

type SettingsPanelProps = {
  settings: Settings | null
  storageOverview: StorageOverview | null
  saving: boolean
  cleaningTempStorage: boolean
  cleaningExportBundles: boolean
  cleaningLibraryRuns: boolean
  view: 'preferences' | 'maintenance' | 'storage'
  onSave: (settings: Omit<Settings, 'profiles'>) => Promise<void>
  onCleanupTempStorage: () => Promise<void>
  onCleanupExportBundles: () => Promise<void>
  onCleanupLibraryRuns: () => void
}

type SettingsDraft = Omit<Settings, 'profiles'>
type DraftState = {
  sourceKey: string
  values: SettingsDraft
}

const BITRATE_PATTERN = /^\d{2,3}k$/
const BITRATE_HINT = 'Use a value like 192k or 320k.'

function createDraft(settings: Settings | null): SettingsDraft {
  return {
    storage: {
      database_path: settings?.storage.database_path ?? '',
      uploads_directory: settings?.storage.uploads_directory ?? '',
      outputs_directory: settings?.storage.outputs_directory ?? '',
      exports_directory: settings?.storage.exports_directory ?? '',
      temp_directory: settings?.storage.temp_directory ?? '',
      model_cache_directory: settings?.storage.model_cache_directory ?? '',
    },
    retention: {
      temp_max_age_hours: settings?.retention.temp_max_age_hours ?? 24,
      export_bundle_max_age_days: settings?.retention.export_bundle_max_age_days ?? 7,
    },
    default_profile: settings?.default_profile ?? 'standard',
    export_mp3_bitrate: settings?.export_mp3_bitrate ?? '320k',
  }
}

function bucketFor(storageOverview: StorageOverview | null, key: StorageBucket['key']) {
  return storageOverview?.items.find((item) => item.key === key) ?? null
}

function panelCopy(view: SettingsPanelProps['view']) {
  if (view === 'preferences') {
    return {
      title: 'Defaults',
      description: 'Keep these defaults simple so imports, reruns, and exports stay fast.',
    }
  }
  if (view === 'maintenance') {
    return {
      title: 'Readiness & repair',
      description: 'Check system health and repair the library before running any cleanup.',
    }
  }
  return {
    title: 'Storage & cleanup',
    description: 'Change paths and retention only when the workspace layout needs to move.',
  }
}

export function SettingsPanel({
  settings,
  storageOverview,
  saving,
  cleaningTempStorage,
  cleaningExportBundles,
  cleaningLibraryRuns,
  view,
  onSave,
  onCleanupTempStorage,
  onCleanupExportBundles,
  onCleanupLibraryRuns,
}: SettingsPanelProps) {
  const settingsKey = settings
    ? [
        settings.storage.database_path,
        settings.storage.uploads_directory,
        settings.storage.outputs_directory,
        settings.storage.exports_directory,
        settings.storage.temp_directory,
        settings.storage.model_cache_directory,
        settings.retention.temp_max_age_hours,
        settings.retention.export_bundle_max_age_days,
        settings.default_profile,
        settings.export_mp3_bitrate,
      ].join('|')
    : 'settings'
  const [draftState, setDraftState] = useState<DraftState>(() => ({
    sourceKey: settingsKey,
    values: createDraft(settings),
  }))
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!savedAt) return
    const id = window.setTimeout(() => setSavedAt(null), 5000)
    return () => window.clearTimeout(id)
  }, [savedAt])

  const copy = panelCopy(view)

  if (view === 'maintenance') {
    return null
  }

  if (!settings) {
    return (
      <section className="section">
        <div className="section-head">
          <div className="section-head-copy">
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
          </div>
        </div>
        <div className="skeleton-stack">
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      </section>
    )
  }

  const draft = draftState.sourceKey === settingsKey ? draftState.values : createDraft(settings)
  const currentSettings = settings
  const bitrateValid = BITRATE_PATTERN.test(draft.export_mp3_bitrate)
  const exportBundles = bucketFor(storageOverview, 'export_bundles')
  const outputs = bucketFor(storageOverview, 'outputs')
  const temp = bucketFor(storageOverview, 'temp')

  function updateDraft(nextDraft: SettingsDraft) {
    setDraftState({
      sourceKey: settingsKey,
      values: nextDraft,
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!bitrateValid) return
    try {
      await onSave({
        ...draft,
        storage: {
          ...draft.storage,
          database_path: currentSettings.storage.database_path,
        },
      })
      setSavedAt(Date.now())
    } catch {
      // toast surfaces the error; don't flash "Saved."
    }
  }

  return (
    <section className="section">
      <div className="section-head">
        <div className="section-head-copy">
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </div>

      {view === 'preferences' ? (
        <form className="import-form" onSubmit={handleSubmit}>
          <div className="processing-grid">
            <div className="field">
              <ModelPicker
                profileKey={draft.default_profile}
                profiles={settings.profiles}
                allowCustom={false}
                labelId="default-model"
                onProfileChange={(nextKey) => updateDraft({ ...draft, default_profile: nextKey })}
              />
              <span className="field-hint">Used for new splits unless you change it per song.</span>
            </div>

            <label className="field">
              <span>Default MP3 bitrate</span>
              <input
                type="text"
                value={draft.export_mp3_bitrate}
                aria-invalid={!bitrateValid}
                onChange={(event) => updateDraft({ ...draft, export_mp3_bitrate: event.target.value })}
              />
              {!bitrateValid ? (
                <span className="field-error">{BITRATE_HINT}</span>
              ) : (
                <span className="field-hint">Used when exporting MP3 artifacts. Overridable per export.</span>
              )}
            </label>
          </div>

          <div className="import-footer">
            <span>{savedAt ? <span className="field-saved">Saved.</span> : null}</span>
            <button type="submit" className="button-primary" disabled={saving || !bitrateValid}>
              {saving ? <><Spinner /> Saving…</> : 'Save Preferences'}
            </button>
          </div>
        </form>
      ) : null}

      {view === 'storage' ? (
        <form className="import-form" onSubmit={handleSubmit}>
          <section className="storage-panel-block settings-cleanup-block">
            <div className="subsection-head">Reclaim space</div>
            <div className="storage-action-list">
              <div className="storage-action-row">
                <div className="storage-action-copy">
                  <strong>Clear temp workspace</strong>
                  <p>Removes temporary processing files. Safe when you want to reclaim scratch space.</p>
                </div>
                <ConfirmInline
                  label={cleaningTempStorage ? 'Working…' : formatSize(temp?.reclaimable_bytes ?? 0) ?? '0 B'}
                  pendingLabel="Working…"
                  confirmLabel="Clear temp workspace"
                  cancelLabel="Keep temp files"
                  prompt="Delete temporary processing files now?"
                  pending={cleaningTempStorage}
                  disabled={(temp?.reclaimable_bytes ?? 0) === 0}
                  onConfirm={onCleanupTempStorage}
                />
              </div>

              <div className="storage-action-row">
                <div className="storage-action-copy">
                  <strong>Delete export bundles</strong>
                  <p>Removes built zip bundles only. Your saved songs, splits, and source files stay intact.</p>
                </div>
                <ConfirmInline
                  label={cleaningExportBundles ? 'Working…' : formatSize(exportBundles?.reclaimable_bytes ?? 0) ?? '0 B'}
                  pendingLabel="Working…"
                  confirmLabel="Delete export bundles"
                  cancelLabel="Keep bundles"
                  prompt="Delete built export bundles now?"
                  pending={cleaningExportBundles}
                  disabled={(exportBundles?.reclaimable_bytes ?? 0) === 0}
                  onConfirm={onCleanupExportBundles}
                />
              </div>

              <div className="storage-action-row">
                <div className="storage-action-copy">
                  <strong>Purge non-preferred splits</strong>
                  <p>Deletes split outputs that are not marked as preferred. Use this only after you have chosen winners.</p>
                </div>
                <ConfirmInline
                  label={cleaningLibraryRuns ? 'Working…' : formatSize(outputs?.reclaimable_bytes ?? 0) ?? '0 B'}
                  pendingLabel="Working…"
                  confirmLabel="Purge non-preferred splits"
                  cancelLabel="Keep all splits"
                  prompt="Delete non-preferred split outputs across the library?"
                  pending={cleaningLibraryRuns}
                  disabled={(outputs?.reclaimable_bytes ?? 0) === 0}
                  onConfirm={async () => onCleanupLibraryRuns()}
                />
              </div>
            </div>
          </section>

          <section className="storage-panel-block">
            <div className="subsection-head">Workspace usage</div>
            <div className="storage-usage-list">
              {(storageOverview?.items ?? []).map((item) => (
                <article key={item.key} className="storage-usage-row">
                  <div className="storage-usage-copy">
                    <strong>{item.label}</strong>
                    <p>{item.path}</p>
                  </div>
                  <div className="storage-usage-metrics">
                    <span>{formatSize(item.total_bytes)}</span>
                    <span>
                      {item.reclaimable_bytes > 0
                        ? `${formatSize(item.reclaimable_bytes)} reclaimable`
                        : 'No cleanup action'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            {!storageOverview ? (
              <div className="skeleton-stack">
                <Skeleton height={36} />
                <Skeleton height={36} />
                <Skeleton height={36} />
              </div>
            ) : null}
          </section>

          <details className="storage-panel-block storage-paths-collapsible">
            <summary className="subsection-head">Storage paths &amp; retention</summary>
            <div className="storage-path-grid">
              <label className="field">
                <span>Database path</span>
                <input type="text" value={draft.storage.database_path} readOnly />
              </label>

              <label className="field">
                <span>Uploads directory</span>
                <input
                  type="text"
                  value={draft.storage.uploads_directory}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      storage: { ...draft.storage, uploads_directory: event.target.value },
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Outputs directory</span>
                <input
                  type="text"
                  value={draft.storage.outputs_directory}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      storage: { ...draft.storage, outputs_directory: event.target.value },
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Exports directory</span>
                <input
                  type="text"
                  value={draft.storage.exports_directory}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      storage: { ...draft.storage, exports_directory: event.target.value },
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Temp directory</span>
                <input
                  type="text"
                  value={draft.storage.temp_directory}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      storage: { ...draft.storage, temp_directory: event.target.value },
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Model cache directory</span>
                <input
                  type="text"
                  value={draft.storage.model_cache_directory}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      storage: { ...draft.storage, model_cache_directory: event.target.value },
                    })
                  }
                />
              </label>
            </div>

            <div className="storage-panel-subhead">Retention</div>
            <div className="processing-grid">
              <label className="field">
                <span>Temp max age (hours)</span>
                <input
                  type="number"
                  min={1}
                  value={draft.retention.temp_max_age_hours}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      retention: {
                        ...draft.retention,
                        temp_max_age_hours: Math.max(1, Number(event.target.value) || 1),
                      },
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Export bundle max age (days)</span>
                <input
                  type="number"
                  min={1}
                  value={draft.retention.export_bundle_max_age_days}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      retention: {
                        ...draft.retention,
                        export_bundle_max_age_days: Math.max(1, Number(event.target.value) || 1),
                      },
                    })
                  }
                />
              </label>
            </div>
          </details>

          <div className="import-footer">
            <span>{savedAt ? <span className="field-saved">Storage settings saved.</span> : null}</span>
            <button type="submit" className="button-primary" disabled={saving || !bitrateValid}>
              {saving ? <><Spinner /> Saving…</> : 'Save Storage Settings'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
