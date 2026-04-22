import type { ProcessingProfile } from '../types'

const QUALITY_LABELS = ['Low', 'Medium', 'High'] as const
const SPEED_LABELS = ['Slow', 'Medium', 'Fast'] as const

function qualityLabel(tier: number): string {
  return QUALITY_LABELS[Math.max(0, Math.min(QUALITY_LABELS.length - 1, tier))]
}

function speedLabel(tier: number): string {
  return SPEED_LABELS[Math.max(0, Math.min(SPEED_LABELS.length - 1, tier - 1))]
}

function Dots({ filled, total }: { filled: number; total: number }) {
  const clamped = Math.max(0, Math.min(total, filled))
  return (
    <span className="tier-dots" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={index < clamped ? 'tier-dot tier-dot-filled' : 'tier-dot'}
        />
      ))}
    </span>
  )
}

export function ProfileTierBadge({ profile }: { profile: ProcessingProfile }) {
  const qualityFilled = profile.quality_tier + 1
  const speedFilled = profile.speed_tier
  return (
    <span
      className="profile-tier-badge"
      aria-label={`Quality: ${qualityLabel(profile.quality_tier)}. Speed: ${speedLabel(profile.speed_tier)}.`}
    >
      <span className="profile-tier-group">
        <span className="profile-tier-label">Q</span>
        <Dots filled={qualityFilled} total={3} />
      </span>
      <span className="profile-tier-group">
        <span className="profile-tier-label">S</span>
        <Dots filled={speedFilled} total={3} />
      </span>
    </span>
  )
}
