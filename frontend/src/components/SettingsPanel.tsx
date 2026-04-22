import { useEffect, useState } from 'react'

import type { Settings, StorageBucket, StorageOverview } from '../types'
import { formatSize } from './metrics'
import { Skeleton } from './feedback/Skeleton'
import { Spinner } from './feedback/Spinner'

type SettingsPanelProps = {
  settings: Settings | null
  storageOverview: StorageOverview | null
  saving: boolean
  cleaningTempStorage: boolean
  cleaningExportBundles: boolean
  cleaningLibraryRuns: boolean
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
    default_preset: settings?.default_preset ?? 'standard',
    export_mp3_bitrate: settings?.export_mp3_bitrate ?? '320k',
  }
}

function formatBytes(bytes: number) {
  return formatSize(bytes) ?? '0 KB'
}

function bucketFor(storageOverview: StorageOverview | null, key: StorageBucket['key']) {
  return storageOverview?.items.find((item) => item.key === key) ?? null
}

export function SettingsPanel({
  settings,
  storageOverview,
  saving,
  cleaningTempStorage,
  cleaningExportBundles,
  cleaningLibraryRuns,
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
        settings.default_preset,
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

  if (!settings) {
    return (
      <section className="section">
        <div className="section-head">
          <h2>Preferences</h2>
        </div>
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
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
        <h2>Preferences</h2>
      </div>

      <form className="import-form" onSubmit={handleSubmit}>
        <div className="processing-grid">
          <label className="field">
            <span>Default profile</span>
            <select
              value={draft.default_preset}
              onChange={(event) => updateDraft({ ...draft, default_preset: event.target.value })}
            >
              {settings.profiles.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label} — {preset.strength}
                </option>
              ))}
            </select>
            {(() => {
              const current = settings.profiles.find((preset) => preset.key === draft.default_preset)
              if (!current) return null
              return (
                <span className="field-hint">
                  <strong>{current.strength}.</strong> {current.description} Used for new renders unless you change it per track.
                </span>
              )
            })()}
          </label>

          <label className="field">
            <span>MP3 bitrate</span>
            <input
              type="text"
              value={draft.export_mp3_bitrate}
              aria-invalid={!bitrateValid}
              onChange={(event) => updateDraft({ ...draft, export_mp3_bitrate: event.target.value })}
            />
            {!bitrateValid ? <span className="field-error">{BITRATE_HINT}</span> : null}
          </label>
        </div>

        <section className="storage-panel-block">
          <div className="subsection-head">Storage usage</div>
          <div className="storage-usage-list">
            {(storageOverview?.items ?? []).map((item) => (
              <article key={item.key} className="storage-usage-row">
                <div className="storage-usage-copy">
                  <strong>{item.label}</strong>
                  <p>{item.path}</p>
                </div>
                <div className="storage-usage-metrics">
                  <span>{formatBytes(item.total_bytes)}</span>
                  <span>{item.reclaimable_bytes > 0 ? `${formatBytes(item.reclaimable_bytes)} reclaimable` : 'No cleanup action'}</span>
                </div>
              </article>
            ))}
          </div>
          {!storageOverview ? (
            <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
              <Skeleton height={36} />
              <Skeleton height={36} />
              <Skeleton height={36} />
            </div>
          ) : null}
        </section>

        <section className="storage-panel-block">
          <div className="subsection-head">Storage paths</div>
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
        </section>

        <section className="storage-panel-block">
          <div className="subsection-head">Retention</div>
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
        </section>

        <section className="storage-panel-block">
          <div className="subsection-head">Cleanup</div>
          <div className="storage-action-list">
            <button
              type="button"
              className="button-secondary storage-action-row"
              disabled={cleaningTempStorage || (temp?.reclaimable_bytes ?? 0) === 0}
              onClick={() => void onCleanupTempStorage()}
            >
              <span>Clear temp workspace</span>
              <span>{cleaningTempStorage ? <><Spinner /> Working</> : formatBytes(temp?.reclaimable_bytes ?? 0)}</span>
            </button>

            <button
              type="button"
              className="button-secondary storage-action-row"
              disabled={cleaningExportBundles || (exportBundles?.reclaimable_bytes ?? 0) === 0}
              onClick={() => void onCleanupExportBundles()}
            >
              <span>Delete export bundles</span>
              <span>{cleaningExportBundles ? <><Spinner /> Working</> : formatBytes(exportBundles?.reclaimable_bytes ?? 0)}</span>
            </button>

            <button
              type="button"
              className="button-secondary storage-action-row"
              disabled={cleaningLibraryRuns || (outputs?.reclaimable_bytes ?? 0) === 0}
              onClick={() => void onCleanupLibraryRuns()}
            >
              <span>Purge non-final runs</span>
              <span>{cleaningLibraryRuns ? <><Spinner /> Working</> : formatBytes(outputs?.reclaimable_bytes ?? 0)}</span>
            </button>
          </div>
        </section>

        <div className="import-footer">
          <span>{savedAt ? <span className="field-saved">Saved.</span> : null}</span>
          <button type="submit" className="button-primary" disabled={saving || !bitrateValid}>
            {saving ? <><Spinner /> Saving</> : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
