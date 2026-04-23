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
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function MixPanel({ run, onSave, saving }: MixPanelProps) {
  const [stems, setStems] = useState<StemRow[]>(() => initialStems(run))
  const saveTimerRef = useRef<number | null>(null)
  const latestSaveIdRef = useRef(0)
  const [retryPayload, setRetryPayload] = useState<RunMixStemEntry[] | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    }
  }, [])

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
    setRetryPayload(payload)
    setSaveState('saving')
    setSaveError(null)

    try {
      await onSave(payload)
      if (latestSaveIdRef.current !== saveId) return
      setRetryPayload(null)
      setSaveState('saved')
    } catch (error) {
      if (latestSaveIdRef.current !== saveId) return
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

  return (
    <section className="mix-panel">
      <header className="mix-panel-topbar">
        <div className="mix-panel-session">
          <div className="mix-panel-head-copy">
            <h3 className="subsection-head">Mixer</h3>
            <p className="mix-panel-copy">
              Leave most stems at unity. Mute what should disappear and use Listen only to audition one stem at a time.
            </p>
          </div>
          <div className="mix-panel-head-actions">
            <span className="mix-panel-status">
              {saving || saveState === 'saving' ? (
                <>
                  <Spinner /> Saving changes…
                </>
              ) : saveState === 'failed' ? (
                'Save failed'
              ) : saveState === 'pending' || dirty ? (
                'Changes pending'
              ) : showsDefault ? (
                'Default balance'
              ) : (
                'Custom balance saved'
              )}
            </span>
            {saveState === 'failed' && retryPayload ? (
              <button type="button" className="button-secondary" onClick={() => void persistMix(retryPayload)}>
                Retry save
              </button>
            ) : null}
          </div>
        </div>

        <div className="mix-transport">
          <div className="mix-transport-controls">
            <button
              type="button"
              className="button-primary mix-transport-play"
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
            <button
              type="button"
              className="button-secondary"
              onClick={handleReset}
              disabled={showsDefault && stems.every((stem) => !stem.soloed)}
            >
              Reset
            </button>
            <span className="mix-transport-time">
              {formatTime(mixer.currentTime)} / {formatTime(mixer.duration)}
            </span>
          </div>
          <MixScrubber
            peaks={overviewPeaks}
            currentTime={mixer.currentTime}
            duration={mixer.duration}
            onSeek={mixer.seek}
            disabled={playDisabled || mixer.duration === 0}
          />
        </div>
      </header>

      {saveError ? <p className="mix-error">{saveError}</p> : null}
      {mixer.error ? <p className="mix-error">{mixer.error}</p> : null}

      <div className="mix-strip-bank" role="group" aria-label="Stem mixer">
        {stems.map((stem, index) => {
          const silenced = stem.muted || (anySoloed && !stem.soloed)

          return (
            <section
              key={stem.artifact_id}
              className={`mix-strip ${silenced ? 'mix-strip-silenced' : ''}`}
            >
              <div className="mix-strip-head">
                <div className="mix-strip-label">
                  <strong>{stem.label}</strong>
                  <span>{stem.muted ? 'Muted' : stem.soloed ? 'Listening' : 'In mix'}</span>
                </div>
              </div>

              <div className="mix-strip-body">
                <span className="mix-strip-scale">{MIX_GAIN_DB_MAX} dB</span>
                <label className="mix-strip-fader">
                  <input
                    type="range"
                    min={MIX_GAIN_DB_MIN}
                    max={MIX_GAIN_DB_MAX}
                    step={0.5}
                    value={stem.gain_db}
                    onChange={(event) => updateStem(index, { gain_db: Number(event.target.value) })}
                    onDoubleClick={() => updateStem(index, { gain_db: 0 })}
                    className="mix-strip-gain"
                    aria-label={`${stem.label} gain`}
                  />
                </label>
                <span className="mix-strip-scale">{MIX_GAIN_DB_MIN} dB</span>
                <strong className="mix-strip-state">{formatGain(stem.gain_db)}</strong>
              </div>

              <div className="mix-strip-actions">
                <div className="mix-track-row-actions">
                  <button
                    type="button"
                    className={`mix-stem-toggle ${stem.muted ? 'active' : ''}`}
                    onClick={() => updateStem(index, { muted: !stem.muted })}
                    aria-pressed={stem.muted}
                    title={stem.muted ? 'Unmute' : 'Mute'}
                  >
                    Mute
                  </button>
                  <button
                    type="button"
                    className={`mix-stem-toggle ${stem.soloed ? 'active' : ''}`}
                    onClick={() => updateStem(index, { soloed: !stem.soloed })}
                    aria-pressed={stem.soloed}
                    title={stem.soloed ? 'Stop listening' : 'Listen in isolation'}
                  >
                    Listen
                  </button>
                </div>
              </div>
            </section>
          )
        })}
      </div>
      <p className="mix-panel-hint">
        Double-click any fader to reset it to unity. Level and mute save automatically. Listen affects preview only and is never saved.
      </p>
    </section>
  )
}
