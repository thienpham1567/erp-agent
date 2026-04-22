# Usage

- [1. Init](#1-init) · [2. Fill profile](#2-fill-profile) · [3. Build feature (TC)](#3-build-feature-tc) · [4. Standalone](#4-standalone)
- [5. Review (RV)](#5-review-rv) · [6. Verify (VF)](#6-verify-vf) · [7. Refactor (RF)](#7-refactor-rf)
- [8. Update](#8-update) · [9. Troubleshoot](#9-troubleshoot)

## 1. Init

```bash
cd /path/to/project
erp-agent init
erp-agent doctor
echo "_extract/" >> .gitignore
git add AGENTS.md .agent && git commit -m "chore: add erp-agent profile"
```

Prompts: project name, Next.js version, state lib (`rtk-query|react-query|swr|other`), i18n lib, UI package alias.
`init` refuses to overwrite an existing `AGENTS.md` or `.agent/`.

## 2. Fill profile

Replace every `<fill>` in the scaffold. Priority order:

| File | Why it matters |
|---|---|
| `.agent/ui/01-tokens.md` | Agent rejects hardcoded values not listed here. |
| `.agent/ui/components/*.md` | Agent greps this before building new components. |
| `.agent/context/0{1,2,3}-*.md` | Stack, architecture, conventions, i18n keys. |
| `.agent/patterns/*.md` | Adjust the sample imports to match your real modules. |

Component registry entry shape:

```markdown
## Button
- **Path:** `@shared/ui/components/button`
- **Use when:** primary/secondary/ghost action in a form or toolbar
- **Key props:** `variant`, `size`, `loading`
- **Pattern:** see `.agent/patterns/04-form-page.md`
```

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
