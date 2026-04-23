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
  const supportedIntents = useMemo(
    () => INTENTS.filter((spec) => isIntentSupported(spec, run)),
    [run],
  )
  const activeIntent = pendingIntent?.runId === run.id ? pendingIntent.value : inferredIntent
  const activeIntentSpec = useMemo(
    () => INTENTS.find((spec) => spec.value === activeIntent) ?? null,
    [activeIntent],
  )
  const rerunSuggestions = useMemo(
    () =>
      INTENTS.filter((spec) => !isIntentSupported(spec, run))
        .map((spec) => ({
          spec,
          fallback: spec.requiresProfile
            ? profiles.find((profile) => profile.key === spec.requiresProfile) ?? null
            : null,
        }))
        .filter(
          (item): item is { spec: (typeof INTENTS)[number]; fallback: ProcessingProfile } =>
            item.fallback !== null,
        ),
    [profiles, run],
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
          Start from the closest result, then fine-tune the stem balance below.
        </p>
        <span className="output-intent-state" aria-live="polite">
          {saving
            ? activeIntentSpec
              ? `Saving ${activeIntentSpec.label.toLowerCase()}…`
              : 'Saving changes…'
            : activeIntentSpec
              ? `${activeIntentSpec.label} loaded.`
              : 'The current balance is custom.'}
        </span>
      </div>

      <div className="output-intent-options" role="group" aria-label="Quick mix presets">
        {supportedIntents.map((spec) => {
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
              <span className="output-intent-option-desc">{spec.description}</span>
            </button>
          )
        })}
      </div>

      {rerunSuggestions.length > 0 ? (
        <div className="output-intent-reruns">
          <div className="output-intent-reruns-copy">
            <strong>Need another version first?</strong>
            <p>Some outcomes need a more detailed split. Queue that separately instead of mixing and rerunning from the same control.</p>
          </div>
          <div className="output-intent-reruns-actions">
            {rerunSuggestions.map(({ spec, fallback }) => (
              <button
                key={spec.value}
                type="button"
                className="button-secondary"
                onClick={() => onRerunWithProfile(fallback.key)}
              >
                Queue {spec.label.toLowerCase()} version
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
