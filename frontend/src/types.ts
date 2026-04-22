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
  note: string
}

export type ArtifactMetrics = {
  duration_seconds: number | null
  sample_rate: number | null
  channels: number | null
  size_bytes: number | null
  integrated_lufs: number | null
  true_peak_dbfs: number | null
  peaks: number[]
}

export type RunArtifact = {
  id: string
  kind: string
  label: string
  format: string
  path: string
  created_at: string
  download_url: string
  metrics: ArtifactMetrics | null
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
  keeper_run_id: string | null
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
  keeper_run_id: string | null
}

export type ExistingTrackDuplicate = {
  id: string
  title: string
  artist: string | null
  source_filename: string
}

export type DraftSourceType = 'youtube' | 'local'
export type DraftStatus = 'pending' | 'confirmed' | 'discarded'
export type DraftDuplicateAction = 'create-new' | 'reuse-existing' | 'skip'

export type ImportDraft = {
  id: string
  source_type: DraftSourceType
  status: DraftStatus
  created_at: string
  updated_at: string

  title: string
  artist: string | null
  suggested_title: string
  suggested_artist: string | null

  video_id: string | null
  source_url: string | null
  canonical_source_url: string | null
  playlist_source_url: string | null
  thumbnail_url: string | null
  duration_seconds: number | null

  original_filename: string | null
  content_hash: string | null
  size_bytes: number | null

  duplicate_action: DraftDuplicateAction | null
  existing_track_id: string | null
  duplicate_tracks: ExistingTrackDuplicate[]
}

export type ResolveYouTubeImportResponse = {
  source_kind: string
  source_title: string
  drafts: ImportDraft[]
  profiles: ProcessingProfile[]
  default_processing: RunProcessingConfig
}

export type ResolveLocalImportResponse = {
  drafts: ImportDraft[]
  profiles: ProcessingProfile[]
  default_processing: RunProcessingConfig
}

export type UpdateImportDraftInput = {
  title?: string
  artist?: string | null
  duplicate_action?: DraftDuplicateAction
  existing_track_id?: string | null
}

export type BatchUpdateImportDraftInput = {
  draft_ids: string[]
  title?: string
  artist?: string | null
  duplicate_action?: DraftDuplicateAction
}

export type BatchDiscardImportDraftInput = {
  draft_ids: string[]
}

export type ConfirmImportDraftsInput = {
  draft_ids: string[]
  queue: boolean
  processing?: RunProcessingConfigInput
}

export type ConfirmImportDraftsResponse = {
  tracks: TrackSummary[]
  created_track_count: number
  reused_track_count: number
  skipped_draft_count: number
  queued_run_count: number
}

export type QueueRunEntry = {
  run: RunSummary
  track_id: string
  track_title: string
  track_artist: string | null
}

export type BatchTrackIdsInput = {
  track_ids: string[]
}

export type BatchQueueRunsInput = BatchTrackIdsInput & {
  processing: RunProcessingConfigInput
}

export type BatchApplyInput = BatchTrackIdsInput & {
  artist?: string | null
}

export type BatchQueueRunsResponse = {
  queued_run_count: number
  skipped_track_ids: string[]
}

export type BatchDeleteResponse = {
  deleted_track_count: number
  skipped_track_ids: string[]
}

export type BatchCancelResponse = {
  cancelled_run_count: number
}

export type BatchApplyResponse = {
  updated_track_count: number
}

export type BatchPurgeNonKeepersResponse = {
  purged_track_count: number
  deleted_run_count: number
  bytes_reclaimed: number
  skipped_track_ids: string[]
}

export type ExportRunSelector = 'keeper' | 'latest'
export type ExportOutputMode = 'single-bundle' | 'zip-per-track'
export type ExportArtifactKind =
  | 'instrumental-wav'
  | 'instrumental-mp3'
  | 'vocals-wav'
  | 'source'
  | 'metadata'

export type ExportBundleInput = {
  track_ids: string[]
  run_selector: ExportRunSelector
  artifacts: ExportArtifactKind[]
  mode: ExportOutputMode
}

export type ExportBundleSkip = {
  track_id: string
  track_title: string
  reason: string
}

export type ExportBundleResponse = {
  job_id: string
  download_url: string
  filename: string
  byte_count: number
  included_track_count: number
  skipped: ExportBundleSkip[]
}
