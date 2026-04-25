import type { QualityOption, RunProcessingConfigInput, StemOption, StemQuality } from '../types'

const BAND_STEMS = new Set(['drums', 'bass', 'other'])
const VOCAL_ROUTE_STEMS = new Set(['vocals', 'instrumental', 'lead_vocals', 'backing_vocals'])

type StemSelectionPickerProps = {
  value: RunProcessingConfigInput
  stemOptions: StemOption[]
  qualityOptions: QualityOption[]
  disabled?: boolean
  onChange: (next: RunProcessingConfigInput) => void
}

export function StemSelectionPicker({
  value,
  stemOptions,
  qualityOptions,
  disabled = false,
  onChange,
}: StemSelectionPickerProps) {
  const selected = new Set(value.stems)
  const usesVocalQualityRoute = usesQualityRoute(value.stems)
  const visibleQualityOptions = usesVocalQualityRoute ? qualityOptions : []

  function toggleStem(name: string) {
    const next = new Set(selected)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
      if (name === 'instrumental') {
        BAND_STEMS.forEach((stem) => next.delete(stem))
      } else if (BAND_STEMS.has(name)) {
        next.delete('instrumental')
      }
    }
    const stems = stemOptions.map((option) => option.name).filter((name) => next.has(name))
    onChange({ ...value, stems, quality: usesQualityRoute(stems) ? value.quality : 'balanced' })
  }

  function setQuality(quality: StemQuality) {
    onChange({ ...value, quality })
  }

  return (
    <div className="stem-selection-picker">
      <div className="stem-checklist" role="group" aria-label="Stems to create">
        {stemOptions.map((option) => {
          const checked = selected.has(option.name)
          return (
            <label key={option.name} className={`stem-check ${checked ? 'is-selected' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggleStem(option.name)}
              />
              <span>{option.label}</span>
            </label>
          )
        })}
      </div>

      {visibleQualityOptions.length > 1 ? (
        <div className="stem-quality" role="group" aria-label="Stem quality">
          {visibleQualityOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`segmented ${value.quality === option.key ? 'segmented-active' : ''}`}
              disabled={disabled}
              onClick={() => setQuality(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function usesQualityRoute(stems: string[]) {
  return stems.some((stem) => VOCAL_ROUTE_STEMS.has(stem))
}
