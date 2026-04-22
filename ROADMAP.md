# Roadmap

## Product Direction

KaraokeProject is a local-first stem separation tool.

Right now the product is for a solo creator who needs a clear local workflow for importing tracks, running separation, reviewing outcomes, shaping the final stem balance, and exporting usable results.

Karaoke is not the present product focus. It is a possible future expansion, not the current product identity.

The near-term product should be understood as a stem workflow tool:

1. import a track
2. run separation
3. compare outcomes
4. choose the keeper
5. adjust the final stem balance
6. export the result

## Principles

- stay local-first until the core workflow is genuinely strong
- keep the default flow legible from import to export
- optimize for one person using the tool directly on their own machine
- use clean seams around storage, jobs, and domain logic without introducing premature hosted abstractions
- make local storage usage visible and manageable instead of opaque
- improve outcomes without turning the product into a cluttered browser workstation
- deepen the finish of the core loop before expanding into adjacent product surfaces
- avoid infrastructure work before the local product is stable enough to carry forward

## Phase 1. Tighten The Local Workflow

Focus:

- clearer import flow for local files and supported sources
- clearer control over where local files are stored
- more legible queue and processing state
- stronger failure handling and recovery
- clearer storage usage, retention, and cleanup controls
- clearer export paths and final outputs
- lower ambiguity about what will happen next

Why this phase exists:

- the product already works locally
- the main gap is workflow clarity, trust, and file lifecycle management, not surface area
- future work should inherit a stronger local loop instead of compensating for a confusing one

## Phase 2. Improve Separation Quality

Focus:

- better presets and model choices
- clearer rerun intent when quality is not good enough
- stronger quality-first defaults
- better control over outcome without adding unnecessary UI complexity

Why this phase exists:

- the next meaningful product gain is better separation quality
- stronger output quality matters more than broadening the product too early
- the local tool should become trustworthy before it becomes wider

## Phase 3. Review, Mix, And Export

Focus:

- better compare flow across runs
- clearer keeper selection
- clearer transition from chosen run to final output shaping
- simple per-stem mixing controls for the chosen result
- stronger confidence in the final balance before export
- cleaner export choices for the result the user actually wants

Why this phase exists:

- separation is only useful if the user can confidently choose the best result
- the product should support light output shaping without turning into a browser DAW
- review, mixing, and export should feel like the end of one clear task, not a loose collection of controls
- this deepens the product without pushing it toward workstation sprawl

## Future Direction

Later, if the local product proves clear and worthwhile, the project can expand into adjacent directions such as:

- a hosted web version for online users
- karaoke-oriented workflows
- video generation tied to separated outputs
- text-assisted outputs and related workflows

These are intentionally future-facing directions, not current roadmap commitments. Current work should stay clean enough to support them later without pulling online product scope into the near-term plan.

## Boundaries

Do not expand early into:

- hosted accounts, billing, or remote job orchestration
- browser-based audio workstation behavior
- infrastructure-heavy architecture before the local product earns it
- broad creative tooling that weakens the stem separation core

Mixing support is in scope when it stays narrowly focused on final output shaping, such as:

- per-stem volume adjustment
- mute and solo controls
- previewing the resulting balance
- exporting the rendered mix

Do not treat this as a reason to add:

- timeline editing
- arrangement tools
- plugin-style effects chains
- automation lanes
- general DAW routing

Local file management is also in scope for the near-term product when it supports the local-first workflow clearly, such as:

- choosing or understanding the storage location used by the app
- seeing which imports, runs, and exports are using disk space
- deleting old runs, artifacts, and exports with clear consequences
- keeping keeper results while cleaning up disposable intermediates

Do not treat this as a reason to add a general-purpose file browser inside the app.

## Related Docs

- [website-scaling-plan.md](/Users/samuel/Documents/Projects/karaokeproject/website-scaling-plan.md) covers a possible hosted shape for later, once the product is ready for it
