import { useState } from 'react'

import type {
  ConfirmYouTubeImportPayload,
  ProcessingProfile,
  ResolveYouTubeImportResponse,
  RunProcessingConfigInput,
} from '../types'

type ImportPanelProps = {
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  defaultMp3Bitrate: string
  importing: boolean
  resolvingImport: boolean
  confirmingImport: boolean
  youtubeResolution: ResolveYouTubeImportResponse | null
  onLocalImport: (formData: FormData) => Promise<void>
  onResolveYouTube: (sourceUrl: string) => Promise<void>
  onConfirmYouTube: (payload: ConfirmYouTubeImportPayload) => Promise<void>
  onDiscardYouTubeReview: () => void
}

type ReviewItemDraft = {
  selected: boolean
  video_id: string
  source_url: string
  canonical_source_url: string
  title: string
  artist: string
  thumbnail_url: string | null
  duplicate_action: 'create-new' | 'reuse-existing'
  existing_track_id: string | null
  duplicate_tracks: ResolveYouTubeImportResponse['items'][number]['duplicate_tracks']
}

type DraftState<T> = {
  sourceKey: string
  values: T
}

function buildProcessingDraft(defaultProfileKey: string, defaultMp3Bitrate: string): RunProcessingConfigInput {
  return {
    profile_key: defaultProfileKey,
    export_mp3_bitrate: defaultMp3Bitrate,
  }
}

function resolveProfile(profiles: ProcessingProfile[], profileKey: string) {
  return profiles.find((profile) => profile.key === profileKey) ?? profiles[0] ?? null
}

function buildReviewItemDrafts(resolution: ResolveYouTubeImportResponse | null): ReviewItemDraft[] {
  if (!resolution) {
    return []
  }

  return resolution.items.map((item) => ({
    selected: true,
    video_id: item.video_id,
    source_url: item.source_url,
    canonical_source_url: item.canonical_source_url,
    title: item.title,
    artist: item.artist ?? '',
    thumbnail_url: item.thumbnail_url,
    duplicate_action: item.duplicate_tracks.length ? 'reuse-existing' : 'create-new',
    existing_track_id: item.duplicate_tracks[0]?.id ?? null,
    duplicate_tracks: item.duplicate_tracks,
  }))
}

