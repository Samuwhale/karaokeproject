import { useState } from 'react'

import type { ProcessingProfile, RunProcessingConfigInput } from '../types'
import { Spinner } from './feedback/Spinner'
import { ProfileTierBadge } from './ProfileTierBadge'

type BatchActionBarProps = {
  selectedCount: number
  onClear: () => void
  busy: boolean
  children: React.ReactNode
}

export function BatchActionBar({ selectedCount, onClear, busy, children }: BatchActionBarProps) {
  if (selectedCount === 0) return null
  return (
    <div className="batch-bar" role="region" aria-label="Selection actions">
      <div className="batch-bar-inner">
        <div className="batch-bar-count">
          {busy ? <Spinner /> : null}
          {selectedCount} selected
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
  disabled?: boolean
  buttonLabel?: string
}

export function ApplyArtistPrompt({ onApply, disabled, buttonLabel = 'Set artist' }: ApplyArtistPromptProps) {
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
        placeholder="Artist name (blank clears)"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="button-primary" disabled={disabled}>
        Apply
      </button>
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

type ConfirmDraftsPromptProps = {
  selectedCount: number
  disabled: boolean
  profiles: ProcessingProfile[]
  defaultProcessing: RunProcessingConfigInput
  onConfirm: (queue: boolean, processing: RunProcessingConfigInput) => void
}

export function ConfirmDraftsPrompt({
  selectedCount,
  disabled,
  profiles,
  defaultProcessing,
  onConfirm,
}: ConfirmDraftsPromptProps) {
  const [open, setOpen] = useState(false)
  const [processing, setProcessing] = useState<RunProcessingConfigInput>(defaultProcessing)

  if (!open) {
    return (
      <button
        type="button"
        className="button-primary"
        disabled={disabled}
        onClick={() => {
          setProcessing(defaultProcessing)
          setOpen(true)
        }}
      >
        Confirm {selectedCount}
      </button>
    )
  }

  const selectedProfile = profiles.find((profile) => profile.key === processing.profile_key) ?? null

  return (
    <div className="inline-popover">
      <div className="inline-popover-row">
        <label className="field field-compact">
          <span>Profile (if queueing)</span>
          <select
            value={processing.profile_key}
            onChange={(event) =>
              setProcessing((current) => ({ ...current, profile_key: event.target.value }))
            }
          >
            {profiles.map((profile) => (
              <option key={profile.key} value={profile.key}>
                {profile.label} — {profile.strength}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-compact">
          <span>MP3 bitrate</span>
          <input
            type="text"
            value={processing.export_mp3_bitrate}
            onChange={(event) =>
              setProcessing((current) => ({ ...current, export_mp3_bitrate: event.target.value }))
            }
          />
        </label>
      </div>
      {selectedProfile ? (
        <div className="profile-meta-lines">
          <span><strong>Best for:</strong> {selectedProfile.best_for}</span>
          <ProfileTierBadge profile={selectedProfile} />
        </div>
      ) : null}
      <div className="inline-popover-actions">
        <button
          type="button"
          className="button-secondary"
          disabled={disabled}
          onClick={() => {
            onConfirm(false, processing)
            setOpen(false)
          }}
        >
          Create tracks only
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={disabled}
          onClick={() => {
            onConfirm(true, processing)
            setOpen(false)
          }}
        >
          Create + queue runs
        </button>
        <button
          type="button"
          className="button-link"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
