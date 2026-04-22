import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'

type WaveformOverlayProps = {
  title: string
  runALabel: string
  runBLabel: string
  urlA: string
  urlB: string
  peaksA: number[] | undefined
  peaksB: number[] | undefined
  durationA: number | null | undefined
  durationB: number | null | undefined
}

type Channel = 'a' | 'b'

function readToken(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildOptions(
  container: HTMLDivElement,
  url: string,
  peaks: number[] | undefined,
  duration: number | null | undefined,
  color: string,
  interact: boolean,
): Parameters<typeof WaveSurfer.create>[0] {
  const options: Parameters<typeof WaveSurfer.create>[0] = {
    container,
    url,
    height: 64,
    waveColor: color,
    progressColor: color,
    cursorColor: 'transparent',
    barWidth: 2,
    barGap: 2,
    barRadius: 999,
    normalize: true,
    interact,
  }
  if (peaks && peaks.length > 0 && duration) {
    options.peaks = [peaks]
    options.duration = duration
  }
  return options
}

export function WaveformOverlay({
  title,
  runALabel,
  runBLabel,
  urlA,
  urlB,
  peaksA,
  peaksB,
  durationA,
  durationB,
}: WaveformOverlayProps) {
  const containerARef = useRef<HTMLDivElement | null>(null)
  const containerBRef = useRef<HTMLDivElement | null>(null)
  const playerARef = useRef<WaveSurfer | null>(null)
  const playerBRef = useRef<WaveSurfer | null>(null)
  const [readyA, setReadyA] = useState(false)
  const [readyB, setReadyB] = useState(false)
  const [playing, setPlaying] = useState<Channel | null>(null)

  useEffect(() => {
    if (!containerARef.current || !containerBRef.current) return

    const accent = readToken('--accent')
    const compare = readToken('--warn')

    const playerA = WaveSurfer.create(
      buildOptions(containerARef.current, urlA, peaksA, durationA, accent, true),
    )
    const playerB = WaveSurfer.create(
      buildOptions(containerBRef.current, urlB, peaksB, durationB, compare, true),
    )

    playerARef.current = playerA
    playerBRef.current = playerB

    playerA.on('ready', () => setReadyA(true))
    playerB.on('ready', () => setReadyB(true))

    playerA.on('play', () => setPlaying('a'))
    playerA.on('pause', () => setPlaying((current) => (current === 'a' ? null : current)))
    playerA.on('finish', () => setPlaying((current) => (current === 'a' ? null : current)))
    playerB.on('play', () => setPlaying('b'))
    playerB.on('pause', () => setPlaying((current) => (current === 'b' ? null : current)))
    playerB.on('finish', () => setPlaying((current) => (current === 'b' ? null : current)))

    playerA.on('interaction', (time: number) => {
      playerB.setTime(time)
    })
    playerB.on('interaction', (time: number) => {
      playerA.setTime(time)
    })

    return () => {
      playerA.destroy()
      playerB.destroy()
      playerARef.current = null
      playerBRef.current = null
    }
    // peaks + durations are captured in closure; re-creating players only when
    // the URLs change avoids destroying mid-playback on every dashboard poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlA, urlB])

  function playChannel(channel: Channel) {
    const target = channel === 'a' ? playerARef.current : playerBRef.current
    const other = channel === 'a' ? playerBRef.current : playerARef.current
    if (!target || !other) return
    if (other.isPlaying()) {
      const time = other.getCurrentTime()
      other.pause()
      target.setTime(time)
    }
    if (target.isPlaying()) {
      target.pause()
    } else {
      void target.play()
    }
  }

  const bothReady = readyA && readyB

  return (
    <article className="overlay-card">
      <div className="overlay-card-header">
        <strong>{title}</strong>
        <div className="overlay-controls">
          <button
            type="button"
            className={`button-secondary ${playing === 'a' ? 'button-playing' : ''}`}
            onClick={() => playChannel('a')}
            disabled={!bothReady}
          >
            {playing === 'a' ? 'Pause this' : 'Play this'}
          </button>
          <button
            type="button"
            className={`button-secondary ${playing === 'b' ? 'button-playing' : ''}`}
            onClick={() => playChannel('b')}
            disabled={!bothReady}
          >
            {playing === 'b' ? 'Pause compared' : 'Play compared'}
          </button>
        </div>
      </div>
      <div className="overlay-legend">
        <span className="overlay-legend-this">This · {runALabel}</span>
        <span className="overlay-legend-compared">Compared · {runBLabel}</span>
      </div>
      <div className="waveform-overlay-stack">
        <div ref={containerBRef} className="waveform-overlay-layer waveform-overlay-b" />
        <div ref={containerARef} className="waveform-overlay-layer waveform-overlay-a" />
      </div>
    </article>
  )
}
