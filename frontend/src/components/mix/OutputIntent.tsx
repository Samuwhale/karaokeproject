import { useMemo, useState } from 'react'

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
    setPendingIntent('reset')
    try {
      await onApplyTemplate(resolveResetTemplate(run))
    } finally {
      setPendingIntent((current) => (current === 'reset' ? null : current))
    }
  }

  const buttons: Array<
    | { kind: 'intent'; value: OutputIntent; label: string; active: boolean }
    | { kind: 'reset'; active: boolean }
  > = [
    ...supported.map((spec) => ({
      kind: 'intent' as const,
      value: spec.value,
      label: spec.label,
      active: activeIntent === spec.value,
    })),
    { kind: 'reset' as const, active: atRest && activeIntent === null },
  ]

  return (
    <div className="mix-presets" role="group" aria-label="Starting balance">
      {buttons.map((button, index) => (
        <span key={button.kind === 'intent' ? button.value : 'reset'} style={{ display: 'contents' }}>
          {index > 0 ? <span className="mix-preset-sep" aria-hidden>·</span> : null}
          <button
            type="button"
            className={`mix-preset ${button.active ? 'is-active' : ''}`}
            aria-pressed={button.active}
            onClick={() => {
              if (button.kind === 'intent') void applyIntent(button.value)
              else void applyReset()
            }}
          >
            {button.kind === 'intent' ? button.label : 'Reset'}
          </button>
        </span>
      ))}
    </div>
  )
}
