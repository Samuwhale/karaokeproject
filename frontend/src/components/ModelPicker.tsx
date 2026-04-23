import type { CachedModel, ProcessingProfile } from '../types'
import { CUSTOM_PROFILE_KEY } from '../types'
import { stemLabel } from '../stems'
import { isValidModelFilename } from './modelPickerShared'

type ModelPickerProps = {
  profileKey: string
  modelFilename?: string | null
  profiles: ProcessingProfile[]
  cachedModels?: CachedModel[]
  allowCustom?: boolean
  labelId?: string
  onProfileChange: (nextKey: string) => void
  onModelFilenameChange?: (next: string) => void
}

export function ModelPicker({
  profileKey,
  modelFilename,
  profiles,
  cachedModels,
  allowCustom = true,
  labelId,
  onProfileChange,
  onModelFilenameChange,
}: ModelPickerProps) {
  const currentProfile = profiles.find((profile) => profile.key === profileKey) ?? null
  const isCustom = profileKey === CUSTOM_PROFILE_KEY
  const filename = modelFilename ?? ''
  const customValid = !isCustom || isValidModelFilename(filename)
  const cached = cachedModels ?? []
  const datalistId = labelId ? `${labelId}-cached-models` : 'model-picker-cached-models'

  return (
    <div className="model-picker">
      <label className="field">
        <span>Model</span>
        <select
          value={profileKey}
          onChange={(event) => onProfileChange(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.key} value={profile.key} title={profile.tradeoff}>
              {profile.label} — {profile.strength}
            </option>
          ))}
          {allowCustom ? (
            <option value={CUSTOM_PROFILE_KEY}>Pick a specific model</option>
          ) : null}
        </select>
      </label>

      {currentProfile ? (
        <div className="model-picker-meta">
          <p className="model-picker-meta-line">{currentProfile.best_for}</p>
          {currentProfile.stems.length ? (
            <p className="model-picker-meta-stems">
              Produces {currentProfile.stems.map(stemLabel).join(', ')}
            </p>
          ) : null}
        </div>
      ) : isCustom ? (
        <p className="model-picker-meta-note">
          Pick any audio-separator model already cached locally, or type a filename. You are on your own for quality.
        </p>
      ) : null}

      {isCustom && onModelFilenameChange ? (
        <label className="field">
          <span>Model filename</span>
          <input
            type="text"
            list={datalistId}
            placeholder="e.g. model_bs_roformer_ep_368_sdr_12.9628.ckpt"
            value={filename}
            aria-invalid={!customValid}
            onChange={(event) => onModelFilenameChange(event.target.value)}
          />
          <datalist id={datalistId}>
            {cached.map((model) => (
              <option key={model.filename} value={model.filename} />
            ))}
          </datalist>
          {!customValid ? (
            <span className="field-error">Enter a bare filename ending in .ckpt, .onnx, .pth, .yaml, or .yml.</span>
          ) : cached.length ? (
            <span className="field-hint">
              Type or pick from the {cached.length} model{cached.length === 1 ? '' : 's'} already cached.
            </span>
          ) : (
            <span className="field-hint">
              No models cached yet. Type a filename audio-separator can resolve.
            </span>
          )}
        </label>
      ) : null}
    </div>
  )
}
