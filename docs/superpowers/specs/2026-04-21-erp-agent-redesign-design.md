---
title: erp-agent Redesign — Framework + Profile Architecture
date: 2026-04-21
status: approved
---

# erp-agent Redesign — Framework + Profile Architecture

## 1. Problem

The current `erp-agent` repo contains one monolithic `design-to-code` skill (`SKILL.md` + `workflow.md` ≈ 480 lines) plus two MCP clients. It has three limitations:

1. **Single-project coupled**: paths and conventions are hardcoded to one ERP codebase; cannot be dropped into another project without manual surgery.
2. **Information overload for the LLM**: `workflow.md` mixes 6 concerns (workflow steps, MCP scripts, extraction convention, a ~200-line component registry, page patterns, checklists). The agent must parse all of it for every task, reducing precision.
3. **No governance**: no brainstorm gate, no plan gate, no verification gate, no opt-in controls — all execution is ad-hoc under the `design-to-code` skill.

This redesign converts `erp-agent` into a **reusable framework** that any Next.js + Tailwind + Shadcn ERP project can consume by pointing at a small per-project rules folder.

## 2. Goals & Non-Goals

### Goals
- **Reusable across projects** — one framework install, many consumer projects.
- **LLM precision** — load only what the current task needs; each file has one concern.
- **Opt-in governance** — brainstorming and TDD are optional; hard gates exist where safety matters (plan before code, tokens before UI).
- **Antigravity-compatible** — no reliance on Claude Code's auto-skill trigger; `AGENTS.md` is an explicit router.
- **Preserve working code** — existing MCP clients (`figma_client.js`, `confluence_client.js`) move unchanged into the framework `lib/`.

### Non-Goals
- Multi-agent BMAD-style role-play (PM, Architect, QA personas). We use **skills as workflows**, not personas.
- NPM publication in the first release — distribution is global clone + bash CLI.
- Auto-discovery of project conventions from the codebase. The profile is hand-written (or CLI-scaffolded) per project.
- Backend code generation. The scope is frontend (Next.js / React) only.

## 3. Architecture Overview

Two tiers, clearly separated:

| Tier | Location | Owner | Change frequency |
|---|---|---|---|
| **Framework** — skills, MCP clients, CLI, templates | `~/.erp-agent/` (global clone) | Framework maintainer | Low; versioned releases |
| **Profile** — project rules, component registry, patterns | `<prod-project>/.agent/` | Each project's devs | High; edited as the project evolves |

The framework answers **"how to work"**. The profile answers **"what this project is"**.

## 4. Framework Layout (`~/.erp-agent/`)

```
~/.erp-agent/
├── README.md                      Installation + usage
├── bin/
│   └── erp-agent                  Bash CLI in PATH
├── templates/
│   ├── AGENTS.md.tmpl             Root AGENTS.md template
│   └── .agent/                    Folder copied into new projects
│       ├── README.md.tmpl
│       ├── profile.json.tmpl
│       ├── context/*.md.tmpl
│       ├── ui/*.md.tmpl
│       ├── ui/components/*.md.tmpl
│       ├── patterns/*.md.tmpl
│       └── checklists/*.md.tmpl
├── skills/                        Project-agnostic workflow files
│   ├── 00-router.md
│   ├── 01-brainstorm.md
│   ├── 02-extract-context.md
│   ├── 03-plan-feature.md
│   ├── 04-scaffold-data.md
│   ├── 05-transform-code.md
│   ├── 06-fetch-spec.md
│   ├── 07-verify.md
│   ├── 08-code-review.md
│   └── 09-refactor-scan.md
├── lib/
│   ├── figma_client.js        Unchanged from current repo
│   └── confluence_client.js   Unchanged from current repo
└── schema/
    └── profile.schema.json        JSON Schema for .agent/profile.json
```

### Skill file format (uniform)

Every skill file uses the same structure so the LLM can parse any of them predictably:

```md
---
id: 02-extract-context
trigger: "EC <figma-url> [spec=<confluence-url>] [target]"
requires: []                       Other skills this one chains into
---

# Extract Context (EC)

## Preconditions
- Bulleted list of what must be true / loaded before running

## Steps
1. Numbered imperative steps
2. Each step small enough to verify independently

## Output
- Where artifacts land (paths, formats)

## Verification
- [ ] Checklist of what "done" means for this skill
```

Checklists use `- [ ]` so the LLM can echo them as a TodoWrite-style ledger.

### CLI commands

```
erp-agent init                     In a project: copy templates/.agent/ and AGENTS.md
erp-agent update                   git pull in ~/.erp-agent; re-sync unchanged template files
erp-agent doctor                   Validate .agent/profile.json against schema; report drift
erp-agent version                  Print framework version
```

`init` is interactive — it asks for project name, Next.js version, state lib, i18n lib, and UI package path; fills the templates; writes `AGENTS.md` with the correct framework path.

## 5. Skills Catalog

