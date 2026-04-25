import type { QualityOption, RunProcessingConfigInput, StemOption, StemQuality } from '../types'

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
    if (next.has(name)) next.delete(name)
    else next.add(name)
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

export function stemSelectionLabel(stems: string[], stemOptions: StemOption[]) {
  const labels = new Map(stemOptions.map((option) => [option.name, option.label]))
  return stems.map((stem) => labels.get(stem) ?? stem).join(' + ')
}

function usesQualityRoute(stems: string[]) {
  const selected = new Set(stems)
  const wantsBandOnlyVocals = selected.has('vocals') && (selected.has('drums') || selected.has('bass') || selected.has('other'))
  return (
    selected.has('instrumental') ||
    selected.has('lead_vocals') ||
    selected.has('backing_vocals') ||
    (selected.has('vocals') && !wantsBandOnlyVocals)
  )
}
