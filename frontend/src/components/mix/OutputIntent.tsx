import type { ProcessingProfile, RunArtifact, RunDetail, RunMixStemEntry } from '../../types'
import { isStemKind, stemNameFromKind } from '../../stems'

export type OutputIntent = 'karaoke' | 'instrumental-with-backing' | 'acapella'

type IntentSpec = {
  value: OutputIntent
  label: string
  description: string
  // Stems to mute for this intent (by canonical name). All others play at unity.
  mutes: readonly string[]
  // Run must contain at least one of these stems for the intent to be
  // usable. If none are present, the button offers to rerun with
  // `requiresProfile` instead.
  requires: readonly string[]
  requiresProfile?: string
}

const INTENTS: readonly IntentSpec[] = [
  {
    value: 'karaoke',
    label: 'Karaoke',
    description: 'Instrumental only — every vocal stem muted.',
    mutes: ['vocals', 'lead_vocals', 'backing_vocals'],
    requires: ['vocals', 'lead_vocals', 'backing_vocals'],
  },
  {
    value: 'instrumental-with-backing',
    label: 'Instrumental + backing',
    description: 'Karaoke with the backing vocals kept in.',
    mutes: ['lead_vocals'],
    requires: ['lead_vocals'],
    // The only shipping profile that emits a lead/backing split.
    requiresProfile: 'karaoke-stems',
  },
  {
    value: 'acapella',
    label: 'Acapella',
    description: 'Vocals only — everything non-vocal muted.',
    mutes: ['instrumental', 'drums', 'bass', 'other', 'piano', 'guitar'],
    requires: ['vocals', 'lead_vocals'],
  },
] as const

function stemArtifacts(run: RunDetail): RunArtifact[] {
  return run.artifacts.filter((artifact) => isStemKind(artifact.kind))
}

function stemNamesFor(run: RunDetail): Set<string> {
  const names = new Set<string>()
  for (const artifact of stemArtifacts(run)) {
    const name = stemNameFromKind(artifact.kind)
    if (name) names.add(name)
  }
  return names
}

function isSupported(spec: IntentSpec, run: RunDetail): boolean {
  const available = stemNamesFor(run)
  return spec.requires.some((name) => available.has(name))
}

function matchesTemplate(spec: IntentSpec, run: RunDetail): boolean {
  const muteSet = new Set(spec.mutes)
  const mixByArtifact = new Map(run.mix.stems.map((entry) => [entry.artifact_id, entry]))
  const artifacts = stemArtifacts(run)
  if (!artifacts.length) return false
  for (const artifact of artifacts) {
    const name = stemNameFromKind(artifact.kind) ?? ''
    const expectedMuted = muteSet.has(name)
    const entry = mixByArtifact.get(artifact.id)
    const actualMuted = entry?.muted ?? false
    const actualGain = entry?.gain_db ?? 0
    if (expectedMuted !== actualMuted) return false
    if (Math.abs(actualGain) > 0.05) return false
  }
  return true
}

// Reading the active intent from the mix state (rather than storing it) is
// what keeps the picker and MixPanel in sync — any stem edit that breaks a
// template naturally de-selects the intent button.
export function inferIntent(run: RunDetail): OutputIntent | null {
  for (const spec of INTENTS) {
    if (!isSupported(spec, run)) continue
    if (matchesTemplate(spec, run)) return spec.value
  }
  return null
}

export function resolveIntentTemplate(
  intent: OutputIntent,
  artifacts: RunArtifact[],
): RunMixStemEntry[] | null {
  const spec = INTENTS.find((candidate) => candidate.value === intent)
  if (!spec) return null
  return artifacts
    .filter((artifact) => isStemKind(artifact.kind))
    .map((artifact) => {
      const name = stemNameFromKind(artifact.kind) ?? ''
      return {
        artifact_id: artifact.id,
        gain_db: 0,
        muted: spec.mutes.includes(name),
      }
    })
}

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
  const active = inferIntent(run)

  return (
    <section className="output-intent">
      <header className="output-intent-head">
        <h3 className="subsection-head">Result</h3>
        <div className="output-intent-actions">
          <button type="button" className="button-primary" onClick={onExport}>
            Export files
          </button>
          <button type="button" className="button-secondary" onClick={onReveal}>
            Open folder
          </button>
        </div>
      </header>
      <div className="output-intent-options" role="group" aria-label="Quick mix presets">
        {INTENTS.map((spec) => {
          const supported = isSupported(spec, run)
          if (supported) {
            const isActive = spec.value === active
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
              onClick={() => fallback && onRerunWithProfile(fallback.key)}
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
    </section>
  )
}
