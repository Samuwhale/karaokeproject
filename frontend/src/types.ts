export type ProcessingProfile = {
  key: string
  label: string
  description: string
  model_filename: string
}

export type RunProcessingConfig = {
  profile_key: string
  profile_label: string
  model_filename: string
  export_mp3_bitrate: string
}

export type RunProcessingConfigInput = {
  profile_key: string
  export_mp3_bitrate: string
}

export type Settings = {
  output_directory: string
  model_cache_directory: string
  default_preset: string
  export_mp3_bitrate: string
  profiles: ProcessingProfile[]
}

export type BinaryStatus = {
  name: string
  required: boolean
  available: boolean
  path: string | null
  version: string | null
}

export type Diagnostics = {
  app_ready: boolean
  acceleration: string
  free_disk_gb: number
  binaries: BinaryStatus[]
  issues: string[]
  data_directories: Record<string, string>
  url_import_ready: boolean
}

export type RunSummary = {
  id: string
  preset: string
  processing: RunProcessingConfig
  status: string
  progress: number
  status_message: string
  error_message: string | null
  output_directory: string | null
  created_at: string
  updated_at: string
}

export type RunArtifact = {
  id: string
  kind: string
  label: string
  format: string
  path: string
  created_at: string
  download_url: string
}

export type RunDetail = RunSummary & {
  metadata_json: Record<string, unknown>
  artifacts: RunArtifact[]
}

export type TrackSummary = {
  id: string
  title: string
  artist: string | null
  source_type: string
  source_url: string | null
  thumbnail_url: string | null
  source_filename: string
  duration_seconds: number | null
  created_at: string
  updated_at: string
  latest_run: RunSummary | null
  run_count: number
}

export type TrackDetail = {
  id: string
  title: string
  artist: string | null
  source_type: string
  source_url: string | null
  thumbnail_url: string | null
  source_filename: string
  source_format: string
  source_download_url: string
  duration_seconds: number | null
  metadata_json: Record<string, unknown>
  created_at: string
  updated_at: string
  runs: RunDetail[]
}

export type ExistingTrackDuplicate = {
  id: string
  title: string
  artist: string | null
  source_filename: string
}

export type ResolvedYouTubeImportItem = {
  video_id: string
  source_url: string
  canonical_source_url: string
  title: string
  artist: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  duplicate_tracks: ExistingTrackDuplicate[]
}

export type ResolveYouTubeImportResponse = {
  source_kind: string
  source_url: string
  title: string
  item_count: number
  items: ResolvedYouTubeImportItem[]
  profiles: ProcessingProfile[]
  default_processing: RunProcessingConfig
}

export type ConfirmYouTubeImportItemInput = {
  video_id: string
  source_url: string
  canonical_source_url: string
  title: string
  artist: string | null
  thumbnail_url: string | null
  duplicate_action: 'create-new' | 'reuse-existing'
  existing_track_id: string | null
}

export type ConfirmYouTubeImportPayload = {
  source_url: string
  processing: RunProcessingConfigInput
  items: ConfirmYouTubeImportItemInput[]
}

export type ConfirmYouTubeImportResponse = {
  tracks: TrackSummary[]
  created_track_count: number
  reused_track_count: number
}
