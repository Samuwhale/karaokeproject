# Website Scaling Plan

## Objective

This is currently a deferred task, but eventually we want to host this online publically.

This document is about deployment shape, cost, and infrastructure boundaries. It is not the product roadmap.

## What This Project Needs From Hosting

The hosted version does not need a heavy SaaS stack on day one. It needs a cheap architecture that preserves the current product loop:

1. import a source
2. process it asynchronously
3. review the result
4. keep the best run
5. export usable outputs

The expensive parts are not the website or metadata. The expensive parts are:

- audio processing compute
- storage for uploaded media and generated artifacts
- repeated transfer of large files

## Cheapest Serious Hosting Setup

This should be the default hosted shape:

- frontend on Cloudflare Pages
- FastAPI kept as the application API
- Supabase Auth and Postgres for users and metadata
- Cloudflare R2 for source uploads and generated artifacts
- one small API host on Hetzner or Fly.io
- one worker, initially self-hosted on your own machine

Why this is the default:

- it keeps steady-state costs low
- it preserves the current React and FastAPI investment
- it separates web traffic from heavy processing
- it avoids paying cloud compute costs too early
- it stays legible for humans and agents

## Why This Setup Fits The Repo

The current repo already has the right broad shape for this approach:

- React and Vite frontend in [frontend/package.json](/Users/samuel/Documents/Projects/karaokeproject/frontend/package.json)
- FastAPI backend in [backend/api/main.py](/Users/samuel/Documents/Projects/karaokeproject/backend/api/main.py)
- async worker loop in [backend/workers/runner.py](/Users/samuel/Documents/Projects/karaokeproject/backend/workers/runner.py)
- local file and YouTube import flows in [backend/api/routes/imports.py](/Users/samuel/Documents/Projects/karaokeproject/backend/api/routes/imports.py)
- polling-based frontend state refresh in [frontend/src/hooks/useDashboardData.ts](/Users/samuel/Documents/Projects/karaokeproject/frontend/src/hooks/useDashboardData.ts)

What is wrong for hosting is not the product shape. It is the current infrastructure assumption that the API, worker, database, uploads, and artifacts all live on one local machine and one filesystem.

## Recommended Hosted Architecture

Split the system into two planes:

- control plane for frontend delivery, auth, metadata, and job orchestration
- processing plane for heavy audio jobs

Recommended request flow:

1. the browser loads the frontend from Cloudflare Pages
2. the user signs in through Supabase Auth
3. the browser uploads media to object storage using signed upload URLs
4. the API records tracks and runs in Postgres
5. the API marks runs as queued
6. the worker claims queued runs, downloads inputs, processes locally, uploads outputs, and updates run state
7. the frontend polls for status and renders results
8. downloads are served through signed storage URLs instead of local file paths

## Hosting Options

### Option 1. Cheapest serious setup

- frontend: Cloudflare Pages
- auth and database: Supabase
- object storage: Cloudflare R2
- API: Hetzner or Fly.io
- worker: your own machine

Best fit when:

- traffic is still low
- processing volume is moderate
- you want the smallest possible monthly bill
- you are willing to keep the worker on hardware you control

### Option 2. Lower-ops setup

- frontend: Cloudflare Pages
- auth and database: Supabase
- object storage: Cloudflare R2
- API: Fly.io or Railway
- worker: cloud-hosted on the same platform or another small compute host

Why you might choose it:

- simpler operations
- easier deployment flow
- less manual machine management

Why it is not the default:

- usually more expensive for always-on compute
- less attractive if the worker needs room to grow

### Option 3. Burst processing later

- same control plane as Option 1
- worker jobs burst to a platform such as Modal when needed

Use this only if:

- usage becomes spiky
- self-hosted processing becomes a bottleneck
- paying for occasional burst compute is cheaper than keeping larger hardware online

## Cost Guidance

These are planning-level estimates, not guaranteed bills.

### Early monthly expectation

If the worker runs on your own machine:

- likely around domain cost plus roughly $4 to $10 per month in hosted spend

If the worker also moves to the cloud:

- likely around $10 to $40 per month before meaningful usage growth

### Cost priorities

Do not over-optimize frontend hosting cost first. The real cost centers are:

- processing time
- storage growth
- download and upload volume

### Practical cost rule

The cheapest hosted alpha is usually:

- cheap static hosting
- cheap hosted metadata
- cheap object storage
- self-hosted processing

That gets the product online without committing to cloud compute costs before demand is proven.

## What Must Change Before This Works

The current repo is still local-first in several important ways:

- runtime storage is filesystem-first in [backend/core/config.py](/Users/samuel/Documents/Projects/karaokeproject/backend/core/config.py)
- persistence is SQLite-backed
- uploads are currently handled through local API upload flow
- artifacts are currently served from local paths

The hosted migration therefore needs to do four things:

- move durable files to object storage
- move hosted metadata to Postgres
- separate orchestration from processing
- preserve the current task flow while doing that

## YouTube Caveat

The repo already supports YouTube import through `yt-dlp` in [backend/adapters/youtube.py](/Users/samuel/Documents/Projects/karaokeproject/backend/adapters/youtube.py).

For a hosted product, this is not just a technical feature. It is a policy and compliance decision. The cheapest hosting plan should assume:

- uploads are required
- YouTube support is desirable
- YouTube support may need limited rollout, extra rules, or temporary exclusion before public launch

## Non-Goals For The First Hosted Version

Do not optimize early for:

- enterprise multi-tenancy
- aggressive autoscaling
- billing-first infrastructure
- realtime collaboration
- a browser-based editing suite

The first hosted version only needs to make the current product loop work online clearly and cheaply.

## Decision Summary

Use `website-scaling-plan.md` as the hosting guide for the cheapest serious online setup:

- Cloudflare Pages for frontend
- Supabase for auth and metadata
- R2 for file storage
- small API host
- self-hosted worker first

That is the best low-cost bridge between the current local app and a real hosted alpha.
