import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { discardRejection } from '../../async'
import type { RunArtifact, RunDetail, RunMixStemEntry } from '../../types'
import { MIX_GAIN_DB_MAX, MIX_GAIN_DB_MIN } from '../../types'
import { compareStemKinds, isStemKind, stemColorFromKind } from '../../stems'
import { Spinner } from '../feedback/Spinner'
import { StemWaveform } from './StemWaveform'
import { useStemMixer } from './useStemMixer'

type MixPanelProps = {
  run: RunDetail
  onSave: (stems: RunMixStemEntry[]) => Promise<void>
  saving: boolean
}

type StemRow = {
  artifact_id: string
  label: string
  url: string
  peaks: number[]
  color: string
  gain_db: number
  muted: boolean
  soloed: boolean
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed'

const SAVE_DEBOUNCE_MS = 400
const FADER_STEP = 0.5
const FADER_STEP_FINE = 0.1
const FADER_STEP_COARSE = 3

function mixableArtifacts(run: RunDetail): RunArtifact[] {
  return run.artifacts
    .filter((artifact) => isStemKind(artifact.kind))
    .sort((a, b) => {
      const kindOrder = compareStemKinds(a.kind, b.kind)
      if (kindOrder !== 0) return kindOrder
      return a.label.localeCompare(b.label)
    })
}

function initialStems(run: RunDetail): StemRow[] {
  const mixByArtifact = new Map(run.mix.stems.map((entry) => [entry.artifact_id, entry]))
  return mixableArtifacts(run).map((artifact) => {
    const entry = mixByArtifact.get(artifact.id)
    return {
      artifact_id: artifact.id,
      label: artifact.label,
      url: artifact.download_url,
      peaks: artifact.metrics?.peaks ?? [],
      color: stemColorFromKind(artifact.kind),
      gain_db: entry?.gain_db ?? 0,
      muted: entry?.muted ?? false,
      soloed: false,
    }
  })
}

function equalsPersisted(stems: StemRow[], mixStems: RunMixStemEntry[]) {
  const byId = new Map(mixStems.map((entry) => [entry.artifact_id, entry]))
  for (const stem of stems) {
    const persisted = byId.get(stem.artifact_id)
    const persistedGain = persisted?.gain_db ?? 0
    const persistedMuted = persisted?.muted ?? false
    if (Math.abs(stem.gain_db - persistedGain) > 0.01) return false
    if (stem.muted !== persistedMuted) return false
  }
  return true
}

function clampGain(db: number) {
  return Math.max(MIX_GAIN_DB_MIN, Math.min(MIX_GAIN_DB_MAX, db))
}

function formatGain(db: number) {
  if (Math.abs(db) < 0.05) return '0.0 dB'
  const sign = db > 0 ? '+' : ''
  return `${sign}${db.toFixed(1)} dB`
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remaining = (total % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <path d="M4 2.5v13l12-6.5z" />
    </svg>
  )
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect x="4" y="3" width="4" height="12" rx="1" />
      <rect x="10" y="3" width="4" height="12" rx="1" />
    </svg>
  )
}

