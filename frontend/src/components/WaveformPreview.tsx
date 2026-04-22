import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'

import type { ArtifactMetrics } from '../types'
import { formatMetricsStrip } from './metrics'
import { Skeleton } from './feedback/Skeleton'

type WaveformPreviewProps = {
  title: string
  url: string
  peaks?: number[]
  metrics?: ArtifactMetrics | null
}

function readToken(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function WaveformPreview({ title, url, peaks, metrics }: WaveformPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<WaveSurfer | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const hasCachedPeaks = !!peaks && peaks.length > 0 && !!metrics?.duration_seconds

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    setIsPlaying(false)
    setIsReady(false)
    setErrorMessage(null)

    const options: Parameters<typeof WaveSurfer.create>[0] = {
      container: containerRef.current,
      url,
      height: 56,
      waveColor: readToken('--border-strong'),
      progressColor: readToken('--accent'),
      cursorColor: readToken('--text'),
      barWidth: 2,
      barGap: 2,
      barRadius: 999,
      normalize: true,
    }

    if (hasCachedPeaks && peaks && metrics?.duration_seconds) {
      options.peaks = [peaks]
      options.duration = metrics.duration_seconds
    }

    const player = WaveSurfer.create(options)
    player.on('pause', () => setIsPlaying(false))
    player.on('play', () => setIsPlaying(true))
    player.on('finish', () => setIsPlaying(false))
    player.on('ready', () => setIsReady(true))
    player.on('error', (error) => {
      setErrorMessage(error.message)
      setIsPlaying(false)
      setIsReady(false)
    })
    playerRef.current = player

    return () => {
      player.destroy()
      playerRef.current = null
    }
    // peaks + duration are captured in closure; we intentionally only re-create
    // the player when the source URL or the cached-peaks availability changes,
    // not when the parent re-polls and hands in new array identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey, hasCachedPeaks])

  function togglePlayback() {
    playerRef.current?.playPause()
  }

  function handleRetry() {
    setReloadKey((value) => value + 1)
  }

  const metricsLine = metrics ? formatMetricsStrip(metrics) : null

  return (
    <article className="wave-card">
      <div className="wave-card-header">
        <strong>{title}</strong>
        {errorMessage ? (
          <button type="button" className="button-secondary" onClick={handleRetry}>
            Retry
          </button>
        ) : (
          <button type="button" className="button-secondary" onClick={togglePlayback} disabled={!isReady}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        )}
      </div>
      <div className="waveform waveform-stack">
        <div ref={containerRef} className="waveform-canvas" style={{ opacity: isReady && !errorMessage ? 1 : 0 }} />
        {!isReady && !errorMessage ? (
          <div className="waveform-overlay">
            <Skeleton height={56} />
          </div>
        ) : null}
      </div>
      {errorMessage ? (
        <p className="wave-error">{errorMessage}</p>
      ) : metricsLine ? (
        <p className="wave-metrics">{metricsLine}</p>
      ) : null}
    </article>
  )
}
