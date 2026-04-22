# erp-agent — Usage Guide

Step-by-step guide for day-to-day work once the framework is installed. For
install instructions see [README.md](README.md).

- [1. First-time project setup](#1-first-time-project-setup)
- [2. Fill in the profile](#2-fill-in-the-profile)
- [3. Building a new feature (the `TC` chain)](#3-building-a-new-feature-the-tc-chain)
- [4. Standalone triggers](#4-standalone-triggers)
- [5. Review workflow (`RV`)](#5-review-workflow-rv)
- [6. Verification gate (`VF`)](#6-verification-gate-vf)
- [7. Refactor scans (`RF`)](#7-refactor-scans-rf)
- [8. Updating the framework](#8-updating-the-framework)
- [9. Troubleshooting](#9-troubleshooting)
- [10. FAQ](#10-faq)

---

## 1. First-time project setup

From the root of a Next.js project:

```bash
cd /path/to/my-erp-project
erp-agent init
```

You'll be asked five questions (defaults in brackets):

| Prompt | Default | Notes |
|---|---|---|
| Project name | current dir name | Written to `project.name` in `profile.json`; JSON-escaped automatically. |
| Next.js version | `14` | Free-form string — put `14`, `15.0.3`, etc. |
| State library | `rtk-query` | One of `rtk-query`, `react-query`, `swr`, `other`. Validated at prompt time. |
| i18n library | `react-i18next` | Free-form. |
| Shared UI package alias | `@shared/ui` | Import alias of your shared component package. |

`init` then:

1. Writes `AGENTS.md` at the project root.
2. Writes `.agent/` with `README.md`, `profile.json`, and the `context/`,
   `ui/`, `patterns/`, `checklists/` subtrees.
3. Warns if any `{{PLACEHOLDER}}` survived interpolation.

Verify the profile validates:

```bash
erp-agent doctor
# → profile.json: ok
```

Commit the scaffold:

```bash
git add AGENTS.md .agent
git commit -m "chore: add erp-agent profile"
```

Add `_extract/` to `.gitignore` — the Figma/Confluence scratch dirs written by
the `EC` / `CS` skills should not be committed.

---

## 2. Fill in the profile

`init` gives you a skeleton. Before using the agent for real work, fill in the
`<fill>` placeholders:

| File | What to edit |
|---|---|
| `.agent/context/01-stack.md` | Exact package manager, testing framework, key dependencies. |
| `.agent/context/02-architecture.md` | Top-level folder map, app vs admin split, route groups. |
| `.agent/context/03-conventions.md` | Naming, folder layout, i18n key convention. |
| `.agent/context/04-env.md` | Required env vars (`NEXT_PUBLIC_*`, API base URLs). |
| `.agent/ui/01-tokens.md` | Design tokens — **every** color / spacing / radius / typography value the project uses. The agent will reject hardcoded values that aren't listed here. |
| `.agent/ui/02-hooks.md` / `03-utilities.md` / `04-types.md` | Shared hooks, helpers, and cross-feature types. |
| `.agent/ui/components/*.md` | The component registry, split by category (forms, dialogs, data-display…). See [§ Adding a component to the registry](#adding-a-component-to-the-registry) below. |
| `.agent/patterns/*.md` | Already populated with page-shell / list / detail / form / data-layer patterns; adjust the import paths to match your real modules. |
| `.agent/checklists/*.md` | Extend the feature / component DoDs with anything team-specific (e.g. Storybook, test coverage). |

Tip: the agent reads `.agent/README.md` first. If you want the agent to load a
new file on session start, add it to the "Load order" list there.

### Adding a component to the registry

Every shared component should have one entry under
`.agent/ui/components/<category>.md`, following this shape:

```markdown
## Button

- **Path:** `@shared/ui/components/button`
- **Use when:** primary/secondary/ghost action in a form or toolbar
- **Key props:** `variant`, `size`, `loading`, `asChild`
- **Notes:** never wrap with an extra `<div>` — it already handles spacing
- **Pattern:** see `.agent/patterns/04-form-page.md`
```

The agent greps this file before building anything custom.

---

## 3. Building a new feature (the `TC` chain)

`TC` is the **full** pipeline. Use it when you have a Figma URL and want the
agent to take you end-to-end:

```
TC https://www.figma.com/design/<fileKey>/<name>?node-id=<nodeId>
   [spec=https://<company>.atlassian.net/wiki/spaces/<...>]
   [target=app/warehouses]
```

What the chain does, in order:

1. **`02-extract-context`** — runs the Figma MCP client, pulls design context
   + screenshot + metadata into `_extract/<task-id>/`, optionally fetches the
   Confluence page as `spec.md`. Summarises what it found (components,
   tokens, sections, requirements table).
2. **`03-plan-feature`** — proposes a file-by-file plan (types, api, hooks,
   page, components). Lists which shared components will be reused and which
   tokens are needed. Writes `_extract/<task-id>/plan.md`. Waits for your
   confirmation before moving on.
3. **`04-scaffold-data`** — creates `{feature}.type.ts`, `{feature}-api.ts`,
   and (if needed) `hooks/use{Feature}.ts`. Enforces `tagTypes` /
   `providesTags` / `invalidatesTags` on the state-library slice.
4. **`05-transform-code`** — builds the UI: page file + components. Greps
   the registry before building new; maps every style to a token; runs every
   user-visible string through i18n.
5. **`07-verify`** — typecheck + lint. Reports the first failure it sees
   (no cascading) and waits for you to fix.

If you want to split the chain, use the standalone triggers below.

### Typical first iteration

1. `TC <figma-url> spec=<cf-url>`
2. Agent produces `_extract/<task-id>/plan.md` → **review and reply "ok"** or
   request tweaks.
3. Agent writes data layer → asks to verify → you reply "yes" or "continue".
4. Agent writes UI → runs VF.
5. You run the feature in the browser. Report any mismatch vs Figma; the
   agent iterates.
6. When you're happy: `RV` to catch issues before PR.

---

## 4. Standalone triggers

Any of the chain's stages can run on its own when you don't want the full
pipeline.

### `EC` — extract only

```
EC https://www.figma.com/design/<fileKey>/.../?node-id=<nodeId>
EC https://.../?node-id=<a> https://.../?node-id=<b> spec=<cf-url> target=app/x
```

Writes to `_extract/<task-id>/` but does not plan or code. Useful when you're
just gathering context or when the Figma needs review first.

### `PL` — plan only

```
PL
```

The agent reads the existing `_extract/<task-id>/` artifacts and the
`.agent/` profile, then writes `plan.md`. Use when `EC` already ran, or when
planning a refactor that has no Figma input.

### `SD` — scaffold the data layer only

```
SD
```

Requires a plan. Creates types + api slice + hooks, runs `tsc --noEmit`.

### `CS` — fetch a Confluence spec

```
CS https://<company>.atlassian.net/wiki/spaces/<...>
CS <url-1> <url-2>                      # multiple pages
```

Requires `.env.confluence` with `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN`.
Writes `_extract/<task-id>/spec*.md` and a summary table (API endpoints,
data model, business rules, user actions, states).

---

## 5. Review workflow (`RV`)

Run before opening a PR.

```
RV
```

The skill runs a **two-pass** review:

1. **Automated pass — React Doctor**
   ```bash
   npx -y react-doctor@latest . --diff <base-branch> --verbose
   ```
   Covers 60+ rules: state/effects, performance, bundle size, security,
   a11y, Next.js specifics, dead code. Respects any
   `react-doctor.config.json` or `package.json#reactDoctor` you have.

2. **Manual pass** — things React Doctor can't know:
   - Design tokens (`.agent/ui/01-tokens.md`)
   - Shared-component reuse (`.agent/ui/components/*.md`)
   - Project conventions (`.agent/context/03-conventions.md`)
   - i18n coverage
   - DoD checklists

### Severity mapping

| React Doctor | Manual finding | erp-agent severity |
|---|---|---|
| `error` | Hard-gate violation, missing contract | **Blocker** |
| `warning` in security/correctness | Missed reuse, a11y miss, convention break | **Major** |
| `warning` in other categories | Duplication, dead code, naming drift | **Minor** |
| — | Style-only | **Nit** |

The report starts with a summary line:

```
score=82/100, E=0, W=7
```

Each finding cites `file:line` and, for React Doctor findings, the rule id
(e.g. `react/no-danger`) so you can add it to
`react-doctor.config.json → ignore.rules` if your team has decided it doesn't
apply.

---

## 6. Verification gate (`VF`)

```
VF
```

Runs typecheck + lint using the package manager detected from
`.agent/context/01-stack.md`. Tests are **opt-in** — they run only if:

- you explicitly ask ("VF including tests"), or
- the task is a bug fix with a regression test.

On failure, the skill reports the **first** failure with file path, line, and
expected fix, then stops. It does not cascade through the rest of the steps.

`VF` is automatically the tail of any `TC` or `SD` chain — you do not need to
run it separately after those.

---

## 7. Refactor scans (`RF`)

```
RF src/features/warehouses
RF @shared/ui/components/forms
```

Reports duplication and refactor scope. **Makes no code changes.** Output
format:

- Findings grouped by file
- Each finding has severity (high/med/low), a concrete proposal, and an
  estimated scope (files touched, LOC delta)
- If > 20 findings, the skill clusters them into 3–5 focused refactor
  proposals you can tackle one at a time

Run `RF` before a big refactor to decide scope. After you agree on a
proposal, plan the work with `PL` and execute via `SD` + `05-transform-code`
as normal.

---

## 8. Updating the framework

```bash
erp-agent update
```

This runs `git pull --ff-only` at `~/.erp-agent`. The CLI **does not**
diff your project's `.agent/` against the new templates — drift detection is
intentionally manual because every project customises `01-tokens.md`, the
component registry, and patterns.

To see what changed:

```bash
# 1. Scaffold a fresh copy in a scratch dir
mkdir /tmp/erp-diff && cd /tmp/erp-diff && erp-agent init
# 2. Diff the parts you didn't customise
diff -r .agent/patterns /path/to/my-project/.agent/patterns
diff -r .agent/checklists /path/to/my-project/.agent/checklists
```

Cherry-pick improvements into your project; leave the customised files alone.

---

## 9. Troubleshooting

### `erp-agent doctor` reports `not in enum […]`

The profile's `stateLib` field must be one of `rtk-query`, `react-query`,
`swr`, `other`. Edit `.agent/profile.json` and re-run doctor.

### `erp-agent doctor` reports `unexpected property X`

The JSON schema uses `additionalProperties: false` at the root. Either remove
the extra field, or move it under `mcp` (which allows extra keys for
forward-compatibility).

### `erp-agent init` fails: "AGENTS.md already exists"

The CLI refuses to overwrite. If the existing file is not something you want
to keep, `mv AGENTS.md AGENTS.md.bak` and re-run `init`.

### Un-interpolated `{{PLACEHOLDER}}` warning

`init` prints a warning when it finds any `{{[A-Z_]+}}` left in the output.
This usually means the framework added a new placeholder variable that
`init` doesn't know about yet. Run `erp-agent update`, then re-scaffold in a
scratch dir to see the new prompts.

### `RV` / `npx react-doctor` is slow

First invocation downloads the package (~tens of MB). After the first run,
`npm`'s cache makes it fast. For large repos, always pass `--diff <base>` so
only changed files are scanned.

### `EC` fails with "connection refused on 127.0.0.1:3845"

The Figma Desktop MCP Server is not running. Open Figma desktop → Settings →
enable the MCP server, then re-run `EC`.

### `CS` fails with 401

Check `.env.confluence`:

```
CONFLUENCE_EMAIL=you@company.com
CONFLUENCE_API_TOKEN=<token from id.atlassian.com>
```

Make sure the token has access to the Confluence space you're fetching.

### `erp-agent` command not found

Your shell's `PATH` doesn't include `~/.erp-agent/bin`. Verify the install
step:

```bash
echo $PATH | tr ':' '\n' | grep erp-agent
# should print /Users/<you>/.erp-agent/bin
```

If missing, re-run the `export PATH=...` line from README.md and
`exec $SHELL`.

---

## 10. FAQ

**Q: Does this replace ESLint / TypeScript / our existing CI?**
No. `VF` wraps your existing tools — it does not bring its own. React Doctor
in `RV` is additional, focused on React-specific design issues ESLint doesn't
catch. Your CI pipeline is unchanged.

**Q: Do I have to use RTK Query?**
No. Choose `react-query`, `swr`, or `other` at `init`. The `patterns/` files
ship with RTK Query examples; replace with your library's equivalents and
commit.

**Q: Does the agent auto-run skills?**
No. In Antigravity and most IDEs there's no auto-skill-triggering. The
`AGENTS.md` router is the contract: the agent reads it and explicitly loads
the matching skill file. If you paste a trigger the agent doesn't act on,
make sure `AGENTS.md` is in your working-directory context.

**Q: Can I customise the hard gates?**
Yes — edit `AGENTS.md` in your project. The framework's copy is only the
template.

**Q: Where does extracted design context go?**
`_extract/<task-id>/` at the project root. Add this to `.gitignore` — those
files are derived artifacts.

**Q: How do I bump the framework version?**
Edit `VERSION` in `bin/erp-agent`, then commit. `init` writes that version
into `frameworkVersion` in generated profiles so you can tell which projects
are on which framework release.
