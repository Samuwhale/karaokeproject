import type { RunDetail, RunArtifact, ArtifactMetrics } from '../types'
import { compareStemKinds, isStemKind } from '../stems'
import { WaveformOverlay } from './WaveformOverlay'
import {
  formatChannels,
  formatDuration,
  formatLufs,
  formatSampleRate,
  formatSize,
  formatTruePeak,
} from './metrics'

type CompareViewProps = {
  runA: RunDetail
  runB: RunDetail
  keeperRunId: string | null
  settingKeeper: boolean
  onSetKeeper: (runId: string) => void | Promise<void>
}

// Prefer the canonical whole-run mix render, then stems shared between both
// runs, then the source file.
const PREFERRED_MIX_KIND = 'export-mix-wav'
const STATIC_OVERLAY_ORDER = ['source'] as const

function findArtifact(run: RunDetail, kind: string): RunArtifact | null {
  return run.artifacts.find((artifact) => artifact.kind === kind) ?? null
}

function sharedPreferredMixKind(runA: RunDetail, runB: RunDetail): string | null {
  if (findArtifact(runA, PREFERRED_MIX_KIND) && findArtifact(runB, PREFERRED_MIX_KIND)) {
    return PREFERRED_MIX_KIND
  }
  return null
}

function pairedArtifacts(runA: RunDetail, runB: RunDetail) {
  const kindsA = new Set(runA.artifacts.map((artifact) => artifact.kind))
  const sharedStemKinds = runB.artifacts
    .map((artifact) => artifact.kind)
    .filter((kind) => isStemKind(kind) && kindsA.has(kind))
    .sort(compareStemKinds)

  const orderedKinds: string[] = []
  const mixKind = sharedPreferredMixKind(runA, runB)
  if (mixKind) orderedKinds.push(mixKind)
  orderedKinds.push(...sharedStemKinds)
  for (const kind of STATIC_OVERLAY_ORDER) {
    if (kindsA.has(kind) && findArtifact(runB, kind)) orderedKinds.push(kind)
  }

  return orderedKinds.flatMap((kind) => {
    const a = findArtifact(runA, kind)
    const b = findArtifact(runB, kind)
    if (!a || !b) return []
    return [{ kind, a, b }]
  })
}

type RowProps = {
  label: string
  valueA: string
  valueB: string
  compareAsValue?: boolean
  delta?: string | null
}

function CompareRow({ label, valueA, valueB, compareAsValue = false, delta }: RowProps) {
  const differs = compareAsValue && valueA !== valueB
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className={differs ? 'compare-diff' : ''}>{valueA}</td>
      <td className={differs ? 'compare-diff' : ''}>
        {valueB}
        {delta ? <span className="compare-delta"> {delta}</span> : null}
      </td>
    </tr>
  )
}

function formatDelta(a: number | null | undefined, b: number | null | undefined, unit: string) {
  if (a == null || b == null) return null
  const diff = b - a
  if (Math.abs(diff) < 0.05) return null
  const sign = diff > 0 ? '+' : ''
  return `Δ ${sign}${diff.toFixed(1)} ${unit}`
}

function matchedMetrics(runA: RunDetail, runB: RunDetail): {
  kind: string
  metricsA: ArtifactMetrics
  metricsB: ArtifactMetrics
} | null {
  const artifactA = findArtifact(runA, PREFERRED_MIX_KIND)
  const artifactB = findArtifact(runB, PREFERRED_MIX_KIND)
  if (artifactA?.metrics && artifactB?.metrics) {
    return {
      kind: PREFERRED_MIX_KIND,
      metricsA: artifactA.metrics,
      metricsB: artifactB.metrics,
    }
  }
  return null
}