export function ImportPanel({
  profiles,
  defaultProfileKey,
  defaultMp3Bitrate,
  importing,
  resolvingImport,
  confirmingImport,
  youtubeResolution,
  onLocalImport,
  onResolveYouTube,
  onConfirmYouTube,
  onDiscardYouTubeReview,
}: ImportPanelProps) {
  const [localArtist, setLocalArtist] = useState('')
  const [localFiles, setLocalFiles] = useState<FileList | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const localProcessingKey = `${defaultProfileKey}|${defaultMp3Bitrate}`
  const [localProcessingState, setLocalProcessingState] = useState<DraftState<RunProcessingConfigInput>>({
    sourceKey: localProcessingKey,
    values: buildProcessingDraft(defaultProfileKey, defaultMp3Bitrate),
  })
  const reviewKey = youtubeResolution ? `${youtubeResolution.source_url}|${youtubeResolution.item_count}` : 'review'
  const [youtubeProcessingState, setYoutubeProcessingState] = useState<DraftState<RunProcessingConfigInput>>({
    sourceKey: reviewKey,
    values: youtubeResolution
      ? {
          profile_key: youtubeResolution.default_processing.profile_key,
          export_mp3_bitrate: youtubeResolution.default_processing.export_mp3_bitrate,
        }
      : buildProcessingDraft(defaultProfileKey, defaultMp3Bitrate),
  })
  const [reviewState, setReviewState] = useState<DraftState<ReviewItemDraft[]>>({
    sourceKey: reviewKey,
    values: buildReviewItemDrafts(youtubeResolution),
  })

  const localProcessing =
    localProcessingState.sourceKey === localProcessingKey
      ? localProcessingState.values
      : buildProcessingDraft(defaultProfileKey, defaultMp3Bitrate)
  const youtubeProcessing =
    youtubeProcessingState.sourceKey === reviewKey
      ? youtubeProcessingState.values
      : youtubeResolution
        ? {
            profile_key: youtubeResolution.default_processing.profile_key,
            export_mp3_bitrate: youtubeResolution.default_processing.export_mp3_bitrate,
          }
        : buildProcessingDraft(defaultProfileKey, defaultMp3Bitrate)
  const reviewItems = reviewState.sourceKey === reviewKey ? reviewState.values : buildReviewItemDrafts(youtubeResolution)

  const selectedLocalProfile = resolveProfile(profiles, localProcessing.profile_key)
  const selectedYoutubeProfile = resolveProfile(profiles, youtubeProcessing.profile_key)
  const selectedReviewCount = reviewItems.filter((item) => item.selected).length

  async function handleLocalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!localFiles?.length) {
      return
    }

    const formData = new FormData()
    Array.from(localFiles).forEach((file) => formData.append('files', file))
    formData.append('artist', localArtist)
    formData.append('processing_config_json', JSON.stringify(localProcessing))
    await onLocalImport(formData)

    event.currentTarget.reset()
    setLocalFiles(null)
    setLocalArtist('')
    setLocalProcessingState({
      sourceKey: localProcessingKey,
      values: buildProcessingDraft(defaultProfileKey, defaultMp3Bitrate),
    })
  }

  async function handleResolveSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!youtubeUrl.trim()) {
      return
    }

    await onResolveYouTube(youtubeUrl.trim())
  }

  async function handleConfirmReview() {
    const items = reviewItems
      .filter((item) => item.selected)
      .map((item) => ({
        video_id: item.video_id,
        source_url: item.source_url,
        canonical_source_url: item.canonical_source_url,
        title: item.title.trim(),
        artist: item.artist.trim() || null,
        thumbnail_url: item.thumbnail_url,
        duplicate_action: item.duplicate_action,
        existing_track_id: item.duplicate_action === 'reuse-existing' ? item.existing_track_id : null,
      }))

    if (!youtubeResolution || !items.length) {
      return
    }

    await onConfirmYouTube({
      source_url: youtubeResolution.source_url,
      processing: youtubeProcessing,
      items,
    })
  }

  function updateReviewItem(videoId: string, updater: (item: ReviewItemDraft) => ReviewItemDraft) {
    setReviewState({
      sourceKey: reviewKey,
      values: reviewItems.map((item) => (item.video_id === videoId ? updater(item) : item)),
    })
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Import</h2>
        <span className="section-head-meta">{profiles.length} profiles</span>
      </div>

      <div className="import-stack">
        <form className="import-form" onSubmit={handleResolveSubmit}>
          <label className="field">
            <span>YouTube URL (video or playlist)</span>
            <input
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
            />
          </label>

          <div className="import-footer">
            <span>
              {youtubeResolution
                ? `${youtubeResolution.item_count} item${youtubeResolution.item_count === 1 ? '' : 's'} resolved.`
                : 'Paste a URL to review metadata and queue processing.'}
            </span>
            <button type="submit" className="button-primary" disabled={resolvingImport || !youtubeUrl.trim()}>
              {resolvingImport ? 'Resolving…' : 'Resolve'}
            </button>
          </div>
        </form>

        {youtubeResolution ? (
          <div className="review-panel">
            <div className="review-heading">
              <div>
                <h3>{youtubeResolution.title}</h3>
                <p>Select entries, set metadata, pick duplicate handling, then queue.</p>
              </div>
              <button type="button" className="button-secondary" onClick={onDiscardYouTubeReview}>
                Clear
              </button>
            </div>

            <div className="processing-grid">
              <label className="field">
                <span>Profile</span>
                <select
                  value={youtubeProcessing.profile_key}
                  onChange={(event) =>
                    setYoutubeProcessingState({
                      sourceKey: reviewKey,
                      values: { ...youtubeProcessing, profile_key: event.target.value },
                    })
                  }
                >
                  {profiles.map((profile) => (
                    <option key={profile.key} value={profile.key}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>MP3 bitrate</span>
                <input
                  type="text"
                  value={youtubeProcessing.export_mp3_bitrate}
                  onChange={(event) =>
                    setYoutubeProcessingState({
                      sourceKey: reviewKey,
                      values: { ...youtubeProcessing, export_mp3_bitrate: event.target.value },
                    })
                  }
                />
              </label>
            </div>

            {selectedYoutubeProfile ? (
              <p className="profile-meta">
                {selectedYoutubeProfile.description} <code>{selectedYoutubeProfile.model_filename}</code>
              </p>
            ) : null}

            <div className="review-list">
              {reviewItems.map((item, index) => (
                <article key={item.video_id} className={`review-card ${item.selected ? 'review-card-active' : ''}`}>
                  <div className="review-card-header">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) =>
                          updateReviewItem(item.video_id, (current) => ({ ...current, selected: event.target.checked }))
                        }
                      />
                      <span>
                        {index + 1}. {item.title}
                      </span>
                    </label>
                    <span className={`badge ${item.duplicate_tracks.length ? 'badge-warn' : 'badge-ready'}`}>
                      {item.duplicate_tracks.length
                        ? `${item.duplicate_tracks.length} dup${item.duplicate_tracks.length === 1 ? '' : 's'}`
                        : 'new'}
                    </span>
                  </div>

                  <div className="review-grid">
                    <label className="field">
                      <span>Title</span>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(event) =>
                          updateReviewItem(item.video_id, (current) => ({ ...current, title: event.target.value }))
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Artist</span>
                      <input
                        type="text"
                        placeholder="Artist or uploader"
                        value={item.artist}
                        onChange={(event) =>
                          updateReviewItem(item.video_id, (current) => ({ ...current, artist: event.target.value }))
                        }
                      />
                    </label>
                  </div>

                  <div className="review-meta-row">
                    <span>
                      id <code>{item.video_id}</code>
                    </span>
                    <span>{item.duplicate_tracks.length ? 'Duplicate in library.' : 'No duplicate.'}</span>
                  </div>

                  {item.duplicate_tracks.length ? (
                    <div className="duplicate-panel">
                      <label className="field">
                        <span>Duplicate handling</span>
                        <select
                          value={item.duplicate_action}
                          onChange={(event) =>
                            updateReviewItem(item.video_id, (current) => ({
                              ...current,
                              duplicate_action: event.target.value as ReviewItemDraft['duplicate_action'],
                            }))
                          }
                        >
                          <option value="reuse-existing">Reuse existing track, queue new run</option>
                          <option value="create-new">Create separate track</option>
                        </select>
                      </label>

                      {item.duplicate_action === 'reuse-existing' ? (
                        <label className="field">
                          <span>Existing track</span>
                          <select
                            value={item.existing_track_id ?? ''}
                            onChange={(event) =>
                              updateReviewItem(item.video_id, (current) => ({
                                ...current,
                                existing_track_id: event.target.value || null,
                              }))
                            }
                          >
                            {item.duplicate_tracks.map((duplicateTrack) => (
                              <option key={duplicateTrack.id} value={duplicateTrack.id}>
                                {duplicateTrack.title}
                                {duplicateTrack.artist ? ` · ${duplicateTrack.artist}` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="import-footer">
              <span>
                {selectedReviewCount
                  ? `${selectedReviewCount} selected`
                  : 'Select at least one item.'}
              </span>
              <button
                type="button"
                className="button-primary"
                disabled={confirmingImport || selectedReviewCount === 0}
                onClick={() => void handleConfirmReview()}
              >
                {confirmingImport ? 'Queueing…' : 'Confirm'}
              </button>
            </div>
          </div>
        ) : null}

        <form className="import-form" onSubmit={handleLocalSubmit}>
          <p className="subsection-label">Local files</p>

          <label className="field field-file">
            <span>Audio or video files</span>
            <input
              type="file"
              accept="audio/*,video/*"
              multiple
              onChange={(event) => setLocalFiles(event.target.files)}
            />
          </label>

          <div className="processing-grid processing-grid-3">
            <label className="field">
              <span>Artist override</span>
              <input
                type="text"
                placeholder="Optional"
                value={localArtist}
                onChange={(event) => setLocalArtist(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Profile</span>
              <select
                value={localProcessing.profile_key}
                onChange={(event) =>
                  setLocalProcessingState({
                    sourceKey: localProcessingKey,
                    values: { ...localProcessing, profile_key: event.target.value },
                  })
                }
              >
                {profiles.map((profile) => (
                  <option key={profile.key} value={profile.key}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>MP3 bitrate</span>
              <input
                type="text"
                value={localProcessing.export_mp3_bitrate}
                onChange={(event) =>
                  setLocalProcessingState({
                    sourceKey: localProcessingKey,
                    values: { ...localProcessing, export_mp3_bitrate: event.target.value },
                  })
                }
              />
            </label>
          </div>

          {selectedLocalProfile ? (
            <p className="profile-meta">
              {selectedLocalProfile.description} <code>{selectedLocalProfile.model_filename}</code>
            </p>
          ) : null}

          <div className="import-footer">
            <span>
              {localFiles?.length
                ? `${localFiles.length} file${localFiles.length === 1 ? '' : 's'} ready`
                : 'Select one or more files.'}
            </span>
            <button type="submit" className="button-primary" disabled={importing || !localFiles?.length}>
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
