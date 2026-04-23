import type { ReactNode } from 'react'

function Mic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 12a7 7 0 0 0 14 0M12 19v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Drums() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="9" rx="8" ry="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 9v7c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 4l4 4M19 4l-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function Bass() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12c2 0 2-4 4-4s2 8 4 8 2-8 4-8 2 4 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Piano() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 6v8M15 6v8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function Guitar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="15" r="5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13 11l7-7M16 4h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function Dot() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </svg>
  )
}

function normalise(label: string) {
  return label.toLowerCase().replace(/[^a-z]/g, '')
}

export function stemIcon(label: string): ReactNode {
  const key = normalise(label)
  if (key.includes('vocal')) return <Mic />
  if (key.includes('drum')) return <Drums />
  if (key.includes('bass')) return <Bass />
  if (key.includes('piano') || key.includes('keys')) return <Piano />
  if (key.includes('guitar')) return <Guitar />
  return <Dot />
}

export function stemTone(label: string): string {
  const key = normalise(label)
  if (key === 'vocals' || key === 'leadvocals') return 'Lead'
  if (key === 'backingvocals') return 'Backing'
  if (key === 'drums') return 'Rhythm'
  if (key === 'bass') return 'Low end'
  if (key === 'piano' || key === 'keys') return 'Keys'
  if (key === 'guitar') return 'Guitar'
  if (key === 'other') return 'Texture'
  if (key === 'instrumental') return 'Backing track'
  return 'Stem'
}
