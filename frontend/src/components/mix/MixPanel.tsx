import { useEffect, useMemo, useRef, useState } from 'react'

import type { RunArtifact, RunDetail, RunMixStemEntry } from '../../types'
import { MIX_GAIN_DB_MAX, MIX_GAIN_DB_MIN, isMixableArtifactKind } from '../../types'
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

const STEM_KIND_ORDER = ['vocals', 'instrumental', 'extra-stem']
const SAVE_DEBOUNCE_MS = 400
const SCRUBBER_REFERENCE_ORDER = ['instrumental', 'vocals', 'extra-stem']

function mixableArtifacts(run: RunDetail): RunArtifact[] {
  return run.artifacts
    .filter((artifact) => isMixableArtifactKind(artifact.kind))
    .sort((a, b) => {
      const orderA = STEM_KIND_ORDER.indexOf(a.kind)
      const orderB = STEM_KIND_ORDER.indexOf(b.kind)
      if (orderA !== orderB) return orderA - orderB
      return a.label.localeCompare(b.label)
    })
}

function referenceArtifact(run: RunDetail): RunArtifact | null {
  const mixable = mixableArtifacts(run)
  for (const kind of SCRUBBER_REFERENCE_ORDER) {
    const found = mixable.find((artifact) => artifact.kind === kind)
    if (found) return found
  }
  return mixable[0] ?? null
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
  const runIdRef = useRef(run.id)
  const saveTimerRef = useRef<number | null>(null)

  // Sync on run change only; in-flight edits should not be clobbered by polling.
  useEffect(() => {
    if (runIdRef.current === run.id) return
    runIdRef.current = run.id
    setStems(initialStems(run))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id])

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

  const referencePeaks = useMemo(() => {
    const ref = referenceArtifact(run)
    return ref?.metrics?.peaks ?? []
  }, [run])

  function scheduleSave(next: StemRow[]) {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      const payload: RunMixStemEntry[] = next.map((stem) => ({
        artifact_id: stem.artifact_id,
        gain_db: Math.round(stem.gain_db * 10) / 10,
        muted: stem.muted,
      }))
      void onSave(payload).catch(() => undefined)
    }, SAVE_DEBOUNCE_MS)
  }

  function updateStem(index: number, patch: Partial<StemRow>) {
    setStems((current) => {
      const next = current.map((stem, i) => (i === index ? { ...stem, ...patch } : stem))
      // Save when gain or muted change; soloing is UI-only
      const persistedChanged =
        patch.gain_db !== undefined || patch.muted !== undefined
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

  return (
    <section className="mix-panel">
      <header className="mix-panel-head">
        <h3 className="subsection-head">Mix</h3>
        <div className="mix-panel-head-actions">
          <span className="mix-panel-status">
            {saving ? (
              <>
                <Spinner /> saving
              </>
            ) : dirty ? (
              'unsaved'
            ) : showsDefault ? (
              'unity'
            ) : (
              'saved'
            )}
          </span>
          <button
            type="button"
            className="button-secondary"
            onClick={handleReset}
            disabled={showsDefault && stems.every((stem) => !stem.soloed)}
          >
            Reset
          </button>
        </div>
      </header>

      <div className="mix-transport">
        <button
          type="button"
          className="button-primary mix-transport-play"
          onClick={handleTogglePlay}
          disabled={playDisabled}
          aria-label={mixer.isPlaying ? 'Pause preview' : 'Play preview'}
        >
          {mixer.loadState === 'loading' ? (
            <><Spinner /> Loading</>
          ) : mixer.isPlaying ? (
            'Pause'
          ) : (
            'Play'
          )}
        </button>
        <MixScrubber
          peaks={referencePeaks}
          currentTime={mixer.currentTime}
          duration={mixer.duration}
          onSeek={mixer.seek}
          disabled={playDisabled || mixer.duration === 0}
        />
        <span className="mix-transport-time">
          {formatTime(mixer.currentTime)} / {formatTime(mixer.duration)}
        </span>
      </div>

      {mixer.error ? <p className="mix-error">{mixer.error}</p> : null}

      <ul className="mix-stems">
        {stems.map((stem, index) => {
          const anySoloed = stems.some((other) => other.soloed)
          const silenced = stem.muted || (anySoloed && !stem.soloed)
          return (
            <li
              key={stem.artifact_id}
              className={`mix-stem-row ${silenced ? 'mix-stem-silenced' : ''}`}
            >
              <div className="mix-stem-label">
                <strong>{stem.label}</strong>
                <span>{formatGain(stem.gain_db)}</span>
              </div>
              <input
                type="range"
                min={MIX_GAIN_DB_MIN}
                max={MIX_GAIN_DB_MAX}
                step={0.5}
                value={stem.gain_db}
                onChange={(event) => updateStem(index, { gain_db: Number(event.target.value) })}
                onDoubleClick={() => updateStem(index, { gain_db: 0 })}
                className="mix-stem-gain"
                aria-label={`${stem.label} gain`}
              />
              <div className="mix-stem-toggles">
                <button
                  type="button"
                  className={`mix-stem-toggle ${stem.muted ? 'active' : ''}`}
                  onClick={() => updateStem(index, { muted: !stem.muted })}
                  aria-pressed={stem.muted}
                  title={stem.muted ? 'Unmute' : 'Mute'}
                >
                  M
                </button>
                <button
                  type="button"
                  className={`mix-stem-toggle ${stem.soloed ? 'active' : ''}`}
                  onClick={() => updateStem(index, { soloed: !stem.soloed })}
                  aria-pressed={stem.soloed}
                  title={stem.soloed ? 'Unsolo' : 'Solo'}
                >
                  S
                </button>
              </div>
            </li>
          )
        })}
      </ul>

    </section>
  )
}
