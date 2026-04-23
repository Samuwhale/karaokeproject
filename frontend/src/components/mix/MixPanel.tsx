import { useEffect, useMemo, useRef, useState } from 'react'

import type { RunArtifact, RunDetail, RunMixStemEntry } from '../../types'
import { MIX_GAIN_DB_MAX, MIX_GAIN_DB_MIN } from '../../types'
import { compareStemKinds, isStemKind } from '../../stems'
import { MixScrubber } from './MixScrubber'
import { useStemMixer } from './useStemMixer'
import { stemIcon, stemTone } from './stemIcons'

type MixPanelProps = {
  run: RunDetail
  onSave: (stems: RunMixStemEntry[]) => Promise<void>
  saving: boolean
}

type StemRow = {
  artifact_id: string
  label: string
  url: string
  gain_db: number
  muted: boolean
  soloed: boolean
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed'

const SAVE_DEBOUNCE_MS = 400

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
        void onSave(pendingPayload)
      }
    }
  }, [onSave])

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
  const overviewPeaks = useMemo(
    () =>
      mixableArtifacts(run).find((artifact) => (artifact.metrics?.peaks?.length ?? 0) > 0)?.metrics?.peaks ?? [],
    [run],
  )

  async function persistMix(payload: RunMixStemEntry[]) {
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
  }

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
      void persistMix(payload)
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

  function handleTogglePlay() {
    if (mixer.isPlaying) mixer.pause()
    else mixer.play()
  }

  const playDisabled = mixer.loadState !== 'ready'
  const anySoloed = stems.some((stem) => stem.soloed)
  const saveLabel =
    saving || saveState === 'saving'
      ? 'Saving…'
      : saveState === 'failed'
        ? 'Save failed'
        : saveState === 'pending' || dirty
          ? 'Saving…'
          : 'saved ✓'
  const saveClass =
    saveState === 'failed'
      ? 'is-error'
      : saving || saveState === 'saving' || saveState === 'pending' || dirty
        ? 'is-saving'
        : ''

  return (
    <>
      <div className="mix-canvas">
        <div className="mix-channels" role="group" aria-label="Stem mixer">
          {stems.map((stem, index) => {
            const silenced = stem.muted || (anySoloed && !stem.soloed)
            const fillStyle = faderFillStyle(stem.gain_db)

            return (
              <div
                key={stem.artifact_id}
                className={`channel ${stem.muted ? 'is-muted' : ''} ${silenced ? 'is-silenced' : ''}`}
              >
                <button
                  type="button"
                  className="channel-icon"
                  onClick={() => updateStem(index, { muted: !stem.muted })}
                  aria-pressed={stem.muted}
                  aria-label={`${stem.muted ? 'Unmute' : 'Mute'} ${stem.label}`}
                  title={stem.muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
                >
                  {stemIcon(stem.label)}
                </button>
                <div className="channel-name">
                  <strong>{stem.label}</strong>
                  <span>{stemTone(stem.label)}</span>
                </div>
                <label className="channel-fader">
                  <span className="channel-fader-center" aria-hidden />
                  <span className="channel-fader-fill" style={fillStyle} aria-hidden />
                  <input
                    type="range"
                    min={MIX_GAIN_DB_MIN}
                    max={MIX_GAIN_DB_MAX}
                    step={0.5}
                    value={stem.gain_db}
                    onChange={(event) => updateStem(index, { gain_db: Number(event.target.value) })}
                    onDoubleClick={() => updateStem(index, { gain_db: 0 })}
                    aria-label={`${stem.label} gain`}
                  />
                </label>
                <span className="channel-gain">{formatGain(stem.gain_db)}</span>
                <button
                  type="button"
                  className={`channel-solo ${stem.soloed ? 'is-active' : ''}`}
                  onClick={() => updateStem(index, { soloed: !stem.soloed })}
                  aria-pressed={stem.soloed}
                  title={stem.soloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
                >
                  S
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mix-transport">
        <button
          type="button"
          className="mix-play"
          onClick={handleTogglePlay}
          disabled={playDisabled}
          aria-label={mixer.isPlaying ? 'Pause preview' : 'Play preview'}
        >
          {mixer.isPlaying ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <span className="mix-time">{formatTime(mixer.currentTime)}</span>
        <div className="mix-scrubber-wrap">
          <MixScrubber
            peaks={overviewPeaks}
            currentTime={mixer.currentTime}
            duration={mixer.duration}
            onSeek={mixer.seek}
            disabled={playDisabled || mixer.duration === 0}
          />
        </div>
        <span className="mix-time">{formatTime(mixer.duration)}</span>
        <span className={`mix-save-state ${saveClass}`} aria-live="polite">
          {saveState === 'failed' && retryPayload ? (
            <>
              <span>{saveLabel}</span>
              <button
                type="button"
                className="button-link"
                onClick={() => void persistMix(retryPayload)}
              >
                Retry
              </button>
            </>
          ) : (
            saveLabel
          )}
        </span>
      </div>

      {saveError ? (
        <div className="mix-save-state is-error" style={{ padding: '0 32px 8px' }}>
          {saveError}
        </div>
      ) : null}
      {mixer.error ? (
        <div className="mix-save-state is-error" style={{ padding: '0 32px 8px' }}>
          {mixer.error}
        </div>
      ) : null}
    </>
  )
}
