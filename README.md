# erp-agent

Reusable agent framework for Next.js + Tailwind + Shadcn ERP projects. Global
install at `~/.erp-agent/`, per-project profile at `.agent/`.

## Install

```bash
git clone <this-repo-url> ~/.erp-agent
echo 'export PATH="$HOME/.erp-agent/bin:$PATH"' >> ~/.zshrc
exec $SHELL
erp-agent version        # → erp-agent 0.1.0
```

Requires `bash`, `git`, `node`. For `RV`: `npx` (runs `react-doctor`).

## Use

```bash
cd /path/to/project
erp-agent init           # scaffold .agent/ + AGENTS.md (interactive)
erp-agent doctor         # validate .agent/profile.json
erp-agent update         # git pull the framework
```

Walkthrough: [USAGE.md](USAGE.md).

## Triggers

| Trigger | Skill | Purpose |
|---|---|---|
| `EC <figma-url> [spec=<cf-url>]` | `02-extract-context.md` | Figma context (+ optional Confluence) |
| `PL` | `03-plan-feature.md` | Plan a feature |
| `SD` | `04-scaffold-data.md` | Types / api / hooks |
| `TC <figma-url> [spec=<cf-url>]` | 02 → 03 → 04 → 05 → 07 | Full feature pipeline |
| `CS <confluence-url>` | `06-fetch-spec.md` | Confluence page → Markdown |
| `VF` | `07-verify.md` | Typecheck + lint |
| `RV` | `08-code-review.md` | `react-doctor` + manual review |
| `RF <path>` | `09-refactor-scan.md` | Refactor scope (no changes) |
| `BR` | `10-bootstrap-registry.md` | Scan repo → fill `.agent/ui/*` + architecture |

Brainstorming and TDD are opt-in.

## Hard gates

1. No code before a plan (unless "skip plan").
2. No hardcoded tokens — resolve via the CSS source-of-truth indexed in `.agent/ui/01-tokens.md`.
3. Grep `.agent/ui/components/` AND `<uiPackage>/shadcn-components/` before building new shared components.
4. Data layer before UI.
5. Tables use `DataTable` — never hand-roll `<table>`.
6. Feature endpoints use `api.injectEndpoints()`; no new `createApi`.

## Layout

- `bin/erp-agent` — CLI
- `skills/` — workflow files the agent loads on trigger
- `templates/` — scaffolded into a project by `init`
- `schema/profile.schema.json` — validates `.agent/profile.json`
- `lib/` — Figma + Confluence MCP clients
- `docs/superpowers/` — design spec + implementation plan

## Contributing

Edit `skills/`, `templates/`, `lib/`, or `schema/`, bump `VERSION` in
`bin/erp-agent`, open a PR.
