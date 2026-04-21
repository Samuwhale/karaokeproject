import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'

type WaveformPreviewProps = {
  title: string
  url: string
}

export function WaveformPreview({ title, url }: WaveformPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<WaveSurfer | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    setIsPlaying(false)
    setIsReady(false)
    setErrorMessage(null)

    const player = WaveSurfer.create({
      container: containerRef.current,
      url,
      height: 56,
      waveColor: '#3e4550',
      progressColor: '#8bd5a2',
      cursorColor: '#e7e8ea',
      barWidth: 2,
      barGap: 2,
      barRadius: 999,
      normalize: true,
    })
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
  }, [url])

  function togglePlayback() {
    playerRef.current?.playPause()
  }

  return (
    <article className="wave-card">
      <div className="wave-card-header">
        <strong>{title}</strong>
        <button type="button" className="button-secondary" onClick={togglePlayback} disabled={!isReady || !!errorMessage}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      </div>
      <div ref={containerRef} className="waveform" />
      {errorMessage ? (
        <p className="wave-error">{errorMessage}</p>
      ) : (
        <p className="wave-status">{isReady ? 'Ready to preview.' : 'Loading preview…'}</p>
      )}
    </article>
  )
}
