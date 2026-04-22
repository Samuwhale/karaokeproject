# Roadmap

## Product Direction

KaraokeProject is a local-first stem workflow tool.

Right now the product is for a solo creator who needs a clear local workflow for importing tracks, running separation, reviewing outcomes, shaping the final stem balance, and exporting usable results.

Karaoke is not the present product focus. It remains a possible future expansion, not the current product identity.

The near-term product should be understood as a stem workflow tool:

1. import a track
2. choose how to run separation
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

## Phase 1. Better Models

Focus:

- stronger built-in presets with clearer quality and speed tradeoffs
- a hybrid model strategy with curated presets by default and direct model choice when needed
- clearer rerun intent when the current output is not good enough
- better defaults so most tracks start in the right place without extra setup
- clearer language around what each model or preset is good at

Why this phase exists:

- the next meaningful gain is better output quality
- better model choice matters more than adding broad new product surface area
- the default flow should stay simple while still giving advanced users sharper control

## Phase 2. Broader Stem Support

Focus:

- move beyond a vocal and instrumental mental model
- preserve and present whatever stems a selected model produces
- improve naming and review of multi-stem outputs so the result is easy to understand at a glance
- make model-driven stem sets feel like a first-class workflow, not an edge case
- keep export and review flows legible even when different runs produce different stem layouts

Why this phase exists:

- better models are more valuable when the product can handle their full output cleanly
- the product should adapt to model capabilities instead of forcing every run into a fixed stem shape
- broader stem support deepens the core separation workflow without pushing the app toward DAW complexity

## Phase 3. Per-Stem Mixing

Focus:

- individual volume control for every available stem in the chosen run
- mute and solo controls across all available stems
- clear preview of the current stem balance before export
- rendered mix export based on the chosen per-stem balance
- a narrow final-shaping workflow that stays easy to understand and maintain

Why this phase exists:

- model-driven stem output is only useful if the user can shape the final balance clearly
- mixing should apply across all available stems, not only vocals and instrumental
- the product should support final output shaping without turning into a browser DAW

## Future Direction

Later, if the local product proves clear and worthwhile, the project can expand into adjacent directions such as:

- a hosted web version for online users
- karaoke-oriented workflows
- video generation tied to separated outputs
- text-assisted outputs and related workflows

These are intentionally future-facing directions, not current roadmap commitments. Current work should stay clean enough to support them later without pulling online product scope into the near-term plan.

## Boundaries

Near-term work is in scope when it strengthens the stem workflow clearly, such as:

- stronger model choice with clear default presets and optional advanced control
- preserving and presenting model-driven stem sets
- per-stem volume adjustment
- mute and solo controls
- previewing the resulting balance
- exporting the rendered mix

Do not expand early into:

- hosted accounts, billing, or remote job orchestration
- browser-based audio workstation behavior
- infrastructure-heavy architecture before the local product earns it
- broad creative tooling that weakens the stem separation core
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
