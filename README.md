# erp-agent

Reusable agent framework for Next.js + Tailwind + Shadcn ERP projects. Pairs a global framework install with a per-project `.agent/` profile so a single workflow engine serves many projects.

## Install (one-time per machine)

```bash
git clone <this-repo> ~/.erp-agent
echo 'export PATH="$HOME/.erp-agent/bin:$PATH"' >> ~/.zshrc   # or ~/.bashrc
exec $SHELL
erp-agent version
```

## Use (per project)

```bash
cd /path/to/my-erp-project
erp-agent init          # scaffolds .agent/ and AGENTS.md (interactive)
erp-agent doctor        # validates .agent/profile.json
```

After `init`, edit `.agent/context/*.md` to reflect the project's specifics (stack versions, folder layout, i18n paths).

## Update framework

```bash
erp-agent update
```

## Layout

- `bin/erp-agent` — CLI
- `skills/` — project-agnostic workflow files (loaded by the agent from `~/.erp-agent/skills/`)
- `lib/` — MCP clients for Figma and Confluence
- `templates/` — files copied into a project on `init`
- `schema/profile.schema.json` — validates `.agent/profile.json`
- `docs/superpowers/` — spec + implementation plan

## Skills / triggers

The agent recognises the triggers listed in the generated `AGENTS.md`:

| Trigger | Skill |
|---|---|
| `EC` | extract Figma context (+ optional Confluence) |
| `PL` | plan a feature |
| `SD` | scaffold data layer |
| `TC` | full chain: EC → PL → SD → code → verify |
| `CS` | fetch Confluence spec |
| `VF` | verify (typecheck + lint) |
| `RV` | code review (runs `react-doctor` + manual pass) |
| `RF` | refactor scan |

Brainstorming is opt-in; the agent asks before running it.

## Contributing

Edit `skills/`, `templates/`, or `lib/` and submit a PR. Bump the CLI version in `bin/erp-agent`.
