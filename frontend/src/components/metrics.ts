import type { ArtifactMetrics } from '../types'

export function formatLufs(value: number | null | undefined) {
  if (value == null) return null
  return `${value.toFixed(1)} LUFS`
}

export function formatTruePeak(value: number | null | undefined) {
  if (value == null) return null
  return `${value.toFixed(1)} dBTP`
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return null
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function formatSampleRate(hz: number | null | undefined) {
  if (hz == null) return null
  return `${(hz / 1000).toFixed(1)} kHz`
}

export function formatChannels(channels: number | null | undefined) {
  if (channels == null) return null
  if (channels === 1) return 'mono'
  if (channels === 2) return 'stereo'
  return `${channels}ch`
}

export function formatSize(bytes: number | null | undefined) {
  if (bytes == null) return null
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`
  return `${mb.toFixed(1)} MB`
}

export function formatMetricsStrip(metrics: ArtifactMetrics) {
  const parts = [
    formatLufs(metrics.integrated_lufs),
    formatTruePeak(metrics.true_peak_dbfs),
    formatDuration(metrics.duration_seconds),
    formatSampleRate(metrics.sample_rate),
    formatChannels(metrics.channels),
    formatSize(metrics.size_bytes),
  ].filter((part): part is string => part !== null)
  return parts.join(' · ')
}
