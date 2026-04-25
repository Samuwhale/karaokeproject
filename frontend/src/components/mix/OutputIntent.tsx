import { useMemo, useState } from 'react'

import { discardRejection } from '../../async'
import type { RunDetail, RunMixStemEntry } from '../../types'
import { isStemKind } from '../../stems'
import {
  INTENTS,
  type OutputIntent,
  inferIntent,
  isIntentSupported,
  resolveIntentTemplate,
} from './outputIntentTemplates'

type OutputIntentPickerProps = {
  run: RunDetail
  saving: boolean
  onApplyTemplate: (stems: RunMixStemEntry[]) => void | Promise<void>
}

function resolveResetTemplate(run: RunDetail): RunMixStemEntry[] {
  return run.artifacts
    .filter((artifact) => isStemKind(artifact.kind))
    .map((artifact) => ({ artifact_id: artifact.id, gain_db: 0, muted: false }))
}

function isResetMix(run: RunDetail) {
  if (!run.mix.stems.length) return true
  return run.mix.stems.every((entry) => Math.abs(entry.gain_db) < 0.05 && !entry.muted)
}

export function OutputIntentPicker({ run, saving, onApplyTemplate }: OutputIntentPickerProps) {
  const inferred = inferIntent(run)
  const [pendingIntent, setPendingIntent] = useState<OutputIntent | 'reset' | null>(null)
  const activeIntent = saving && pendingIntent ? pendingIntent : inferred
  const atRest = !inferred && isResetMix(run)
  const supported = useMemo(() => INTENTS.filter((spec) => isIntentSupported(spec, run)), [run])

  async function applyIntent(intent: OutputIntent) {
    const template = resolveIntentTemplate(intent, run.artifacts)
    if (!template) return
    setPendingIntent(intent)
    try {
      await onApplyTemplate(template)
    } finally {
      setPendingIntent((current) => (current === intent ? null : current))
    }
  }

  async function applyReset() {
    if (atRest) return
    setPendingIntent('reset')
    try {
      await onApplyTemplate(resolveResetTemplate(run))
    } finally {
      setPendingIntent((current) => (current === 'reset' ? null : current))
    }
  }

  if (!supported.length && atRest) return null

  return (
    <div className="mix-presets" role="group" aria-label="Output preset">
      <span className="mix-presets-label" aria-hidden>Preset</span>
      <div className="mix-preset-group">
        {supported.map((spec) => {
          const active = activeIntent === spec.value
          return (
            <button
              key={spec.value}
              type="button"
              className={`mix-preset ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              title={spec.description}
              onClick={() => discardRejection(() => applyIntent(spec.value))}
            >
              {spec.label}
            </button>
          )
        })}
        {!atRest ? (
          <>
            <span className="mix-preset-sep" aria-hidden />
            <button
              type="button"
              className="mix-preset mix-preset-reset"
              onClick={() => discardRejection(applyReset)}
              title="Unmute every stem at 0 dB"
            >
              Full mix
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
