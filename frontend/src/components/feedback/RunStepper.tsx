import { RUN_STAGE_DESCRIPTIONS } from '../runStatus'

const STAGES: { key: string; label: string }[] = [
  { key: 'queued', label: 'Queued' },
  { key: 'preparing', label: 'Prepare' },
  { key: 'separating', label: 'Separate' },
  { key: 'exporting', label: 'Export' },
  { key: 'completed', label: 'Done' },
]

const STAGE_INDEX = new Map(STAGES.map((stage, index) => [stage.key, index]))

type RunStepperProps = {
  status: string
}

export function RunStepper({ status }: RunStepperProps) {
  const isFailed = status === 'failed' || status === 'cancelled'
  const activeIndex = STAGE_INDEX.get(status) ?? (isFailed ? -1 : 0)
  const activeDescription = isFailed
    ? null
    : status === 'completed'
      ? null
      : RUN_STAGE_DESCRIPTIONS[status] ?? null

  return (
    <div className="stepper-wrap">
      <ol className="stepper" aria-label="Run pipeline">
        {STAGES.map((stage, index) => {
          let state: 'done' | 'active' | 'pending' | 'failed' = 'pending'
          if (isFailed) {
            state = index === 0 ? 'failed' : 'pending'
          } else if (index < activeIndex) {
            state = 'done'
          } else if (index === activeIndex) {
            state = status === 'completed' ? 'done' : 'active'
          }

          const label =
            isFailed && index === 0
              ? status === 'cancelled'
                ? 'Cancelled'
                : 'Failed'
              : stage.label

          return (
            <li key={stage.key} className={`stepper-step stepper-step-${state}`}>
              <span className="stepper-dot" aria-hidden>
                {state === 'done' ? '✓' : state === 'failed' ? '×' : ''}
              </span>
              <span className="stepper-label">{label}</span>
            </li>
          )
        })}
      </ol>
      {activeDescription ? (
        <p className="stepper-description">{activeDescription}</p>
      ) : null}
    </div>
  )
}
