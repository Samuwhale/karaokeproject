import type { RunDetail, RunArtifact, ArtifactMetrics } from '../types'
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

const OVERLAY_KIND_ORDER = ['instrumental', 'export-audio-mp3', 'vocals', 'source'] as const

function findArtifact(run: RunDetail, kind: string): RunArtifact | null {
  return run.artifacts.find((artifact) => artifact.kind === kind) ?? null
}

function pairedArtifacts(runA: RunDetail, runB: RunDetail) {
  return OVERLAY_KIND_ORDER.flatMap((kind) => {
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
  for (const kind of OVERLAY_KIND_ORDER) {
    const a = findArtifact(runA, kind)
    const b = findArtifact(runB, kind)
    if (a?.metrics && b?.metrics) {
      return { kind, metricsA: a.metrics, metricsB: b.metrics }
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
  const pairs = pairedArtifacts(runA, runB)

  function renderKeeperButton(run: RunDetail) {
    const isKeeper = keeperRunId === run.id
    return (
      <button
        type="button"
        className={`button-secondary compare-keeper-action ${isKeeper ? 'compare-keeper-active' : ''}`}
        disabled={settingKeeper}
        onClick={() => void onSetKeeper(run.id)}
        title={isKeeper ? 'Already marked as final' : 'Mark this run as final'}
      >
        {isKeeper ? '★ Final' : 'Set as final'}
      </button>
    )
  }

  return (
    <section className="compare-view">
      <header className="compare-view-head">
        <h3>Compare</h3>
      </header>

      <div className="compare-pick">
        <div className="compare-pick-cell">
          <span>{runA.processing.profile_label}</span>
          {renderKeeperButton(runA)}
        </div>
        <div className="compare-pick-cell">
          <span>{runB.processing.profile_label}</span>
          {renderKeeperButton(runB)}
        </div>
      </div>

      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">This run</th>
            <th scope="col">Compared run</th>
          </tr>
        </thead>
        <tbody>
          <CompareRow
            label="Profile"
            valueA={runA.processing.profile_label}
            valueB={runB.processing.profile_label}
            compareAsValue
          />
          <CompareRow
            label="Model"
            valueA={runA.processing.model_filename}
            valueB={runB.processing.model_filename}
            compareAsValue
          />
          <CompareRow
            label="MP3 bitrate"
            valueA={runA.processing.export_mp3_bitrate}
            valueB={runB.processing.export_mp3_bitrate}
            compareAsValue
          />
          <tr className="compare-section-divider">
            <td colSpan={3} />
          </tr>
          <CompareRow
            label="Loudness"
            valueA={formatLufs(metricsA?.integrated_lufs) ?? '—'}
            valueB={formatLufs(metricsB?.integrated_lufs) ?? '—'}
            delta={formatDelta(metricsA?.integrated_lufs, metricsB?.integrated_lufs, 'LU')}
          />
          <CompareRow
            label="True peak"
            valueA={formatTruePeak(metricsA?.true_peak_dbfs) ?? '—'}
            valueB={formatTruePeak(metricsB?.true_peak_dbfs) ?? '—'}
            delta={formatDelta(metricsA?.true_peak_dbfs, metricsB?.true_peak_dbfs, 'dB')}
          />
          <CompareRow
            label="Duration"
            valueA={formatDuration(metricsA?.duration_seconds) ?? '—'}
            valueB={formatDuration(metricsB?.duration_seconds) ?? '—'}
          />
          <CompareRow
            label="Sample rate"
            valueA={formatSampleRate(metricsA?.sample_rate) ?? '—'}
            valueB={formatSampleRate(metricsB?.sample_rate) ?? '—'}
          />
          <CompareRow
            label="Channels"
            valueA={formatChannels(metricsA?.channels) ?? '—'}
            valueB={formatChannels(metricsB?.channels) ?? '—'}
          />
          <CompareRow
            label="Size"
            valueA={formatSize(metricsA?.size_bytes) ?? '—'}
            valueB={formatSize(metricsB?.size_bytes) ?? '—'}
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
