# Website Launch And Sustainability Plan

## Objective

StemStudio is currently a local-first stem separation and mixing tool. The online version should launch as a public app, but with strict capacity, quota, retention, billing, and abuse controls from day one.

The goal is not to expose the current local app directly to the internet. The goal is to turn it into a hosted control plane with separate processing workers.

The launch strategy:

1. Public website and public app launch together.
2. Anyone can sign up.
3. Processing requires free trial credits, paid credits, or a subscription allowance.
4. Queue capacity is capped globally and per user.
5. Files expire automatically.
6. YouTube import is disabled in the hosted product.
7. Processing capacity grows only after cost per processed minute is measured.

This is a public constrained launch: open signup, controlled usage.

## Product Positioning

The broad "AI vocal remover" market is crowded. StemStudio should launch with a sharper promise:

> Prepare custom backing tracks and stem mixes from audio you have the right to process.

The strongest early wedge is workflow quality, not raw separation alone:

- batch processing for setlists and repeated workflows
- keeping backing vocals while removing or lowering lead vocals
- turning specific instruments down instead of only creating instrumental/vocal pairs
- comparing separation runs and exporting the version the user actually wants
- account project history with clear retention
- simple mix/export controls after separation

The public site and first app screen should emphasize concrete outcomes:

- make an instrumental
- keep backing vocals
- lower drums, bass, guitar, or piano
- prepare rehearsal tracks
- process a batch of songs
- export mixes and stems

Avoid positioning the product as a way to obtain unauthorized backing tracks from copyrighted commercial music. The hosted product should be framed as account-based processing for user-owned or licensed audio.

## Public Launch Model

Do not gate access manually. Use hard product limits instead.

Required launch behavior:

- public signup
- account required before upload
- no anonymous processing
- no YouTube import
- upload-only source flow
- free trial credits for first use
- paid credits or subscription allowance for continued use
- clear processing cost before a job starts
- hard max upload size
- hard max audio duration
- hard per-user queue limit
- hard per-user concurrent job limit
- hard global queue limit
- short signed download URLs
- visible expiration date for every source and artifact
- automatic cleanup for expired objects
- no unlimited plan

If the system is at capacity, the product should stop accepting new processing jobs or clearly place users in a queue. It should not accept unlimited work and hope the worker catches up.

## First Public Version

The first public version should ship only the core loop:

1. User signs up.
2. User receives a small free trial credit balance.
3. User uploads an audio file they have rights to process.
4. The app shows estimated processed minutes or credits.
5. User starts processing.
6. Worker separates stems.
7. User adjusts the mix.
8. User exports or downloads.
9. Source files and artifacts expire after a visible retention period.

Everything outside that loop should wait unless it directly reduces risk, cost, or confusion.

Do not launch with:

- YouTube import
- public sharing pages
- searchable user libraries
- social features
- permanent storage
- unlimited processing
- team accounts
- API access
- enterprise features
- complex plan matrices
- multiple payment providers

## Current Repo Shape

The repo already has a workable split for a hosted version:

- React/Vite frontend in [frontend/package.json](./frontend/package.json)
- FastAPI backend in [backend/api/main.py](./backend/api/main.py)
- background worker loop in [backend/workers/runner.py](./backend/workers/runner.py)
- polling-based frontend state refresh in [frontend/src/hooks/useDashboardData.ts](./frontend/src/hooks/useDashboardData.ts)
- import flow in [backend/api/routes/imports.py](./backend/api/routes/imports.py)
- artifact route in [backend/api/routes/assets.py](./backend/api/routes/assets.py)
- SQLAlchemy models in [backend/db/models.py](./backend/db/models.py)

The hosted blockers are local-machine assumptions:

- runtime storage is filesystem-first in [backend/core/config.py](./backend/core/config.py)
- persistence is SQLite-backed
- uploads go through the API into local disk
- generated artifacts are stored as local filesystem paths
- artifact downloads are served from local files
- jobs are claimed by a worker connected to the same local database and filesystem
- there is no user ownership boundary
- there is no billing or usage ledger
- there is no durable quota, retention, or abuse-control model