| ID | Trigger | Purpose | Chains |
|---|---|---|---|
| `00-router` | — | Meta: decision tree used by `AGENTS.md` | — |
| `01-brainstorm` | vague/complex request | Socratic clarification; opt-in — agent asks first | → `03` |
| `02-extract-context` | `EC` | Fetch Figma design context + optional Confluence spec; save to `_extract/<task-id>/` | standalone or `TC` |
| `03-plan-feature` | `PL` | Emit implementation plan (files to create, order, acceptance criteria) | → `04`/`05` |
| `04-scaffold-data` | `SD` or via `TC` | Create `{feature}.type.ts`, `{feature}-api.ts`, `hooks/use{Feature}.ts` | → `05` |
| `05-transform-code` | `TC` | Implement UI components per patterns; reuse `ui/components/*` | → `07` |
| `06-fetch-spec` | `CS` | Fetch Confluence → Markdown → `_extract/<task-id>/spec.md` | standalone |
| `07-verify` | `VF` | Run typecheck / lint; run tests only if user asks; report evidence | — |
| `08-code-review` | `RV` | Review diff per severity (blocker / major / minor / nit) | — |
| `09-refactor-scan` | `RF <path>` | Detect duplication, scope refactor proposals; no code changes | → `03` |

**Chain encoding.** `TC` is the most common user input and expands to `02 → 03 → 04 → 05 → 07`. The chain is declared in `skills/00-router.md` so the LLM does not have to re-derive it.

## 6. Per-Project Profile Layout (`<prod-project>/.agent/`)

```
.agent/
├── README.md                      Task → file routing map (read first)
├── profile.json                   Metadata, framework version, project-specific vars
│
├── context/                       Project identity (load at session start)
│   ├── 01-stack.md                Framework versions, runtime, deps
│   ├── 02-architecture.md         Folder layout, routing, state, import aliases
│   ├── 03-conventions.md          Naming, i18n keys, file structure rules
│   └── 04-env.md                  Env var names, MCP credential paths
│
├── ui/                            Design system (load selectively)
│   ├── 01-tokens.md               Color/spacing/typography tokens + Tailwind mapping
│   ├── 02-hooks.md                Shared hooks inventory
│   ├── 03-utilities.md            Formatters, date utils
│   ├── 04-types.md                Shared types, enums, regex
│   └── components/                Split by category (Option 3)
│       ├── data-display.md        DataTable, StatusBadge, EntityHeaderCard, …
│       ├── forms.md               TextField, DropdownForm, CheckboxForm, …
│       ├── dialogs.md             AlertDialog, Dialog, FormDialog
│       ├── selects.md             Dropdown, MultiDropdown, TreeSelect
│       ├── dates.md               DateTimePicker, DateRangePicker, TimePicker
│       ├── layout.md              PageTabs, Stepper, Breadcrumb, Drawer
│       ├── media.md               AvatarUpload, AttachmentList, ImageViewer
│       ├── editor.md              TextEditor, TextEditorRender
│       └── primitives.md          Shadcn button/input/card/skeleton
│
├── patterns/                      Archetype templates (load on match)
│   ├── 01-page-shell.md           Loading/error guard wrapper
│   ├── 02-list-page.md            DataTable server/client-side patterns
│   ├── 03-detail-page.md          PageTabs + dynamic() imports
│   ├── 04-form-page.md            react-hook-form integration
│   └── 05-data-layer.md           RTK Query chain: types → api → hooks
│
└── checklists/                    Quality gates (load before commit)
    ├── dod-feature.md             Per-feature DoD
    └── dod-component.md           Per-component DoD
```

### Boundary between `ui/01-tokens.md` and `context/03-conventions.md`

- `ui/01-tokens.md` — anything Tailwind / CSS: color scales, spacing, radii, typography, token → class mapping.
- `context/03-conventions.md` — code-structure rules: naming, folder layout, i18n key conventions, commit style.

### Boundary between `.agent/` and `skills/`

- `.agent/` is **what the project is**. Lives in the consumer project.
- `skills/` is **how the agent works**. Lives in the framework, never in the consumer project.

Workflow steps, MCP client invocation scripts, and the `_extract/` convention live in `skills/`, not in `.agent/`.

### `components/` file format

Each category file is a table with a consistent schema:

```md
## DataTable

- **Path**: `@shared/ui/components/table`
- **Use when**: primary content is a data grid (list pages)
- **Key props**: `data`, `columns`, `pagination`, `onPaginationChange`, `onRowClick`
- **Server-side mode**: `manualPagination={true}` + `usePageTableState`
- **See pattern**: `patterns/02-list-page.md`
```

One entry per component. The LLM greps by component name; it does not load the whole file unless discovery is requested.

## 7. `.agent/README.md` — LLM Routing Table

Fixed format so the LLM can parse it deterministically:

```md
# Project Rules Index — Read Me First

## Session start (ALWAYS load)
- context/01-stack.md
- context/02-architecture.md
- context/03-conventions.md

## Before writing ANY UI code (MANDATORY)
- ui/01-tokens.md
  Rule: no hardcoded colors/spacing. If a Figma token is missing, add it here first.

## Before creating a new shared component
1. Grep ui/components/<likely-category>.md for an existing match.
2. If not found → build it, then append an entry to the matching file.
3. If category is unclear, list all files in ui/components/ and pick one.

## Build a list page    → patterns/02-list-page.md
## Build a detail page  → patterns/03-detail-page.md
## Build a form page    → patterns/04-form-page.md
## Scaffold data layer  → patterns/05-data-layer.md

## Before claiming done → checklists/dod-feature.md
```

## 8. Root `AGENTS.md` Template (generated at `erp-agent init`)

Under 150 lines. Content sections:

1. **Paths** — `~/.erp-agent/skills/`, `~/.erp-agent/lib/`, `./.agent/`
2. **Load order** — reference to `.agent/README.md`
3. **Trigger table** — user input → skill file (the table from §5)
4. **Hard gates**:
   - Do not write code before a plan exists, unless the user explicitly says "skip plan".
   - Do not use colors/spacing outside `ui/01-tokens.md`.
   - Grep `ui/components/` before building a new shared component.
5. **Brainstorm policy** — on vague or complex requests, ask the user: "Brainstorm trước không? (yes/no)". If yes, load `01-brainstorm.md`; if no, go to `03-plan-feature.md`.
6. **TDD policy** — `07-verify.md` runs typecheck + lint by default. It runs tests only when the user asks.

## 9. Governance

| Gate | Strictness | How enforced |
|---|---|---|
| Brainstorm | Opt-in, user chooses per task | `AGENTS.md` brainstorm policy |
| Plan before code | Default on; user may skip with explicit "skip plan" | `AGENTS.md` hard gate + `03-plan-feature.md` preconditions |
| No hardcoded tokens | Always on | `AGENTS.md` hard gate + `ui/01-tokens.md` |
| Reuse before build | Always on | `AGENTS.md` hard gate + `ui/components/*` grep step |
| TDD | Optional, user-triggered | `07-verify.md` default skips tests |
| Verify before done | On | `07-verify.md` produces evidence; `checklists/dod-feature.md` gates |
| Code review | On demand (`RV`) | `08-code-review.md` |

## 10. Migration from Current `design-to-code` Skill

Mapping of existing content to new locations:

| Current location | New location |
|---|---|
| `design-to-code/SKILL.md` — intro, commands, principles | `skills/00-router.md` + `AGENTS.md.tmpl` trigger table |
| `design-to-code/workflow.md` Step 1 (parse inputs) | `skills/02-extract-context.md` + `skills/06-fetch-spec.md` |
| `workflow.md` Step 1c Figma REST fallback | `skills/02-extract-context.md` |
| `workflow.md` Step 1e `_extract/` convention | `skills/02-extract-context.md` |
| `workflow.md` Step 2 page archetype detection | `skills/03-plan-feature.md` |
| `workflow.md` Step 3 data layer rule | `skills/04-scaffold-data.md` |
| `workflow.md` Step 4 component registry (~200 lines) | Split into `templates/.agent/ui/components/*.md.tmpl` |
| `workflow.md` Step 5 page shell + DataTable + detail patterns | Split into `templates/.agent/patterns/0[1-4]-*.md.tmpl` |
| `workflow.md` Step 6 DoD | `templates/.agent/checklists/dod-feature.md.tmpl` |
| `figma_client.js`, `confluence_client.js` | `~/.erp-agent/lib/` (unchanged) |
| `design-to-code/bmad-skill-manifest.yaml` | Deprecated — BMAD persona is replaced by the skill router |
| `design-to-code/USAGE.md` | Merged into `~/.erp-agent/README.md` |

After migration, `design-to-code/` folder is deleted. The `erp-agent` repo becomes the framework itself.

## 11. Distribution

- Developer clones the repo to `~/.erp-agent/`.
- Adds `~/.erp-agent/bin` to `$PATH` (documented in `README.md`).
- Updates with `erp-agent update` (runs `git pull`).
- No npm package in this release.

## 12. Open Questions (Resolved)

- **How to distribute?** Global clone + bash CLI (confirmed).
- **Governance strictness?** Brainstorm opt-in; plan gate default-on; TDD optional (confirmed).
- **Component registry format?** Markdown tables split by category (confirmed).
- **API conventions folder?** Not needed; API endpoints are provided per-feature by the user (confirmed).
- **Stack assumption?** Next.js App Router + Tailwind + Shadcn + `@shared/ui` (confirmed).

## 13. Future Work (Out of Scope)

- NPM package distribution and versioned upgrades.
- JSON registry for `ui/components/` once any single category exceeds ~30 entries.
- Additional skills: `10-i18n-extract.md`, `11-accessibility-audit.md`.
- BMAD-style multi-agent orchestration if a single-skill approach proves insufficient.
- CLI auto-detection of stack (parse `package.json`) during `erp-agent init`.
