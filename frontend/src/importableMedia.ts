const IMPORTABLE_MEDIA_EXTENSIONS = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.alac',
  '.avi',
  '.flac',
  '.m4a',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
  '.wma',
])

function hasImportableExtension(filename: string) {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex < 0) return false
  return IMPORTABLE_MEDIA_EXTENSIONS.has(filename.slice(dotIndex).toLowerCase())
}

function isImportableMediaFile(file: File) {
  if (/^(audio|video)\//.test(file.type)) return true
  return hasImportableExtension(file.name)
}

export function filterImportableMediaFiles(files: Iterable<File>) {
  return Array.from(files).filter(isImportableMediaFile)
}