function faderFillStyle(gainDb: number): React.CSSProperties {
  const center = 50
  const denominator = gainDb >= 0 ? MIX_GAIN_DB_MAX : Math.abs(MIX_GAIN_DB_MIN)
  const fraction = (gainDb / denominator) * 50
  if (gainDb >= 0) {
    return { left: `${center}%`, width: `${Math.max(0, fraction)}%` }
  }
  const width = Math.max(0, Math.abs(fraction))
  return { left: `${center - width}%`, width: `${width}%` }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function MixPanel({ run, onSave, saving }: MixPanelProps) {
  const [stems, setStems] = useState<StemRow[]>(() => initialStems(run))
  const saveTimerRef = useRef<number | null>(null)
  const pendingSavePayloadRef = useRef<RunMixStemEntry[] | null>(null)
  const latestSaveIdRef = useRef(0)
  const tearingDownRef = useRef(false)
  const [retryPayload, setRetryPayload] = useState<RunMixStemEntry[] | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      tearingDownRef.current = true
      const pendingTimer = saveTimerRef.current
      if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer)
        saveTimerRef.current = null
      }
      const pendingPayload = pendingSavePayloadRef.current
      if (pendingTimer !== null && pendingPayload) {
        discardRejection(() => onSave(pendingPayload))
      }
    }
  }, [onSave])

  // Auto-clear "Saved" indicator after a short delay
  useEffect(() => {
    if (saveState !== 'saved') return
    const id = window.setTimeout(() => setSaveState('idle'), 1800)
    return () => window.clearTimeout(id)
  }, [saveState])

  const dirty = !equalsPersisted(stems, run.mix.stems)

  const mixerStems = useMemo(
    () =>
      stems.map((stem) => ({
        artifact_id: stem.artifact_id,
        url: stem.url,
        gain_db: stem.gain_db,
        muted: stem.muted,
        soloed: stem.soloed,
      })),
    [stems],
  )
  const mixer = useStemMixer(mixerStems)

  const playLoading = mixer.loadState === 'loading'
  const playDisabled = mixer.loadState !== 'ready'

  const persistMix = useCallback(
    async (payload: RunMixStemEntry[]) => {
      const saveId = ++latestSaveIdRef.current
      pendingSavePayloadRef.current = payload
      setRetryPayload(payload)
      setSaveState('saving')
      setSaveError(null)

      try {
        await onSave(payload)
        if (tearingDownRef.current || latestSaveIdRef.current !== saveId) return
        pendingSavePayloadRef.current = null
        setRetryPayload(null)
        setSaveState('saved')
      } catch (error) {
        if (tearingDownRef.current || latestSaveIdRef.current !== saveId) return
        setRetryPayload(payload)
        setSaveState('failed')
        setSaveError(error instanceof Error ? error.message : 'Could not save mix changes.')
      }
    },
    [onSave],
  )

  function scheduleSave(next: StemRow[]) {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    const payload: RunMixStemEntry[] = next.map((stem) => ({
      artifact_id: stem.artifact_id,
      gain_db: Math.round(stem.gain_db * 10) / 10,
      muted: stem.muted,
    }))
    pendingSavePayloadRef.current = payload
    setRetryPayload(payload)
    setSaveState('pending')
    setSaveError(null)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      discardRejection(() => persistMix(payload))
    }, SAVE_DEBOUNCE_MS)
  }

  function updateStem(index: number, patch: Partial<StemRow>) {
    setStems((current) => {
      const next = current.map((stem, i) => (i === index ? { ...stem, ...patch } : stem))
      const persistedChanged = patch.gain_db !== undefined || patch.muted !== undefined
      if (persistedChanged) scheduleSave(next)
      return next
    })
  }

  const handleTogglePlay = useCallback(() => {
    if (mixer.isPlaying) mixer.pause()
    else mixer.play()
  }, [mixer])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (isTypingTarget(event.target)) return
      if (playDisabled) return
      event.preventDefault()
      handleTogglePlay()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleTogglePlay, playDisabled])

  function handleFaderKey(index: number, current: number, event: ReactKeyboardEvent<HTMLInputElement>) {
    const step =
      event.shiftKey ? FADER_STEP_FINE : event.altKey ? FADER_STEP_COARSE : FADER_STEP
    const key = event.key
    if (key === 'ArrowUp' || key === 'ArrowRight') {
      event.preventDefault()
      updateStem(index, { gain_db: clampGain(current + step) })
    } else if (key === 'ArrowDown' || key === 'ArrowLeft') {
      event.preventDefault()
      updateStem(index, { gain_db: clampGain(current - step) })
    }
  }

  const anySoloed = stems.some((stem) => stem.soloed)

  const footerVisible =
    saving || saveState === 'saving' || saveState === 'pending' || saveState === 'saved' || saveState === 'failed' || dirty
  const showErrors = !!saveError || !!mixer.error

  const saveIndicatorLabel =
    saveState === 'failed' ? 'Save failed' : saveState === 'saved' ? 'Saved' : 'Saving…'
  const saveIndicatorClass =
    saveState === 'failed' ? 'is-error' : saveState === 'saved' ? 'is-saved' : 'is-saving'

  return (
    <>
      <div className="mix-rows" role="group" aria-label="Stem mixer">
        {stems.map((stem, index) => {
          const silenced = stem.muted || (anySoloed && !stem.soloed)
          const fillStyle = faderFillStyle(stem.gain_db)

          return (
            <div
              key={stem.artifact_id}
              className={`stem-row ${stem.muted ? 'is-muted' : ''} ${silenced ? 'is-silenced' : ''}`}
              style={{ '--stem-color': stem.color } as React.CSSProperties}
            >
              <div className="stem-row-head">
                <span className="stem-row-dot" aria-hidden />
                <div className="stem-row-label">
                  <strong>{stem.label}</strong>
                  <span>{formatGain(stem.gain_db)}</span>
                </div>
                <div className="stem-row-toggles">
                  <button
                    type="button"
                    className={`stem-toggle stem-toggle-mute ${stem.muted ? 'is-active' : ''}`}
                    onClick={() => updateStem(index, { muted: !stem.muted })}
                    aria-pressed={stem.muted}
                    title={stem.muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    className={`stem-toggle stem-toggle-solo ${stem.soloed ? 'is-active' : ''}`}
                    onClick={() => updateStem(index, { soloed: !stem.soloed })}
                    aria-pressed={stem.soloed}
                    title={stem.soloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
                  >
                    S
                  </button>
                </div>
              </div>
              <div className="stem-row-wave">
                <StemWaveform
                  peaks={stem.peaks}
                  currentTime={mixer.currentTime}
                  duration={mixer.duration}
                  color={stem.color}
                  onSeek={playDisabled ? undefined : mixer.seek}
                  disabled={playDisabled}
                  ariaLabel={`${stem.label} timeline`}
                />
              </div>
              <label className="stem-fader" aria-label={`${stem.label} gain`}>
                <span className="stem-fader-center" aria-hidden />
                <span className="stem-fader-fill" style={fillStyle} aria-hidden />
                <input
                  type="range"
                  min={MIX_GAIN_DB_MIN}
                  max={MIX_GAIN_DB_MAX}
                  step={FADER_STEP_FINE}
                  value={stem.gain_db}
                  onChange={(event) => updateStem(index, { gain_db: Number(event.target.value) })}
                  onKeyDown={(event) => handleFaderKey(index, stem.gain_db, event)}
                  onDoubleClick={() => updateStem(index, { gain_db: 0 })}
                  aria-label={`${stem.label} gain`}
                  title="Double-click to reset to 0 dB"
                />
              </label>
            </div>
          )
        })}
      </div>

      <div className="mix-transport">
        <button
          type="button"
          className={`mix-play ${playLoading ? 'is-loading' : ''}`}
          onClick={handleTogglePlay}
          disabled={playDisabled}
          aria-label={playLoading ? 'Loading audio…' : mixer.isPlaying ? 'Pause preview' : 'Play preview'}
          title={playLoading ? undefined : mixer.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {playLoading ? <Spinner /> : mixer.isPlaying ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <input
          type="range"
          className="mix-seekbar"
          min={0}
          max={mixer.duration || 1}
          step={0.01}
          value={mixer.currentTime}
          onChange={(event) => mixer.seek(Number(event.target.value))}
          disabled={playDisabled}
          aria-label="Seek"
          style={{ '--seek-pct': `${mixer.duration > 0 ? ((mixer.currentTime / mixer.duration) * 100).toFixed(1) : 0}%` } as React.CSSProperties}
        />
        <span className="mix-time">{formatTime(mixer.currentTime)}</span>
        <span className="mix-time-sep" aria-hidden>·</span>
        <span className="mix-time mix-time-total">{formatTime(mixer.duration)}</span>
      </div>

      {footerVisible || showErrors ? (
        <div className="mix-footer">
          {footerVisible ? (
            <span className={`mix-save-state ${saveIndicatorClass}`} aria-live="polite">
              <span>{saveIndicatorLabel}</span>
              {saveState === 'failed' && retryPayload ? (
                <button
                  type="button"
                  className="button-link"
                  onClick={() => discardRejection(() => persistMix(retryPayload))}
                >
                  Retry
                </button>
              ) : null}
            </span>
          ) : null}
          {showErrors ? (
            <div className="mix-errors" role="status" aria-live="polite">
              {saveError ? <p>{saveError}</p> : null}
              {mixer.error ? <p>{mixer.error}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
