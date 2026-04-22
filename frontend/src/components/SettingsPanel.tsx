import { useEffect, useState } from 'react'

import type { Settings } from '../types'
import { Skeleton } from './feedback/Skeleton'
import { Spinner } from './feedback/Spinner'

type SettingsPanelProps = {
  settings: Settings | null
  saving: boolean
  onSave: (settings: Omit<Settings, 'profiles'>) => Promise<void>
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
    output_directory: settings?.output_directory ?? '',
    model_cache_directory: settings?.model_cache_directory ?? '',
    default_preset: settings?.default_preset ?? 'balanced',
    export_mp3_bitrate: settings?.export_mp3_bitrate ?? '320k',
  }
}

export function SettingsPanel({ settings, saving, onSave }: SettingsPanelProps) {
  const settingsKey = settings
    ? [
        settings.output_directory,
        settings.model_cache_directory,
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
        </div>
      </section>
    )
  }

  const draft = draftState.sourceKey === settingsKey ? draftState.values : createDraft(settings)
  const bitrateValid = BITRATE_PATTERN.test(draft.export_mp3_bitrate)

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
      await onSave(draft)
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
                  {preset.label}
                </option>
              ))}
            </select>
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

        <label className="field">
          <span>Output directory</span>
          <input
            type="text"
            value={draft.output_directory}
            onChange={(event) => updateDraft({ ...draft, output_directory: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Model cache directory</span>
          <input
            type="text"
            value={draft.model_cache_directory}
            onChange={(event) => updateDraft({ ...draft, model_cache_directory: event.target.value })}
          />
        </label>

        <div className="import-footer">
          <span>
            {savedAt ? <span className="field-saved">Saved.</span> : null}
          </span>
          <button type="submit" className="button-primary" disabled={saving || !bitrateValid}>
            {saving ? <><Spinner /> Saving</> : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
