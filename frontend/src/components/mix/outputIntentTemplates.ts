import type { RunArtifact, RunDetail, RunMixStemEntry } from '../../types'
import { isStemKind, stemNameFromKind } from '../../stems'

export type OutputIntent = 'karaoke' | 'instrumental-with-backing' | 'acapella'

type IntentSpec = {
  value: OutputIntent
  label: string
  description: string
  mutes: readonly string[]
  requires: readonly string[]
  requiresProfile?: string
}

export const INTENTS: readonly IntentSpec[] = [
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

export function isIntentSupported(spec: IntentSpec, run: RunDetail): boolean {
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

export function inferIntent(run: RunDetail): OutputIntent | null {
  for (const spec of INTENTS) {
    if (!isIntentSupported(spec, run)) continue
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
