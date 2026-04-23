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
  compact?: boolean
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
  compact = false,
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
    <div className={`output-intent ${compact ? 'output-intent-compact' : ''}`}>
      <div className="output-intent-head">
        <div className="output-intent-copy">
          <h3 className="subsection-head">Mix presets</h3>
          {!compact ? (
            <p className="output-intent-summary">
              Start from the closest proven result, then fine-tune the stem balance in the mixer.
            </p>
          ) : null}
        </div>
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
              {!compact ? <span className="output-intent-option-desc">{spec.description}</span> : null}
            </button>
          )
        })}
      </div>

      {rerunSuggestions.length > 0 ? (
        <details className="output-intent-reruns">
          <summary>Need another kind of split?</summary>
          <div className="output-intent-reruns-body">
            <p>Queue a more suitable version instead of forcing the current split to do too much.</p>
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
        </details>
      ) : null}
    </div>
  )
}
