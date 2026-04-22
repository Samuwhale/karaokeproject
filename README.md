# KaraokeProject

KaraokeProject is a local-first stem separation tool.

Today it is a personal app for importing audio, running stem separation locally, reviewing outputs, comparing reruns, and exporting usable results. Karaoke generation is the clearest first use case, but the product direction is broader than karaoke alone: it is moving toward a more general stem workflow for creators who need clean vocals, instrumentals, and reviewable export results.

## What It Does Today

- import local files or YouTube sources
- run asynchronous stem separation locally
- review track metadata and run history
- compare outputs across reruns
- export instrumental, vocal, and packaged results

## Who It Is For

The near-term product is aimed at two overlapping groups:

- solo creators who want a fast, legible workflow with minimal setup
- power users who want better reruns, comparison, and output control without turning the app into a cluttered workstation

The UX rule is simple: keep the default flow clear and low-friction, then expose deeper control where it materially improves results.

## Product Positioning

This project should be understood as a **stem separation tool with a karaoke wedge**.

That means:

- karaoke is the easiest way to explain the product's immediate value
- stem separation is the broader category the product is growing into
- the local app is the incubation environment, not the final product boundary

## Current Status

Right now the product is intentionally local-first:

- processing runs on your machine
- files live in local project-managed storage
- the current app is optimized for rapid iteration and maintainability

That local-first shape is deliberate. It keeps the workflow easy to reason about while the product direction is still being refined.

## Roadmap Direction

The planned path is:

1. tighten the current local workflow around reliability, clarity, and clean exports
2. improve separation quality, rerun control, and comparison tooling
3. reshape the system for a free hosted alpha
4. expand from a karaoke wedge into a broader online stem tool

The target is not a rushed SaaS rewrite. The target is a staged transition from a strong local product into a hosted web product with a clear architecture and a clear user story.

## Key Docs

- [ROADMAP.md](/Users/samuel/Documents/Projects/karaokeproject/ROADMAP.md) is the product roadmap
- [website-scaling-plan.md](/Users/samuel/Documents/Projects/karaokeproject/website-scaling-plan.md) covers the cheapest serious hosted setup
