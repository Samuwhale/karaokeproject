# Local Karaoke Prep Pipeline

Product boundary and phased roadmap for the local web app in this repository.

## Product identity

This project is a local-first karaoke prep pipeline for a single power user. It exists to ingest tracks, run repeatable vocal-separation jobs, review outputs, and export assets from one machine with a clean local workflow.

The app should stay narrow. It is not meant to become a streaming product, a multi-user SaaS, or a live karaoke performance tool.

## Primary user

The product optimizes for one person managing a personal karaoke prep workflow. That means it should favor:

- fast local iteration
- clear run history
- repeatable outputs
- direct control over files and settings
- maintainable code over onboarding polish

## Product boundary

The active product surface is:

- local file import
- YouTube video and playlist resolve, review, and confirm flow
- duplicate-aware import handling
- repeatable per-track processing runs
- instrumental and vocal preview
- WAV, MP3, metadata, and ZIP export
- local diagnostics and settings

The center of the product is preparation work: reliable ingestion, processing, review, and export on one machine.

## Non-goals

- live karaoke playback features
- singer-facing show controls
- collaboration or multi-user workflow
- cloud processing or hosted infrastructure
- broader consumer downloader positioning

## Stable product decisions

- Keep the app local-only.
- Keep the user model to one primary operator.
- Keep local files and YouTube as core ingestion paths.
- Keep ingestion, processing, review, and export as the center of the product.
- Keep the app easy to maintain locally and easy for LLMs or agents to work on.

## Roadmap

### Phase 1: Current baseline

Ship and stabilize the existing prep pipeline:

- local and YouTube ingestion
- review-before-import flow
- duplicate-aware reuse
- repeatable runs with stored processing config
- preview of results
- diagnostics and settings
- export packaging

### Phase 2: Quality controls

Focus on run comparison and result review:

- compare multiple runs of the same track more easily
- inspect artifacts and processing choices side by side
- make it easier to decide which run is the keeper
- improve confidence in output quality without expanding into editing tools

### Phase 3: Library workflow

Improve library management for a growing local collection:

- better track organization
- stronger duplicate handling and reuse flow
- easier browsing of rerun history
- clearer library-level workflows
