import { useEffect, useMemo, useRef, useState } from 'react'

import type { RunArtifact, RunDetail, RunMixStemEntry } from '../../types'
import { MIX_GAIN_DB_MAX, MIX_GAIN_DB_MIN } from '../../types'
import { compareStemKinds, isStemKind } from '../../stems'
import { Spinner } from '../feedback/Spinner'
import { MixScrubber } from './MixScrubber'
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

function isDefaultMix(stems: StemRow[]) {
  return stems.every((stem) => Math.abs(stem.gain_db) < 0.01 && !stem.muted)
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
  if (Math.abs(db) < 0.05) return '0 dB'
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

function stripTone(label: string) {
  switch (label.toLowerCase()) {
    case 'vocals':
      return 'Lead'
    case 'drums':
      return 'Rhythm'
    case 'bass':
      return 'Low end'
    case 'other':
      return 'Texture'
    default:
      return 'Stem'
  }
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
  const showsDefault = isDefaultMix(stems)

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

  function handleReset() {
    const next = stems.map((stem) => ({ ...stem, gain_db: 0, muted: false, soloed: false }))
    setStems(next)
    scheduleSave(next)
  }

  function handleTogglePlay() {
    if (mixer.isPlaying) mixer.pause()
    else mixer.play()
  }

  const playDisabled = mixer.loadState !== 'ready'
  const anySoloed = stems.some((stem) => stem.soloed)
  const statusLabel =
    saving || saveState === 'saving'
      ? 'Saving changes…'
      : saveState === 'failed'
        ? 'Save failed'
        : saveState === 'pending' || dirty
          ? 'Changes pending'
          : showsDefault
            ? 'Default balance'
            : 'Custom balance saved'

  return (
    <section className="kp-mix-panel">
      <section className="kp-mix-transport">
        <div className="kp-mix-transport-main">
          <div className="kp-mix-transport-controls">
            <button
              type="button"
              className="button-primary kp-mix-play"
              onClick={handleTogglePlay}
              disabled={playDisabled}
              aria-label={mixer.isPlaying ? 'Pause preview' : 'Play preview'}
            >
              {mixer.loadState === 'loading' ? (
                <>
                  <Spinner /> Loading
                </>
              ) : mixer.isPlaying ? (
                'Pause'
              ) : (
                'Play'
              )}
            </button>
          </div>

          <div className="kp-mix-clock">
            <strong>{formatTime(mixer.currentTime)}</strong>
            <span>{formatTime(mixer.duration)}</span>
          </div>

          <div className="kp-mix-transport-side">
            <span className="kp-mix-status" aria-live="polite">
              {saving || saveState === 'saving' ? (
                <>
                  <Spinner /> {statusLabel}
                </>
              ) : (
                statusLabel
              )}
            </span>
            <button
              type="button"
              className="button-secondary"
              onClick={handleReset}
              disabled={showsDefault && stems.every((stem) => !stem.soloed)}
            >
              Reset balance
            </button>
            {saveState === 'failed' && retryPayload ? (
              <button type="button" className="button-secondary" onClick={() => void persistMix(retryPayload)}>
                Retry save
              </button>
            ) : null}
          </div>
        </div>

        <MixScrubber
          peaks={overviewPeaks}
          currentTime={mixer.currentTime}
          duration={mixer.duration}
          onSeek={mixer.seek}
          disabled={playDisabled || mixer.duration === 0}
        />
      </section>

      {saveError ? <p className="kp-inline-error">{saveError}</p> : null}
      {mixer.error ? <p className="kp-inline-error">{mixer.error}</p> : null}

      <div className="kp-strip-bank" role="group" aria-label="Stem mixer">
        {stems.map((stem, index) => {
          const silenced = stem.muted || (anySoloed && !stem.soloed)

          return (
            <section
              key={stem.artifact_id}
              className={`kp-strip ${silenced ? 'kp-strip-muted' : ''}`}
            >
              <header className="kp-strip-head">
                <strong>{stem.label}</strong>
                <span>{stripTone(stem.label)}</span>
              </header>

              <div className="kp-strip-body">
                <span>{MIX_GAIN_DB_MAX} dB</span>
                <label className="kp-strip-fader">
                  <input
                    type="range"
                    min={MIX_GAIN_DB_MIN}
                    max={MIX_GAIN_DB_MAX}
                    step={0.5}
                    value={stem.gain_db}
                    onChange={(event) => updateStem(index, { gain_db: Number(event.target.value) })}
                    onDoubleClick={() => updateStem(index, { gain_db: 0 })}
                    className="kp-strip-slider"
                    aria-label={`${stem.label} gain`}
                  />
                </label>
                <span>{MIX_GAIN_DB_MIN} dB</span>
              </div>

              <footer className="kp-strip-footer">
                <strong>{formatGain(stem.gain_db)}</strong>
                <div className="kp-strip-actions">
                  <button
                    type="button"
                    className={stem.muted ? 'kp-strip-toggle kp-strip-toggle-active' : 'kp-strip-toggle'}
                    onClick={() => updateStem(index, { muted: !stem.muted })}
                    aria-pressed={stem.muted}
                  >
                    Mute
                  </button>
                  <button
                    type="button"
                    className={stem.soloed ? 'kp-strip-toggle kp-strip-toggle-active' : 'kp-strip-toggle'}
                    onClick={() => updateStem(index, { soloed: !stem.soloed })}
                    aria-pressed={stem.soloed}
                  >
                    Solo
                  </button>
                </div>
              </footer>
            </section>
          )
        })}
      </div>
    </section>
  )
}
