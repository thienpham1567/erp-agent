# Usage

- [1. Init](#1-init) · [2. Fill profile](#2-fill-profile) · [2b. Bootstrap (BR)](#2b-bootstrap-br) · [3. Build feature (TC)](#3-build-feature-tc) · [4. Standalone](#4-standalone)
- [5. Review (RV)](#5-review-rv) · [6. Verify (VF)](#6-verify-vf) · [7. Refactor (RF)](#7-refactor-rf)
- [8. Update](#8-update) · [9. Troubleshoot](#9-troubleshoot)

## 1. Init

```bash
cd /path/to/project
erp-agent init
erp-agent doctor
git add AGENTS.md .agent .gitignore && git commit -m "chore: add erp-agent profile"
```

Prompts: project name, Next.js version, state lib (`rtk-query|react-query|swr|other`),
i18n lib, i18n locales path, UI package alias, shared-packages root, verify
script, and workspace apps (blank for single-app, or `admin:apps/admin,client:apps/client`
for monorepos). `init` refuses to overwrite an existing `AGENTS.md` or `.agent/`,
and auto-appends `_extract/` to `.gitignore`.

## 2. Fill profile

Replace every `<fill>` in the scaffold. Priority order:

| File | Why it matters |
|---|---|
| `.agent/ui/01-tokens.md` | Index pointing at `<uiPackage>/styles/globals.css`. Agent rejects hardcoded values; tokens live in CSS. |
| `.agent/ui/components/*.md` | Agent greps this before building new components. `components/README.md` explains the primitives-vs-composites split. |
| `.agent/ui/02-hooks.md` | Split into **shared** (cross-app) + **per-app** tables. |
| `.agent/context/05-apps-matrix.md` | Monorepos only — declares per-app differences (auth, forbidden UX, permission model). Delete if single-app. |
| `.agent/context/0{1,2,3,4}-*.md` | Stack, architecture, conventions, env. |
| `.agent/patterns/*.md` | Adjust the sample imports to match your real modules. |

Component registry entry shape:

```markdown
## Button
- **Path:** `@shared/ui/components/button`
- **Use when:** primary/secondary/ghost action in a form or toolbar
- **Key props:** `variant`, `size`, `loading`
- **Pattern:** see `.agent/patterns/04-form-page.md`
```

## 2b. Bootstrap (BR)

For **existing** codebases, after filling the stack/conventions manually,
let the agent fill the registry for you:

```
BR
```

The skill walks `<uiPackage>/components/`, `<uiPackage>/shadcn-components/`,
`<sharedRoot>/utils/src/hooks/`, and each app's `src/hooks/` and `src/app/`,
populating `.agent/ui/02-hooks.md`, the component category files, and
`.agent/context/02-architecture.md`. Run it once after `erp-agent init`;
re-run after large refactors.

## 3. Build feature (TC)

```
TC <figma-url> [spec=<cf-url>] [target=<path>]
```

Chain: `EC → PL → SD → code → VF`. The agent pauses after **PL** — review
`_extract/<task-id>/plan.md` and reply "ok" or request changes before it
writes code.

Iteration loop:

1. `TC <figma-url> spec=<cf-url>`
2. Approve plan → agent scaffolds data → agent builds UI → `VF` runs.
3. Open the feature in the browser; report any mismatch vs Figma.
4. When happy: `RV` before PR.

## 4. Standalone

| Trigger | Use when |
|---|---|
| `EC <figma-url> [spec=<cf-url>]` | Gather context only — no plan, no code. |
| `PL` | You already have `_extract/<task-id>/`; skip Figma. |
| `SD` | Data layer only. Requires an existing plan. |
| `CS <cf-url> [<cf-url> ...]` | Fetch Confluence pages as Markdown. Needs `.env.confluence`. |

## 5. Review (RV)

```
RV
```

Two passes:

1. **React Doctor** — `npx -y react-doctor@latest . --diff <base> --verbose`. Respects `react-doctor.config.json` / `package.json#reactDoctor`.
2. **Manual** — tokens, component reuse, conventions, i18n, DoD.

Severity mapping:

| Source | Severity |
|---|---|
| RD `error` · missing hard gate | **Blocker** |
| RD `warning` (security/correctness) · missed reuse · a11y miss | **Major** |
| RD `warning` (other) · duplication · dead code | **Minor** |
| Style-only | **Nit** |

Report header: `score=NN/100, E=<errs>, W=<warns>`. Findings cite
`file:line` + rule id (e.g. `react/no-danger`) so you can add ignores to
`react-doctor.config.json`.

## 6. Verify (VF)

```
VF
```

Typecheck + lint. Tests are opt-in. Stops at the first failure with
`file:line` + expected fix. Auto-runs as the tail of `TC` and `SD`.

## 7. Refactor (RF)

```
RF <path>
```

Duplication + refactor proposals. **No code changes.** > 20 findings cluster
into 3–5 focused proposals.

## 8. Update

```bash
erp-agent update   # git pull --ff-only
```

Drift detection is manual (every project customises tokens + registry):

```bash
mkdir /tmp/erp-diff && cd /tmp/erp-diff && erp-agent init
diff -r .agent/patterns /path/to/project/.agent/patterns
diff -r .agent/checklists /path/to/project/.agent/checklists
```

Cherry-pick improvements. Leave customised files alone.

## 9. Troubleshoot

| Symptom | Fix |
|---|---|
| `doctor`: `not in enum [...]` | `stateLib` must be `rtk-query|react-query|swr|other`. |
| `doctor`: `unexpected property X` | Root disallows extras. Move to `mcp` (allows extras) or remove. |
| `init`: "AGENTS.md already exists" | `mv AGENTS.md AGENTS.md.bak` then re-run. |
| Warning: un-interpolated `{{PLACEHOLDER}}` | Framework added a new variable. `erp-agent update`, then re-scaffold in `/tmp`. |
| `EC`: "connection refused 127.0.0.1:3845" | Start Figma Desktop MCP server (Settings → enable MCP). |
| `CS`: 401 | Check `.env.confluence` (`CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`). |
| `erp-agent: command not found` | `echo $PATH \| grep erp-agent`. Re-run the `export PATH` line. |
| `RV` slow first run | `npx` downloads `react-doctor`. Use `--diff <base>` on big repos. |
