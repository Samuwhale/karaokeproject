import { useMemo, useState } from 'react'

import type { ProcessingProfile, RunDetail, RunMixStemEntry } from '../../types'
import {
  INTENTS,
  type OutputIntent,
  inferIntent,
  isIntentSupported,
  resolveIntentTemplate,
} from './outputIntentTemplates'

type OutputIntentPickerProps = {
  run: RunDetail
  profiles: ProcessingProfile[]
  onApplyTemplate: (stems: RunMixStemEntry[]) => void | Promise<void>
  onRerunWithProfile: (profileKey: string) => void
  saving: boolean
}

type PendingIntentState = {
  runId: string
  value: OutputIntent
}

export function OutputIntentPicker({
  run,
  profiles,
  onApplyTemplate,
  onRerunWithProfile,
  saving,
}: OutputIntentPickerProps) {
  const inferredIntent = inferIntent(run)
  const [pendingIntent, setPendingIntent] = useState<PendingIntentState | null>(null)
  const activeIntent =
    pendingIntent?.runId === run.id ? pendingIntent.value : inferredIntent
  const activeIntentSpec = useMemo(
    () => INTENTS.find((spec) => spec.value === activeIntent) ?? null,
    [activeIntent],
  )

  async function handleApplyIntent(intent: OutputIntent) {
    const template = resolveIntentTemplate(intent, run.artifacts)
    if (!template) return

    setPendingIntent({ runId: run.id, value: intent })
    try {
      await onApplyTemplate(template)
    } catch {
      setPendingIntent((current) =>
        current?.runId === run.id && current.value === intent ? null : current,
      )
    }
  }

  return (
    <section className="output-intent">
      <div className="output-intent-head">
        <h3 className="subsection-head">Starting Balance</h3>
        <p className="output-intent-summary">
          Pick the closest outcome first, then adjust the stem rows below.
        </p>
        <span className="output-intent-state" aria-live="polite">
          {saving
            ? activeIntentSpec
              ? `Saving ${activeIntentSpec.label.toLowerCase()}…`
              : 'Saving changes…'
            : activeIntentSpec
              ? `${activeIntentSpec.label} loaded.`
              : 'No preset fully matches the current balance.'}
        </span>
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
                  void handleApplyIntent(spec.value)
                }}
              >
                <span className="output-intent-option-label">{spec.label}</span>
                {isActive ? <span className="output-intent-option-desc">{spec.description}</span> : null}
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
                  ? `Prepare another split with ${fallback.label} to unlock this target.`
                  : 'Not available for the stems this run produced.'}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
