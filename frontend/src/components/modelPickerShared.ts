const MODEL_FILENAME_SUFFIXES = ['.ckpt', '.onnx', '.pth', '.yaml', '.yml']

export function isValidModelFilename(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.')) return false
  const lower = trimmed.toLowerCase()
  return MODEL_FILENAME_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}
