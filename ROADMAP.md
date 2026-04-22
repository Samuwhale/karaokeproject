# Roadmap

## Product Direction

KaraokeProject is a local-first stem separation tool.

Right now the product is for a solo creator who needs a clear local workflow for importing tracks, running separation, reviewing outcomes, and exporting usable results.

Karaoke is not the present product focus. It is a possible future expansion, not the current product identity.

## Principles

- stay local-first until the core workflow is genuinely strong
- keep the default flow legible from import to export
- optimize for one person using the tool directly on their own machine
- use clean seams around storage, jobs, and domain logic without introducing premature hosted abstractions
- improve outcomes without turning the product into a cluttered browser workstation
- avoid infrastructure work before the local product is stable enough to carry forward

## Phase 1. Tighten The Local Workflow

Focus:

- clearer import flow for local files and supported sources
- more legible queue and processing state
- stronger failure handling and recovery
- clearer export paths and final outputs
- lower ambiguity about what will happen next

Why this phase exists:

- the product already works locally
- the main gap is workflow clarity, not surface area
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

## Phase 3. Strengthen Review And Export Decisions

Focus:

- better compare flow across runs
- clearer keeper selection
- more useful notes and decision support around runs
- stronger confidence in final output selection
- cleaner export choices for the result the user actually wants

Why this phase exists:

- separation is only useful if the user can confidently choose the best result
- review and export should feel like the end of one clear task, not a loose collection of controls
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

## Related Docs

- [website-scaling-plan.md](/Users/samuel/Documents/Projects/karaokeproject/website-scaling-plan.md) covers a possible hosted shape for later, once the product is ready for it
