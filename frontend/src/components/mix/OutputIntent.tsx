import type { ProcessingProfile, RunDetail, RunMixStemEntry } from '../../types'
import {
  INTENTS,
  inferIntent,
  isIntentSupported,
  resolveIntentTemplate,
} from './outputIntentTemplates'

type OutputIntentPickerProps = {
  run: RunDetail
  profiles: ProcessingProfile[]
  onApplyTemplate: (stems: RunMixStemEntry[]) => void | Promise<void>
  onRerunWithProfile: (profileKey: string) => void
  onExport: () => void
  onReveal: () => void
}

export function OutputIntentPicker({
  run,
  profiles,
  onApplyTemplate,
  onRerunWithProfile,
  onExport,
  onReveal,
}: OutputIntentPickerProps) {
  const inferredIntent = inferIntent(run)
  const activeIntent = inferredIntent

  return (
    <section className="output-intent">
      <div className="output-intent-head">
        <h3 className="subsection-head">Choose the result</h3>
        <p className="output-intent-summary">
          Start with the listening outcome you want. Manual balancing stays below if the preset is
          close but not exact.
        </p>
      </div>
      <div className="output-intent-options" role="group" aria-label="Quick mix presets">
        {INTENTS.map((spec) => {
          const supported = isIntentSupported(spec, run)
          if (supported) {
            const isActive = spec.value === activeIntent
            return (
              <button
                key={spec.value}
                type="button"
                aria-pressed={isActive}
                className={`output-intent-option ${isActive ? 'active' : ''}`}
                onClick={() => {
                  const template = resolveIntentTemplate(spec.value, run.artifacts)
                  if (template) void onApplyTemplate(template)
                }}
              >
                <span className="output-intent-option-label">{spec.label}</span>
                <span className="output-intent-option-desc">{spec.description}</span>
              </button>
            )
          }
          const fallback = spec.requiresProfile
            ? profiles.find((profile) => profile.key === spec.requiresProfile) ?? null
            : null
          const disabled = fallback === null
          return (
            <button
              key={spec.value}
              type="button"
              disabled={disabled}
              className="output-intent-option output-intent-option-unsupported"
              onClick={() => {
                if (fallback) onRerunWithProfile(fallback.key)
              }}
            >
              <span className="output-intent-option-label">{spec.label}</span>
              <span className="output-intent-option-desc">
                {fallback
                  ? `Rerun with ${fallback.label} to enable.`
                  : 'Not available for the stems this run produced.'}
              </span>
            </button>
          )
        })}
      </div>
      <div className="output-intent-footer">
        <button type="button" className="button-primary" onClick={onExport}>
          Export this result
        </button>
        <button type="button" className="button-secondary" onClick={onReveal}>
          Open render folder
        </button>
      </div>
    </section>
  )
}