export function CompareView({
  runA,
  runB,
  keeperRunId,
  settingKeeper,
  onSetKeeper,
}: CompareViewProps) {
  const matched = matchedMetrics(runA, runB)
  const metricsA = matched?.metricsA ?? null
  const metricsB = matched?.metricsB ?? null
  const metricsUnavailable = !matched
  const pairs = pairedArtifacts(runA, runB)

  function renderFinalRenderButton(run: RunDetail) {
    const isKeeper = keeperRunId === run.id
    return (
      <button
        type="button"
        className={`button-secondary compare-keeper-action ${isKeeper ? 'compare-keeper-active' : ''}`}
        disabled={settingKeeper}
        onClick={() => void onSetKeeper(run.id)}
        title={isKeeper ? 'Already marked as final' : 'Mark as final render'}
      >
        {isKeeper ? 'Final Render' : 'Mark Final'}
      </button>
    )
  }

  return (
    <section className="compare-view">
      <header className="compare-view-head">
        <h3>Compare</h3>
        <p className="compare-view-hint">
          Render metrics are shown only when both renders have a rendered mixdown.
        </p>
      </header>

      <div className="compare-pick">
        <div className="compare-pick-cell">
          <span>{runA.processing.profile_label}</span>
          {renderFinalRenderButton(runA)}
        </div>
        <div className="compare-pick-cell">
          <span>{runB.processing.profile_label}</span>
          {renderFinalRenderButton(runB)}
        </div>
      </div>

      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">Selected render</th>
            <th scope="col">Compared render</th>
          </tr>
        </thead>
        <tbody>
          <CompareRow
            label="Model"
            valueA={runA.processing.profile_label}
            valueB={runB.processing.profile_label}
            compareAsValue
          />
          <CompareRow
            label="Model file"
            valueA={runA.processing.model_filename}
            valueB={runB.processing.model_filename}
            compareAsValue
          />
          <tr className="compare-section-divider">
            <td colSpan={3} />
          </tr>
          <CompareRow
            label="Loudness"
            valueA={metricsUnavailable ? '—' : formatLufs(metricsA?.integrated_lufs) ?? '—'}
            valueB={metricsUnavailable ? '—' : formatLufs(metricsB?.integrated_lufs) ?? '—'}
            delta={metricsUnavailable ? null : formatDelta(metricsA?.integrated_lufs, metricsB?.integrated_lufs, 'LU')}
          />
          <CompareRow
            label="True peak"
            valueA={metricsUnavailable ? '—' : formatTruePeak(metricsA?.true_peak_dbfs) ?? '—'}
            valueB={metricsUnavailable ? '—' : formatTruePeak(metricsB?.true_peak_dbfs) ?? '—'}
            delta={metricsUnavailable ? null : formatDelta(metricsA?.true_peak_dbfs, metricsB?.true_peak_dbfs, 'dB')}
          />
          <CompareRow
            label="Duration"
            valueA={metricsUnavailable ? '—' : formatDuration(metricsA?.duration_seconds) ?? '—'}
            valueB={metricsUnavailable ? '—' : formatDuration(metricsB?.duration_seconds) ?? '—'}
          />
          <CompareRow
            label="Sample rate"
            valueA={metricsUnavailable ? '—' : formatSampleRate(metricsA?.sample_rate) ?? '—'}
            valueB={metricsUnavailable ? '—' : formatSampleRate(metricsB?.sample_rate) ?? '—'}
          />
          <CompareRow
            label="Channels"
            valueA={metricsUnavailable ? '—' : formatChannels(metricsA?.channels) ?? '—'}
            valueB={metricsUnavailable ? '—' : formatChannels(metricsB?.channels) ?? '—'}
          />
          <CompareRow
            label="Size"
            valueA={metricsUnavailable ? '—' : formatSize(metricsA?.size_bytes) ?? '—'}
            valueB={metricsUnavailable ? '—' : formatSize(metricsB?.size_bytes) ?? '—'}
          />
        </tbody>
      </table>

      {pairs.length ? (
        <div className="compare-overlays">
          {pairs.map(({ kind, a, b }) => (
            <WaveformOverlay
              key={kind}
              title={a.label}
              runALabel={runA.processing.profile_label}
              runBLabel={runB.processing.profile_label}
              urlA={a.download_url}
              urlB={b.download_url}
              peaksA={a.metrics?.peaks}
              peaksB={b.metrics?.peaks}
              durationA={a.metrics?.duration_seconds}
              durationB={b.metrics?.duration_seconds}
            />
          ))}
        </div>
      ) : (
        <p className="empty-state">No matching artifacts to overlay.</p>
      )}
    </section>
  )
}