The hosted version must replace shared local disk with object storage, replace SQLite with a network database, and add account ownership before public upload exists.

## Recommended Hosted Architecture

Use a control-plane plus processing-plane architecture.

Control plane:

- frontend: Cloudflare Pages
- auth: Supabase Auth
- metadata database: Supabase Postgres
- object storage: Cloudflare R2
- API: FastAPI on Fly.io, Render, Railway, or a small Hetzner VPS
- payments: Stripe Checkout, Stripe Billing Portal, and Stripe webhooks

Processing plane:

- one controlled worker at launch
- self-hosted worker if that keeps initial cost and debugging simple
- cloud GPU workers only after cost and demand are measured
- global job admission limits so public signup cannot create unbounded work

The API should never process audio in a web request. It should authenticate users, enforce limits, sign uploads/downloads, orchestrate jobs, record usage, and handle billing webhooks.

## Request Flow

1. The browser loads the frontend from Cloudflare Pages.
2. The user signs in through Supabase Auth.
3. The browser asks the API for an upload intent.
4. The API validates account status, quota, file size, file type, duration limit, and global capacity.
5. The API creates a track/import record and returns a presigned R2 upload URL.
6. The browser uploads the audio file directly to R2.
7. The browser calls the API to confirm the upload.
8. The API verifies the object and calculates estimated processing cost.
9. The user confirms the job and credit debit.
10. The API reserves credits and queues a run.
11. A worker claims the queued run from Postgres with a lease.
12. The worker downloads the source from R2, processes it locally, uploads stems and exports to R2, and updates run state.
13. The usage ledger records the final processed duration, storage created, retries, and credit adjustment if needed.
14. The frontend polls the API for status.
15. Previews and downloads use short-lived signed R2 URLs.
16. Retention cleanup deletes expired source files and artifacts.

Credit reservation matters. Without it, users can start work they cannot pay for, and failed or retried jobs become hard to account for.

## Hosting Decisions

### Frontend

Use Cloudflare Pages for the public website and app shell.

Reasons:

- Vite deployment is directly supported.
- Static asset requests are free and unlimited on Cloudflare Pages.
- It cleanly separates frontend delivery from the API and processing workers.

Build settings:

- build command: `npm run build --workspace frontend`
- output directory: `frontend/dist`

Avoid Pages Functions for core app logic at launch. Keep orchestration in FastAPI so auth, quota, billing, job state, and artifact access are not split across runtimes too early.

### API

Run FastAPI on a small app host.

Good first options:

- Fly.io for easy deployment and pay-as-you-go Machines
- Render or Railway for simpler app hosting
- Hetzner if manual VPS management is acceptable

The API owns:

- auth verification
- account and plan lookup
- quota checks
- global capacity checks
- upload and download signing
- metadata reads and writes
- job queue orchestration
- billing webhook handling
- usage ledger writes
- admin controls for pausing processing

The API should be horizontally replaceable, but it does not need complex multi-region deployment at launch.

### Database And Auth

Use Supabase Auth and Supabase Postgres for the hosted launch.

Reasons:

- Auth and Postgres are integrated.
- SQLAlchemy can target Postgres without replacing the backend stack.
- It avoids building account signup, email verification, password reset, sessions, and account recovery from scratch.

Important constraints:

- Supabase subscriptions are organization-level.
- Each project is a dedicated Supabase instance.
- Paid organizations include compute credits, but extra projects and add-ons can increase monthly cost.
- Supabase is rolling out tax collection across jurisdictions from May 1, 2026 through June 30, 2026, so invoices may include tax depending on billing address.
- Service-role credentials must stay server-side only.

Use Postgres as the system of record for metadata, quotas, usage ledger entries, job state, billing state, and artifact object keys. Do not store durable state only in worker memory, local JSON files, or local paths.

### Object Storage

Use Cloudflare R2.

Reasons:

- R2 supports S3-compatible clients.
- R2 supports presigned URLs for direct browser uploads and time-limited downloads.
- R2 direct internet egress is free.
- Storage cost is low enough for short-retention audio artifacts.

Planning numbers from current R2 pricing:

