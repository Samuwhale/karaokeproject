import { useState } from 'react'

import type { Settings } from '../types'

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

  if (!settings) {
    return <section className="section skeleton">Loading settings…</section>
  }

  const draft = draftState.sourceKey === settingsKey ? draftState.values : createDraft(settings)

  function updateDraft(nextDraft: SettingsDraft) {
    setDraftState({
      sourceKey: settingsKey,
      values: nextDraft,
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSave(draft)
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Settings</h2>
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
              onChange={(event) => updateDraft({ ...draft, export_mp3_bitrate: event.target.value })}
            />
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
          <span />
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
