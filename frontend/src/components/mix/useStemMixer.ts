import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type MixerStemInput = {
  artifact_id: string
  url: string
  gain_db: number
  muted: boolean
  soloed: boolean
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

type StemRuntime = {
  source: AudioBufferSourceNode | null
  gain: GainNode
}

const GAIN_RAMP_SECONDS = 0.05

function dbToLinear(db: number) {
  return Math.pow(10, db / 20)
}

function effectiveGain(stems: MixerStemInput[], stem: MixerStemInput) {
  if (stem.muted) return 0
  const anySoloed = stems.some((other) => other.soloed)
  if (anySoloed && !stem.soloed) return 0
  return dbToLinear(stem.gain_db)
}

const bufferCache = new Map<string, Promise<AudioBuffer>>()

async function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  let pending = bufferCache.get(url)
  if (!pending) {
    pending = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.status}`)
        }
        return response.arrayBuffer()
      })
      .then((buffer) => ctx.decodeAudioData(buffer.slice(0)))
      .catch((error) => {
        bufferCache.delete(url)
        throw error
      })
    bufferCache.set(url, pending)
  }
  return pending
}

export function useStemMixer(stems: MixerStemInput[]) {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map())
  const runtimeRef = useRef<Map<string, StemRuntime>>(new Map())
  const startCtxTimeRef = useRef(0)
  const startOffsetRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const stemKeys = useMemo(
    () => stems.map((stem) => `${stem.artifact_id}|${stem.url}`).join(','),
    [stems],
  )

  useEffect(() => {
    let cancelled = false
    if (!stems.length) {
      setLoadState('idle')
      setDuration(0)
      return () => {
        cancelled = true
      }
    }

    setLoadState('loading')
    setError(null)

    const ctx = ctxRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    ctxRef.current = ctx

    async function loadAll() {
      try {
        const results = await Promise.all(
          stems.map(async (stem) => {
            const buffer = await loadBuffer(ctx, stem.url)
            return { stem, buffer }
          }),
        )
        if (cancelled) return
        const nextBuffers = new Map<string, AudioBuffer>()
        let maxDuration = 0
        for (const { stem, buffer } of results) {
          nextBuffers.set(stem.artifact_id, buffer)
          if (buffer.duration > maxDuration) maxDuration = buffer.duration
        }
        buffersRef.current = nextBuffers
        setDuration(maxDuration)
        setLoadState('ready')
      } catch (caught) {
        if (cancelled) return
        setLoadState('error')
        setError(caught instanceof Error ? caught.message : 'Could not load stems for preview.')
      }
    }

    void loadAll()
    return () => {
      cancelled = true
    }
    // stemKeys folds in stems identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemKeys])

  const stopSources = useCallback(() => {
    const runtime = runtimeRef.current
    runtime.forEach((entry) => {
      if (entry.source) {
        try {
          entry.source.stop()
        } catch {
          // already stopped
        }
        entry.source.disconnect()
        entry.source = null
      }
    })
  }, [])

  // Drop runtime entries whose stems are no longer present so orphan
  // GainNodes don't linger connected to the destination.
  useEffect(() => {
    const runtime = runtimeRef.current
    const activeIds = new Set(stems.map((stem) => stem.artifact_id))
    runtime.forEach((entry, id) => {
      if (activeIds.has(id)) return
      if (entry.source) {
        try {
          entry.source.stop()
        } catch {
          // already stopped
        }
        entry.source.disconnect()
      }
      entry.gain.disconnect()
      runtime.delete(id)
    })
  }, [stemKeys])

  const teardown = useCallback(() => {
    stopSources()
    const runtime = runtimeRef.current
    runtime.forEach((entry) => entry.gain.disconnect())
    runtime.clear()
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [stopSources])

  useEffect(() => {
    return () => {
      teardown()
      if (ctxRef.current) {
        void ctxRef.current.close().catch(() => undefined)
        ctxRef.current = null
      }
    }
  }, [teardown])

  const updateGains = useCallback(
    (nextStems: MixerStemInput[]) => {
      const ctx = ctxRef.current
      if (!ctx) return
      const runtime = runtimeRef.current
      for (const stem of nextStems) {
        const entry = runtime.get(stem.artifact_id)
        if (!entry) continue
        const target = effectiveGain(nextStems, stem)
        entry.gain.gain.cancelScheduledValues(ctx.currentTime)
        entry.gain.gain.setTargetAtTime(target, ctx.currentTime, GAIN_RAMP_SECONDS)
      }
    },
    [],
  )

  useEffect(() => {
    updateGains(stems)
  }, [stems, updateGains])

  const tick = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const elapsed = ctx.currentTime - startCtxTimeRef.current + startOffsetRef.current
    if (elapsed >= duration) {
      stopSources()
      setIsPlaying(false)
      setCurrentTime(duration)
      rafRef.current = null
      return
    }
    setCurrentTime(elapsed)
    rafRef.current = requestAnimationFrame(tick)
  }, [duration, stopSources])

  const play = useCallback(
    (fromSeconds?: number) => {
      const ctx = ctxRef.current
      if (!ctx || loadState !== 'ready') return
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)

      stopSources()
      const offset = Math.max(0, Math.min(duration, fromSeconds ?? currentTime))
      startOffsetRef.current = offset
      startCtxTimeRef.current = ctx.currentTime

      const runtime = runtimeRef.current
      for (const stem of stems) {
        const buffer = buffersRef.current.get(stem.artifact_id)
        if (!buffer) continue
        let entry = runtime.get(stem.artifact_id)
        if (!entry) {
          const gain = ctx.createGain()
          gain.connect(ctx.destination)
          gain.gain.value = effectiveGain(stems, stem)
          entry = { source: null, gain }
          runtime.set(stem.artifact_id, entry)
        } else {
          entry.gain.gain.setValueAtTime(effectiveGain(stems, stem), ctx.currentTime)
        }
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(entry.gain)
        if (offset < buffer.duration) {
          source.start(ctx.currentTime, offset)
        }
        entry.source = source
      }

      setIsPlaying(true)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    },
    [currentTime, duration, loadState, stems, stopSources, tick],
  )

  const pause = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const elapsed = Math.min(
      duration,
      ctx.currentTime - startCtxTimeRef.current + startOffsetRef.current,
    )
    stopSources()
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setCurrentTime(elapsed)
    setIsPlaying(false)
  }, [duration, stopSources])

  const seek = useCallback(
    (seconds: number) => {
      const bounded = Math.max(0, Math.min(duration, seconds))
      setCurrentTime(bounded)
      if (isPlaying) {
        play(bounded)
      }
    },
    [duration, isPlaying, play],
  )

  return {
    loadState,
    isPlaying,
    currentTime,
    duration,
    error,
    play,
    pause,
    seek,
  }
}
