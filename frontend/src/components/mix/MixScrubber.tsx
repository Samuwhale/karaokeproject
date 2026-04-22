import { useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'

type MixScrubberProps = {
  peaks: number[]
  currentTime: number
  duration: number
  onSeek: (seconds: number) => void
  disabled?: boolean
}

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 60
const MID = VIEW_HEIGHT / 2
const MAX_HALF_BAR = MID - 2
const KEYBOARD_STEP_SECONDS = 1

export function MixScrubber({
  peaks,
  currentTime,
  duration,
  onSeek,
  disabled = false,
}: MixScrubberProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState(false)

  const safeDuration = duration > 0 ? duration : 0
  const progress = safeDuration > 0 ? Math.max(0, Math.min(1, currentTime / safeDuration)) : 0
  const barCount = peaks.length
  const barWidth = barCount > 0 ? VIEW_WIDTH / barCount : VIEW_WIDTH

  function seekFromClientX(clientX: number) {
    const svg = svgRef.current
    if (!svg || safeDuration === 0) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onSeek(ratio * safeDuration)
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return
    event.preventDefault()
    setDragging(true)
    svgRef.current?.setPointerCapture(event.pointerId)
    seekFromClientX(event.clientX)
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragging) return
    seekFromClientX(event.clientX)
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragging) return
    setDragging(false)
    try {
      svgRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      // pointer id may already be released
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (disabled || safeDuration === 0) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onSeek(Math.min(safeDuration, currentTime + KEYBOARD_STEP_SECONDS))
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onSeek(Math.max(0, currentTime - KEYBOARD_STEP_SECONDS))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onSeek(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      onSeek(safeDuration)
    }
  }

  return (
    <svg
      ref={svgRef}
      className={`mix-scrubber ${disabled ? 'mix-scrubber-disabled' : ''}`}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role="slider"
      aria-label="Preview position"
      aria-valuemin={0}
      aria-valuemax={Math.max(1, Math.round(safeDuration))}
      aria-valuenow={Math.round(currentTime)}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      {barCount === 0 ? (
        <rect
          x={0}
          y={MID - 1}
          width={VIEW_WIDTH}
          height={2}
          className="mix-scrubber-baseline"
        />
      ) : (
        peaks.map((peak, index) => {
          const x = index * barWidth
          const half = Math.max(1, Math.min(MAX_HALF_BAR, peak * MAX_HALF_BAR))
          const bandEnd = (index + 1) / barCount
          const past = bandEnd <= progress
          return (
            <rect
              key={index}
              x={x}
              y={MID - half}
              width={Math.max(1, barWidth - 1)}
              height={half * 2}
              className={past ? 'mix-scrubber-bar mix-scrubber-bar-past' : 'mix-scrubber-bar'}
            />
          )
        })
      )}
      <line
        x1={progress * VIEW_WIDTH}
        x2={progress * VIEW_WIDTH}
        y1={0}
        y2={VIEW_HEIGHT}
        className="mix-scrubber-cursor"
      />
    </svg>
  )
}
