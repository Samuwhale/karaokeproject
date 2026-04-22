export const STEM_KIND_PREFIX = 'stem:'
export const EXPORT_STEM_WAV_PREFIX = 'stem-wav:'
export const EXPORT_STEM_MP3_PREFIX = 'stem-mp3:'

type CanonicalStem = {
  name: string
  label: string
  displayOrder: number
}

// Mirrors backend/core/stems.py CANONICAL_STEMS. Kept in sync by convention:
// when a new canonical role is added on the backend, add it here too so the
// UI can label and order it without waiting on the API.
const CANONICAL_STEMS: readonly CanonicalStem[] = [
  { name: 'instrumental', label: 'Instrumental', displayOrder: 0 },
  { name: 'vocals', label: 'Vocals', displayOrder: 1 },
  { name: 'lead_vocals', label: 'Lead vocals', displayOrder: 2 },
  { name: 'backing_vocals', label: 'Backing vocals', displayOrder: 3 },
  { name: 'drums', label: 'Drums', displayOrder: 4 },
  { name: 'bass', label: 'Bass', displayOrder: 5 },
  { name: 'other', label: 'Other', displayOrder: 6 },
  { name: 'piano', label: 'Piano', displayOrder: 7 },
  { name: 'guitar', label: 'Guitar', displayOrder: 8 },
]

const BY_NAME = new Map(CANONICAL_STEMS.map((stem) => [stem.name, stem] as const))

export function isStemKind(kind: string): boolean {
  return kind.startsWith(STEM_KIND_PREFIX)
}

export function stemNameFromKind(kind: string): string | null {
  if (!kind.startsWith(STEM_KIND_PREFIX)) return null
  return kind.slice(STEM_KIND_PREFIX.length)
}

export function stemLabel(stemName: string): string {
  const canonical = BY_NAME.get(stemName)
  if (canonical) return canonical.label
  return stemName
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

export function stemDisplayOrder(stemName: string): number {
  const canonical = BY_NAME.get(stemName)
  if (canonical) return canonical.displayOrder
  let sum = 0
  for (let i = 0; i < stemName.length; i += 1) sum += stemName.charCodeAt(i)
  return 1000 + (sum % 1000)
}

export function compareStemKinds(a: string, b: string): number {
  const nameA = stemNameFromKind(a)
  const nameB = stemNameFromKind(b)
  if (nameA === null || nameB === null) {
    if (nameA === null && nameB === null) return a.localeCompare(b)
    return nameA === null ? 1 : -1
  }
  const orderA = stemDisplayOrder(nameA)
  const orderB = stemDisplayOrder(nameB)
  if (orderA !== orderB) return orderA - orderB
  return nameA.localeCompare(nameB)
}

export function exportStemKind(stemName: string, fmt: 'wav' | 'mp3'): string {
  return `${fmt === 'wav' ? EXPORT_STEM_WAV_PREFIX : EXPORT_STEM_MP3_PREFIX}${stemName}`
}