- Standard storage free tier: 10 GB-month per month
- Standard storage: `$0.015 / GB-month`
- Standard Class A operations: `$4.50 / million requests`
- Standard Class B operations: `$0.36 / million requests`
- direct internet egress: free

R2 is not "free storage." Uploads, reads, object checks, and storage beyond the free tier still matter. The product should minimize unnecessary reads, avoid listing large buckets in request paths, and delete expired artifacts.

Use R2 Standard at launch. Infrequent Access has retrieval fees and minimum storage duration behavior that do not fit short-retention app artifacts.

### Worker

Use one controlled worker at launch.

The worker should be stateless with respect to durable files:

- claim a run from Postgres
- download source audio from R2
- write temporary files to local disk
- run separation/export work
- upload generated artifacts to R2
- update run, artifact, metrics, and usage records
- delete temporary local files

Move to cloud GPU workers only after measuring:

- separation speed relative to realtime
- failure rate
- average output size
- cold-start overhead
- cost per processed minute
- queue wait time users tolerate
- payment conversion

Runpod serverless is a reasonable first cloud GPU candidate because it offers pay-per-second GPU workers and lists 4090-class serverless pricing. Modal, Vast.ai, Replicate, and dedicated rented GPUs are alternatives. Marketplace GPU providers can be cheaper but add availability and reliability variance.

## Required Code Changes

### User Ownership

Add user ownership before public uploads.

Required changes:

- add `user_id` to tracks, runs, artifacts, import drafts, export bundles, usage ledger entries, credit balances, and billing records
- require an authenticated user on every non-public API route
- filter every query by authenticated user
- reject cross-user IDs even when the ID exists
- attach the Supabase user ID to new records
- keep service-role credentials out of the browser

Ownership must be enforced in backend queries, not only hidden in the frontend.

### Database Migration

Replace SQLite-only setup with a Postgres-ready migration path.

Required changes:

- introduce Alembic migrations
- stop relying on `Base.metadata.create_all` for hosted schema management
- remove SQLite-specific migration behavior from hosted paths
- ensure JSON, datetime, foreign key, and cascade behavior work on Postgres
- add indexes for `user_id`, `status`, `created_at`, `track_id`, `run_id`, and lease fields

Local development can remain simple, but hosted schema management should be explicit and repeatable.

### Storage Interface

Introduce a small storage interface with two implementations:

- local disk for local development
- R2 for hosted deployment

The interface should cover:

- create upload intent
- confirm uploaded source
- open or download object for worker input
- upload generated artifact
- create signed download URL
- delete object
- apply retention policy

The database should store object keys, byte sizes, checksums, formats, retention timestamps, and metadata. It should not store durable absolute filesystem paths for hosted artifacts.

### Upload Flow

Move hosted uploads away from API multipart file handling.

Hosted flow:

- API validates filename, size, content type, user quota, plan limits, and account status
- API creates a source object key
- API returns a presigned R2 PUT URL
- browser uploads directly to R2
- browser calls API to confirm upload
- API verifies object metadata and allows the user to start processing

This avoids routing large files through the API host and keeps API memory and bandwidth needs predictable.

### Artifact Flow

Replace direct local file responses with signed object URLs.

Hosted route behavior:

- verify the artifact belongs to the authenticated user
- verify the artifact has not expired
- generate a short-lived R2 GET URL
- return the signed URL or redirect to it
- write a download/read event if needed for cost tracking

The current local route in [backend/api/routes/assets.py](./backend/api/routes/assets.py) should become an implementation detail behind storage-specific behavior.

### Job Claiming

Make job claiming safe for networked workers.

Add fields:

- `claimed_by`
- `claimed_at`
- `lease_expires_at`
- `heartbeat_at`
- `attempt_count`
- `max_attempts`

Claiming should be atomic. A worker should only process a run if it owns an unexpired lease. If a worker dies, the recovery path should retry or fail the job after the lease expires.

The worker should update `heartbeat_at` while processing long jobs. The API should show queue and processing status clearly without implying exact completion times when they are not known.

### Credits And Usage Ledger

Add credits and an append-only usage ledger before public launch.

