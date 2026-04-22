type ProgressBarProps = {
  value?: number
  label?: string
  indeterminate?: boolean
  showPercent?: boolean
}

export function ProgressBar({ value, label, indeterminate, showPercent = true }: ProgressBarProps) {
  const clamped = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : 0
  const percent = Math.round(clamped * 100)

  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : percent}
      aria-label={label}
    >
      <div className="progress-bar-track">
        <div
          className={`progress-bar-fill ${indeterminate ? 'progress-bar-indeterminate' : ''}`}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
      {label ? (
        <div className="progress-bar-label">
          <span>{label}</span>
          {indeterminate || !showPercent ? null : <span>{percent}%</span>}
        </div>
      ) : null}
    </div>
  )
}
