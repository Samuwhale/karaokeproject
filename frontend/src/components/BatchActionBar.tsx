import { useEffect, useRef, useState } from 'react'

import { Spinner } from './feedback/Spinner'

type BatchActionBarProps = {
  selectedCount: number
  selectionLabel: string
  onClear: () => void
  busy: boolean
  children: React.ReactNode
  inert?: boolean
}

export function BatchActionBar({
  selectedCount,
  selectionLabel,
  onClear,
  busy,
  children,
  inert,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null
  return (
    <div className="batch-bar" role="region" aria-label="Selection actions" inert={inert || undefined}>
      <div className="batch-bar-inner">
        <div className="batch-bar-count">
          {busy ? <Spinner /> : null}
          {selectedCount} {selectionLabel} selected
          <button type="button" className="button-link" onClick={onClear}>
            Clear
          </button>
        </div>
        <div className="batch-bar-actions">{children}</div>
      </div>
    </div>
  )
}

type ApplyArtistPromptProps = {
  onApply: (artist: string | null) => void
  onClear?: () => void
  disabled?: boolean
  buttonLabel?: string
}

type OverflowMenuProps = {
  label?: string
  children: React.ReactNode
}

export function OverflowMenu({ label = 'More…', children }: OverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="overflow-menu" ref={wrapperRef}>
      <button
        type="button"
        className="button-secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? (
        <div className="overflow-menu-panel" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function ApplyArtistPrompt({
  onApply,
  onClear,
  disabled,
  buttonLabel = 'Set artist',
}: ApplyArtistPromptProps) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  if (!open) {
    return (
      <button
        type="button"
        className="button-secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {buttonLabel}
      </button>
    )
  }

  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = value.trim()
        onApply(trimmed ? trimmed : null)
        setValue('')
        setOpen(false)
      }}
    >
      <input
        type="text"
        autoFocus
        placeholder="Artist name"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="button-primary" disabled={disabled}>
        Apply
      </button>
      {onClear ? (
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            onClear()
            setValue('')
            setOpen(false)
          }}
        >
          Clear artist
        </button>
      ) : null}
      <button
        type="button"
        className="button-secondary"
        onClick={() => {
          setOpen(false)
          setValue('')
        }}
      >
        Cancel
      </button>
    </form>
  )
}
