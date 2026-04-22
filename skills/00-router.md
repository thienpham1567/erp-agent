---
id: 00-router
trigger: meta
requires: []
---

# Skill Router

This file documents the decision tree the agent uses to pick a skill, and declares skill chains.

## Input classification
| User input pattern | Skill |
|---|---|
| Vague, multi-part, or unclear scope | `01-brainstorm.md` (ASK FIRST) |
| `EC <url> …` | `02-extract-context.md` |
| `PL` | `03-plan-feature.md` |
| `SD` | `04-scaffold-data.md` |
| `TC <url> …` | chain: 02 → 03 → 04 → 05 → 07 |
| `CS <url>` | `06-fetch-spec.md` |
| `VF` | `07-verify.md` |
| `RV` | `08-code-review.md` |
| `RF <path>` | `09-refactor-scan.md` |
| `BR` | `10-bootstrap-registry.md` |

## Chains
- **TC chain**: `02-extract-context → 03-plan-feature → 04-scaffold-data → 05-transform-code → 07-verify`
- **EC standalone**: `02-extract-context` only; no implementation.
- **Bug fix** (no trigger): if user says "fix bug X", load `03-plan-feature` first unless user says "skip plan"; after implementation, load `07-verify` and add a regression test only if user asked for TDD.

## Brainstorm gate
On vague or complex requests, the agent asks: "Brainstorm first? (yes/no)" (or the project-language equivalent). Only load `01-brainstorm.md` on `yes`.

## Hard gates (mirror `AGENTS.md`)
1. No code before a plan (unless "skip plan").
2. No hardcoded design tokens.
3. Grep `.agent/ui/components/` before building a new shared component.
4. Data layer before UI.
5. Tables use `DataTable` — never hand-roll `<table>` or grid `<div>` layouts.
6. Feature endpoints use `api.injectEndpoints()`; no new `createApi` calls.