Credit records should support:

- free trial grants
- subscription monthly grants
- paid credit-pack grants
- processing reservations
- final debits
- refunds or manual adjustments
- expiration if credit expiration is part of the product policy

Ledger entries should record:

- user ID
- source track ID
- run ID
- event type
- processed audio seconds
- model or pipeline key
- storage bytes created
- storage bytes deleted
- credit grant, reservation, debit, release, or adjustment
- billing period
- idempotency key

Do not derive billing only from mutable run rows. A ledger makes refunds, retries, support, plan changes, abuse review, and cost analysis much easier.

### Stripe Integration

Use Stripe Checkout for the first public launch.

Required pieces:

- products for credit packs
- product for the first subscription plan
- Stripe Checkout session creation
- Stripe webhook endpoint
- idempotent webhook handling
- local credit grant records
- Stripe customer ID stored on the user account
- billing portal link
- admin-visible payment and credit history

Keep the first payment model simple:

1. Stripe Checkout sells a subscription or credit pack.
2. Stripe webhooks grant credits in the local ledger.
3. Processing reserves and debits credits locally.
4. Stripe Billing Portal handles subscription management.

Do not start with complex metered invoices unless there is a strong reason. Local credits are easier to explain, easier to cap, and safer for a public launch.

### Limits And Retention

Add hard limits before launch:

- max upload size
- max audio duration
- max queued jobs per user
- max concurrent jobs per user
- max retained storage per user
- global queued jobs
- global active jobs
- free-trial retention period
- paid retention period
- retry limits
- accepted file types

Users should see what will happen before they upload or process a file. Retention should be visible near uploads, runs, and downloads.

Recommended launch limits:

- free trial: enough minutes for one to three useful songs
- free trial: short retention
- free trial: lower queue priority
- paid users: larger files, longer retention, higher queue priority
- no unlimited processing
- no permanent storage unless it is explicitly priced

### Capacity Controls

Public signup requires admission control.

Add:

- global queue cap
- global active run cap
- per-user queue cap
- per-user active run cap
- admin pause switch for new jobs
- admin pause switch for uploads
- visible "processing is busy" state
- queue position or conservative queue messaging
- daily spend cap for cloud GPU workers

The product should degrade by slowing or pausing new processing, not by failing jobs already accepted.

### Observability

Track operational metrics from the first public launch:

- signups
- activated users
- uploads started
- uploads completed
- uploads abandoned
- source audio minutes
- processed audio minutes
- worker wall-clock minutes
- processing speed relative to realtime
- queue wait time
- job failure rate
- retry count
- generated artifact bytes per input minute
- retained GB-days
- signed download count
- free-to-paid conversion
- credit-pack purchases
- subscription starts
- cancellations
- support contacts
- refund rate

These metrics should answer one question: can one processed minute be sold for more than it costs to produce and support?

### Model And Dependency Licensing

Before charging users, verify the license status of the separation package, model weights, and any bundled model download behavior.

The Python package dependency is not the only issue. Pretrained model weights may have separate licenses, attribution requirements, or unclear commercial-use terms. Keep a short internal inventory:

- package name and version
- model name
- model source
- model license
- commercial-use status
- attribution requirement
- redistribution or download behavior

Do not assume every model available through a separation tool is safe for a public paid service.

## YouTube Import Policy

Disable YouTube import for the public hosted version.

The repo currently supports YouTube import through [backend/adapters/youtube.py](./backend/adapters/youtube.py). That is acceptable for a local personal tool, but it is a major public-product risk.

YouTube API policy prohibits separating, isolating, or modifying audio or video components of YouTube audiovisual content made available through YouTube API Services. A public feature that turns YouTube URLs into separated stems is not a safe launch surface.

The hosted product should start with user uploads only and clear language that users must own or have permission to process uploaded audio.

## Legal And Trust Requirements

This is not legal advice. It is a risk checklist for a public service that stores and processes user-uploaded audio.

Before public launch:

- Terms of Service
- Privacy Policy
- copyright/takedown contact
- acceptable use language for uploaded audio
- clear retention policy
- clear deletion behavior
- statement that users must have rights to uploaded material
- account deletion flow or support process
- data export/deletion support for privacy requests
- abuse reporting contact
- monitored support email
- refund policy

If operating in or serving the United States, evaluate DMCA designated agent registration. The U.S. Copyright Office states that a service provider must make designated agent contact information public on its website and provide the same information to the Copyright Office.

If serving EU users, design for GDPR expectations:

- collect only needed personal data
- explain processing purposes
- define retention periods
- support erasure requests where legally required
- avoid using user uploads for training or product improvement unless there is explicit opt-in

Early risk controls:

- no public sharing pages
- no searchable public library
- no YouTube import
- no "download stems for any song" language
- no model training on uploaded files
- short default retention
- clear delete action

## Monetization Model

Use free trial credits, paid credit packs, and one subscription plan at launch.

Do not offer unlimited processing. Costs scale with:

- audio duration
- separation type count
- selected model quality
- worker wall-clock time
- failed jobs and retries
- retained storage
- previews and downloads
- support burden

Bill by processed audio minutes, not by track count. A three-minute song and a two-hour set should not consume the same allowance.

Recommended launch pricing structure:

### Free Trial

- enough credits for one to three useful songs
- short maximum file duration
- short retention
- lower queue priority
- no payment required
- one free trial per account, with abuse controls

### Credit Packs

- prepaid extra processing minutes
- minimum purchase high enough that payment fees do not dominate
- clear expiration policy if credits expire
- usable across supported separation workflows

### Creator Subscription

- monthly subscription
- included monthly credits
- moderate file duration limit
- moderate retention
- higher queue priority than free trial
- unused monthly credits should either expire or roll over only with a clearly priced cap

Add Pro later only when real usage shows what heavier users need. Do not invent a broad plan matrix before usage data exists.

Avoid tiny one-off charges. Stripe's U.S. pricing currently lists `2.9% + 30 cents` for standard online card processing, so small payments lose too much margin to fixed fees.

## Pricing Direction

Competitors validate minute-based and priority-based pricing:

- LALAL.AI uses free, Lite, and Pro tiers with fast-minute allowances, relaxed queue behavior, top-ups, and minute deduction based on file length times separation type count.
- Moises offers a free monthly song allowance and paid tiers with longer or broader upload limits.

StemStudio should not compete only on price. The defensible early value is workflow clarity:

- upload many songs
- choose stems
- keep backing vocals
- adjust levels
- export exactly the mix needed
- preserve an account project library for a limited time

Initial pricing should be validated against real processing cost. A reasonable launch shape:

- Free trial: enough minutes to create one useful output
- Credit packs: prepaid minutes for occasional users
- Creator: monthly included credits for repeat users

Do not publish "unlimited" until there is enough data to set fair-use limits, queue behavior, abuse controls, and gross margin with confidence.

## Cost Model

Track unit economics from the first public launch.

Core formula:

```text
gross margin per processed minute =
  revenue per processed minute
  - worker cost per processed minute
  - storage cost per processed minute
  - operation and transfer costs
  - payment fees
  - failed job and retry allowance
  - support and refund allowance
```

Processing cost estimate:

```text
worker cost per processed minute =
  worker cost per wall-clock minute
  x wall-clock minutes per audio minute
  x retry/failure multiplier
```

Storage estimate:

```text
storage cost =
  retained GB-days
  x provider GB-month price
  / 30
```

Early hosted spend should mostly be:

- domain
- Cloudflare Pages
- R2 storage and operations beyond free tier
- Supabase paid plan or overages once needed
- API host
- GPU or CPU worker time
- Stripe fees on successful payments
- support tooling if needed

Do not optimize frontend hosting first. The real cost centers are processing, storage retention, failed jobs, and support.

## Operational Rules

Launch with strict defaults:

- public signup
- email verification
- no anonymous processing
- no public file URLs
- upload-only source flow
- short signed URL expirations
- short free-trial retention
- per-user queue limits
- per-user storage limits
- per-user daily or monthly processing limits
- global queue and active-job limits
- upload validation before storage
- credit reservation before processing
- idempotent billing webhooks
- idempotent job creation
- automatic cleanup for expired objects
- admin pause switch for processing

