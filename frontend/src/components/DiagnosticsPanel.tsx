import type { Diagnostics } from '../types'
import { Skeleton } from './feedback/Skeleton'
import { Spinner } from './feedback/Spinner'

type DiagnosticsPanelProps = {
  diagnostics: Diagnostics | null
  backfillingMetrics: boolean
  onBackfillMetrics: () => Promise<void>
}

const REMEDIATION: { pattern: RegExp; hint: string }[] = [
  { pattern: /yt-dlp/i, hint: 'Install with `brew install yt-dlp` and restart the worker.' },
  { pattern: /ffmpeg|ffprobe/i, hint: 'Install with `brew install ffmpeg`.' },
  { pattern: /audio-separator/i, hint: 'Install with `pip install -e ".[processing]"` inside the venv.' },
  { pattern: /disk/i, hint: 'Free up space in the output or model cache directories.' },
]

function remediationFor(issue: string): string | null {
  const match = REMEDIATION.find((entry) => entry.pattern.test(issue))
  return match?.hint ?? null
}

export function DiagnosticsPanel({
  diagnostics,
  backfillingMetrics,
  onBackfillMetrics,
}: DiagnosticsPanelProps) {
  if (!diagnostics) {
    return (
      <section className="section">
        <div className="section-head">
          <h2>System readiness</h2>
        </div>
        <div className="skeleton-stack">
          <Skeleton height={24} />
          <Skeleton height={24} />
          <Skeleton height={24} />
        </div>
      </section>
    )
  }

  const blockingIssue = diagnostics.issues[0] ?? null
  const readinessSummary = diagnostics.issues.length
    ? 'Resolve the blocking issue first. The rest of the technical details can wait.'
    : 'System checks look good. Processing should be ready to run.'

  return (
    <section className="section">
      <div className="section-head">
        <h2>System readiness</h2>
      </div>

      <div className="diagnostics-callout">
        <strong>{diagnostics.issues.length ? 'Processing is blocked' : 'Processing is ready'}</strong>
        <p>{readinessSummary}</p>
        {blockingIssue ? <span>{blockingIssue}</span> : null}
      </div>

      {diagnostics.issues.length ? (
        <div className="diagnostics-issues" role="alert">
          <strong>
            {diagnostics.issues.length} issue{diagnostics.issues.length === 1 ? '' : 's'} blocking
            processing
          </strong>
          <ul>
            {diagnostics.issues.map((issue) => {
              const remediation = remediationFor(issue)
              return (
                <li key={issue}>
                  {issue}
                  {remediation ? <span className="diagnostics-hint"> — {remediation}</span> : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className="metric-line diagnostics-summary">
        <div>
          <span>Acceleration</span>
          <strong>{diagnostics.acceleration}</strong>
        </div>
        <div>
          <span>Free disk now</span>
          <strong>{diagnostics.free_disk_gb} GB</strong>
        </div>
        <div>
          <span>URL import</span>
          <strong>{diagnostics.url_import_ready ? 'Ready' : 'Needs yt-dlp'}</strong>
        </div>
      </div>

      <details className="advanced-actions">
        <summary>Tool paths</summary>
        <div className="row-list">
          {diagnostics.binaries.map((binary) => {
            const tone = binary.available
              ? 'status-ok'
              : binary.required
                ? 'status-err'
                : 'status-warn'
            const label = binary.available
              ? 'found'
              : binary.required
                ? 'missing — required'
                : 'missing — optional'
            return (
              <article key={binary.name} className="row-line">
                <div>
                  <strong>{binary.name}</strong>
                  <p>{binary.path ?? 'not on PATH'}</p>
                </div>
                <span className={`status-word ${tone}`}>{label}</span>
              </article>
            )
          })}
        </div>
      </details>
      <details className="advanced-actions">
        <summary>Library repair</summary>
        <button
          type="button"
          className="button-secondary"
          disabled={backfillingMetrics}
          onClick={() => void onBackfillMetrics()}
        >
          {backfillingMetrics ? <><Spinner /> Backfilling…</> : 'Backfill quality metrics'}
        </button>
      </details>
    </section>
  )
}
