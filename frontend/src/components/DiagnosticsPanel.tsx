import type { Diagnostics } from '../types'

type DiagnosticsPanelProps = {
  diagnostics: Diagnostics | null
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  if (!diagnostics) {
    return <section className="section skeleton">Loading diagnostics…</section>
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Diagnostics</h2>
        <span className={`badge ${diagnostics.app_ready ? 'badge-ready' : 'badge-warn'}`}>
          {diagnostics.app_ready ? 'ready' : 'setup needed'}
        </span>
      </div>

      <div className="metric-line" style={{ marginBottom: 'var(--space-md)' }}>
        <div>
          <span>Acceleration</span>
          <strong>{diagnostics.acceleration.toUpperCase()}</strong>
        </div>
        <div>
          <span>Free disk</span>
          <strong>{diagnostics.free_disk_gb} GB</strong>
        </div>
        <div>
          <span>URL import</span>
          <strong>{diagnostics.url_import_ready ? 'Ready' : 'Needs yt-dlp'}</strong>
        </div>
      </div>

      <div className="row-list">
        {diagnostics.binaries.map((binary) => (
          <article key={binary.name} className="row-line">
            <div>
              <strong>{binary.name}</strong>
              <p>{binary.path ?? 'Not found on PATH'}</p>
            </div>
            <span className={`badge ${binary.available ? 'badge-ready' : 'badge-warn'}`}>
              {binary.available ? 'ok' : binary.required ? 'required' : 'optional'}
            </span>
          </article>
        ))}
      </div>

      <div className="directory-list">
        {Object.entries(diagnostics.data_directories).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <code>{value}</code>
          </div>
        ))}
      </div>

      {diagnostics.issues.length ? (
        <ul className="issue-list" style={{ marginTop: 'var(--space-sm)' }}>
          {diagnostics.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