Support expectations should be built into the product:

- show whether a job is queued, processing, complete, failed, or expired
- show what a retry will cost before retrying
- show when files will be deleted
- make deletion obvious
- make remaining credits and included minutes visible
- avoid vague promises like "instant" unless the plan really guarantees priority processing

## Public Launch Plan

### Phase 1. Launch-Ready Foundation

Purpose:

- make the local-first app safe for public accounts and hosted files

Scope:

- Supabase Auth
- Postgres metadata
- user ownership on all records
- Alembic migrations
- R2 source and artifact storage
- signed direct uploads
- signed downloads
- worker leases
- usage ledger
- credit balances
- hard limits
- retention cleanup
- disabled hosted YouTube import

Success criteria:

- users cannot access each other's tracks, runs, or artifacts
- large files do not pass through the API host
- jobs can be retried or recovered safely
- expired files are deleted
- every processed minute is recorded in the ledger

### Phase 2. Public Paid Launch

Purpose:

- open signup while keeping capacity and spend bounded

Scope:

- public signup
- free trial credits
- Stripe Checkout for credit packs and one subscription
- Stripe webhooks
- billing portal
- visible quota and usage
- global job caps
- admin pause controls
- Terms, Privacy Policy, copyright/takedown contact, refund policy
- production support email

Success criteria:

- users can complete the core loop without help
- processing spend is capped
- paid conversion is measurable
- failed jobs and refunds are manageable
- queue behavior is understandable

### Phase 3. Capacity Growth

Purpose:

- scale processing only where demand and margin justify it

Scope:

- add cloud GPU worker option
- add worker pool coordination
- tune queue priorities
- tune credit pricing
- add larger credit packs
- add higher-tier plan if real users need it
- improve observability dashboards

Success criteria:

- cost per processed minute is predictable
- gross margin stays positive
- queue time improves without uncontrolled spend
- support load does not grow faster than revenue

### Phase 4. Product Expansion

Purpose:

- add features after the public core loop proves sustainable

Possible additions:

- Pro plan
- longer retention add-on
- larger file limits
- more separation workflows
- better batch controls
- saved mix presets
- export templates
- team features
- API access

Do not add these until launch metrics show which users are paying and why.

## Decision Summary

The best public launch path is:

- launch the public app with hard usage limits
- require accounts before upload
- keep the hosted product upload-only
- disable YouTube import
- migrate to Supabase Auth and Postgres before public uploads
- use R2 for source files, stems, previews, and exports
- use signed direct uploads and signed downloads
- keep FastAPI as the API
- keep workers separate from the API
- add worker leases before multiple workers
- add credits and a usage ledger before charging users
- use Stripe Checkout and webhooks from day one
- offer free trial credits, credit packs, and one subscription
- bill by processed audio minutes
- use short retention to control storage cost and legal risk
- enforce global and per-user capacity limits
- grow processing capacity only after cost per processed minute is measured

## Sources

- Cloudflare Pages pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Cloudflare Vite deployment: https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Supabase pricing: https://supabase.com/pricing
- Supabase billing FAQ: https://supabase.com/docs/guides/platform/billing-faq
- Fly.io pricing: https://fly.io/docs/about/pricing/
- Runpod serverless pricing: https://docs.runpod.io/serverless/pricing
- Stripe pricing: https://stripe.com/us/pricing
- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Stripe subscriptions: https://docs.stripe.com/payments/subscriptions
- Stripe usage-based billing: https://docs.stripe.com/billing/subscriptions/usage-based
- YouTube API Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- U.S. Copyright Office DMCA designated agent directory: https://www.copyright.gov/dmca-directory/
- European Commission data protection overview: https://commission.europa.eu/law/law-topic/data-protection/data-protection-explained_en
- LALAL.AI pricing: https://www.lalal.ai/pricing/
- Moises upload limits: https://help.moises.ai/hc/en-us/articles/360010972039-How-many-songs-can-I-upload
- audio-separator package: https://pypi.org/project/audio-separator/
