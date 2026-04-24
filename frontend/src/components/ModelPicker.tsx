import type { ProcessingProfile } from '../types'
import { stemLabel } from '../stems'

type ModelPickerProps = {
  profileKey: string
  profiles: ProcessingProfile[]
  labelId?: string
  onProfileChange: (nextKey: string) => void
}

export function ModelPicker({
  profileKey,
  profiles,
  labelId,
  onProfileChange,
}: ModelPickerProps) {
  const currentProfile = profiles.find((profile) => profile.key === profileKey) ?? null

  return (
    <div className="model-picker">
      <label className="field">
        <span>Split type</span>
        <select
          id={labelId}
          value={profileKey}
          onChange={(event) => onProfileChange(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.key} value={profile.key}>
              {profile.label} - {profile.strength}
            </option>
          ))}
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
          {currentProfile.tradeoff ? (
            <p className="model-picker-meta-note">{currentProfile.tradeoff}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
