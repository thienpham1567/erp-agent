# erp-agent Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `erp-agent` from a single-project `design-to-code` skill into a reusable framework (`~/.erp-agent/`) plus a per-project profile (`.agent/`) scaffolded by a bash CLI.

**Architecture:** Framework holds project-agnostic skills, MCP clients, templates, and a CLI. Each consumer ERP project hosts a `.agent/` profile describing its stack, design tokens, component registry, and patterns. A root `AGENTS.md` in the consumer project routes Gemini (Antigravity) or any other agent to the right skill per user trigger.

**Tech Stack:** Bash (CLI), Node.js ESM (MCP clients, already present), Markdown (skills + templates), JSON Schema (profile validation).

**Working directory:** `/Users/thienpham/Downloads/erp-agent` (this repo becomes the framework source). Cloning it to `~/.erp-agent/` is an operator step, not a code task.

**Reference:** `docs/superpowers/specs/2026-04-21-erp-agent-redesign-design.md`

---

## Execution Notes

- Tests are adapted to this repo's nature (config + Markdown + bash). "Verification" per task means either running the CLI in a scratch dir, validating generated files exist/match, or running `shellcheck`/`node --check`.
- Every task ends with a commit. Use Conventional Commits (`feat:`, `chore:`, `docs:`).
- Template files use the `.tmpl` extension only when they contain `{{VAR}}` placeholders interpolated by the CLI. Files with no placeholders are plain `.md`.
- The framework name inside `~/.erp-agent/` is fixed. Inside this repo, paths are all relative to the repo root.

---

### Task 1: Restructure repo — create `lib/` and move MCP clients

**Files:**
- Move: `confluence_mcp_client.js` → `lib/confluence_mcp_client.js`
- Move: `figma_mcp_client.js` → `lib/figma_mcp_client.js`
- Create: `lib/README.md`

- [ ] **Step 1: Create `lib/` and move MCP clients**

```bash
mkdir -p lib
git mv confluence_mcp_client.js lib/confluence_mcp_client.js
git mv figma_mcp_client.js lib/figma_mcp_client.js
```

- [ ] **Step 2: Write `lib/README.md`**

```md
# lib/ — MCP Clients

Reusable Node.js ESM modules that talk to external services.

- `figma_mcp_client.js` — wraps the Figma Desktop MCP Server (Streamable HTTP at `http://127.0.0.1:3845/mcp`). Exports `FigmaMCPClient` and `parseFigmaUrl`.
- `confluence_mcp_client.js` — wraps the Confluence REST API with Basic Auth. Reads `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN` from the environment. Exports `ConfluenceMCPClient` and `parseConfluenceUrl`.

Framework skills (`skills/02-extract-context.md`, `skills/06-fetch-spec.md`) import these from `~/.erp-agent/lib/`.
```

- [ ] **Step 3: Verify modules still resolve**

Run: `node --check lib/figma_mcp_client.js && node --check lib/confluence_mcp_client.js`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add lib/
git commit -m "chore: move MCP clients into lib/"
```

---

### Task 2: Create `schema/profile.schema.json`

**Files:**
- Create: `schema/profile.schema.json`

- [ ] **Step 1: Write the JSON Schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://erp-agent.local/profile.schema.json",
  "title": "erp-agent project profile",
  "type": "object",
  "required": ["frameworkVersion", "project", "paths"],
  "properties": {
    "frameworkVersion": {
      "type": "string",
      "description": "Version of the erp-agent framework this profile was generated with."
    },
    "project": {
      "type": "object",
      "required": ["name", "stack"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "stack": {
          "type": "object",
          "required": ["nextVersion", "stateLib", "i18nLib", "uiPackage"],
          "properties": {
            "nextVersion": { "type": "string" },
            "stateLib": { "type": "string", "enum": ["rtk-query", "react-query", "swr", "other"] },
            "i18nLib": { "type": "string" },
            "uiPackage": { "type": "string", "description": "Import alias for the shared UI package, e.g. @shared/ui." }
          }
        }
      }
    },
    "paths": {
      "type": "object",
      "required": ["frameworkRoot", "profileRoot", "extractRoot"],
      "properties": {
        "frameworkRoot": { "type": "string", "description": "Absolute path to ~/.erp-agent/." },
        "profileRoot": { "type": "string", "description": "Path (relative to project root) to .agent/." },
        "extractRoot": { "type": "string", "description": "Path for Figma/Confluence extraction artifacts." }
      }
    },
    "mcp": {
      "type": "object",
      "properties": {
        "figmaEnv": { "type": "string" },
        "confluenceEnv": { "type": "string" }
      }
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 2: Validate schema parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('schema/profile.schema.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add schema/profile.schema.json
git commit -m "feat(schema): add profile.schema.json for project profile validation"
```

---

### Task 3: Write `bin/erp-agent` CLI (bash)

**Files:**
- Create: `bin/erp-agent`

The CLI supports four subcommands: `init`, `update`, `doctor`, `version`. `init` is interactive, asks the user for stack inputs, then copies `templates/AGENTS.md.tmpl` and `templates/.agent/` into the target project, interpolating `{{VARS}}`.

- [ ] **Step 1: Write the bash script**

```bash
#!/usr/bin/env bash
set -euo pipefail

FRAMEWORK_ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")")/.." && pwd)"
VERSION="0.1.0"

usage() {
  cat <<EOF
erp-agent ${VERSION}
Usage: erp-agent <command>
Commands:
  init      Scaffold .agent/ and AGENTS.md into the current project
  update    git pull the framework and report template drift
  doctor    Validate .agent/profile.json against the schema
  version   Print framework version
EOF
}

cmd_version() { echo "erp-agent ${VERSION}"; }

cmd_update() {
  echo "Updating framework at ${FRAMEWORK_ROOT} ..."
  git -C "${FRAMEWORK_ROOT}" pull --ff-only
}

ask() {
  local prompt="$1" default="${2:-}" reply
  if [[ -n "${default}" ]]; then
    read -r -p "${prompt} [${default}]: " reply
    echo "${reply:-${default}}"
  else
    read -r -p "${prompt}: " reply
    echo "${reply}"
  fi
}

interpolate() {
  local src="$1" dst="$2"
  local content
  content="$(cat "${src}")"
  for pair in "$@"; do
    case "${pair}" in
      --*=*)
        local key="${pair%%=*}"; key="${key#--}"
        local val="${pair#*=}"
        content="${content//\{\{${key}\}\}/${val}}"
        ;;
    esac
  done
  mkdir -p "$(dirname "${dst}")"
  printf '%s\n' "${content}" > "${dst}"
}

cmd_init() {
  local target="${PWD}"
  if [[ -d "${target}/.agent" ]]; then
    echo "error: .agent/ already exists at ${target}. Aborting." >&2
    exit 1
  fi

  echo "Initializing erp-agent profile at ${target}"
  local project_name next_version state_lib i18n_lib ui_package
  project_name="$(ask "Project name" "$(basename "${target}")")"
  next_version="$(ask "Next.js version" "14")"
  state_lib="$(ask "State library (rtk-query|react-query|swr|other)" "rtk-query")"
  i18n_lib="$(ask "i18n library" "react-i18next")"
  ui_package="$(ask "Shared UI package alias" "@shared/ui")"

  local src="${FRAMEWORK_ROOT}/templates"
  local dst="${target}"

  while IFS= read -r -d '' f; do
    local rel="${f#${src}/}"
    local out="${dst}/${rel%.tmpl}"
    interpolate "${f}" "${out}" \
      --PROJECT_NAME="${project_name}" \
      --NEXT_VERSION="${next_version}" \
      --STATE_LIB="${state_lib}" \
      --I18N_LIB="${i18n_lib}" \
      --UI_PACKAGE="${ui_package}" \
      --FRAMEWORK_ROOT="${FRAMEWORK_ROOT}" \
      --FRAMEWORK_VERSION="${VERSION}"
  done < <(find "${src}" -type f -print0)

  echo "✅ Profile written to ${target}/.agent/"
  echo "✅ AGENTS.md written to ${target}/AGENTS.md"
  echo "Next: edit .agent/context/*.md to reflect your project."
}

cmd_doctor() {
  local profile="${PWD}/.agent/profile.json"
  if [[ ! -f "${profile}" ]]; then
    echo "error: no .agent/profile.json in ${PWD}" >&2
    exit 1
  fi
  node -e "
    const profile = JSON.parse(require('fs').readFileSync('${profile}','utf8'));
    const schema = JSON.parse(require('fs').readFileSync('${FRAMEWORK_ROOT}/schema/profile.schema.json','utf8'));
    const required = schema.required || [];
    for (const key of required) {
      if (!(key in profile)) { console.error('missing required field:', key); process.exit(1); }
    }
    console.log('profile.json: ok');
  "
}

main() {
  local cmd="${1:-}"
  case "${cmd}" in
    init) cmd_init ;;
    update) cmd_update ;;
    doctor) cmd_doctor ;;
    version|--version|-v) cmd_version ;;
    ""|help|--help|-h) usage ;;
    *) echo "unknown command: ${cmd}"; usage; exit 1 ;;
  esac
}

main "$@"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x bin/erp-agent
```

- [ ] **Step 3: Verify it parses**

Run: `bash -n bin/erp-agent && bin/erp-agent version`
Expected: `erp-agent 0.1.0`

- [ ] **Step 4: Commit**

```bash
git add bin/erp-agent
git commit -m "feat(cli): add bin/erp-agent with init/update/doctor/version"
```

---

### Task 4: Write `templates/AGENTS.md.tmpl`

**Files:**
- Create: `templates/AGENTS.md.tmpl`

Root AGENTS.md under 150 lines. Contains paths, trigger table, hard gates, brainstorm policy, TDD policy.

- [ ] **Step 1: Write the template**

```md
# Agent Instructions — {{PROJECT_NAME}}

This project is configured with the **erp-agent** framework (v{{FRAMEWORK_VERSION}}).

## Paths
- Framework skills: `{{FRAMEWORK_ROOT}}/skills/`
- Framework lib:    `{{FRAMEWORK_ROOT}}/lib/`
- Project profile:  `./.agent/`
- Extraction dir:   `./_extract/<task-id>/`  (Figma + Confluence artifacts, gitignored)

## Load order (session start)
Before your first response, load these in order:
1. `./.agent/README.md`        (routing table; do what it says)
2. `./.agent/context/01-stack.md`
3. `./.agent/context/02-architecture.md`
4. `./.agent/context/03-conventions.md`

## Trigger table
| User input | Load skill file | Purpose |
|---|---|---|
| Vague or multi-part request | `01-brainstorm.md` **after asking "Brainstorm trước không?"** | Clarify requirements |
| `EC <figma-url> [spec=<cf-url>] [target]` | `02-extract-context.md` | Pull design context + optional spec |
| `PL` | `03-plan-feature.md` | Write implementation plan |
| `SD` | `04-scaffold-data.md` | Types / API / hooks |
| `TC <figma-url> [spec=<cf-url>] [target]` | Chain 02 → 03 → 04 → `05-transform-code.md` → 07 | Full feature |
| `CS <confluence-url>` | `06-fetch-spec.md` | Fetch wiki → markdown |
| `VF` | `07-verify.md` | typecheck + lint (+ tests if user asks) |
| `RV` | `08-code-review.md` | Severity-graded review |
| `RF <path>` | `09-refactor-scan.md` | Scope refactor proposals |

Every skill file lives under `{{FRAMEWORK_ROOT}}/skills/`. Load by reading the file; do not summarise from memory.

## Hard gates
1. **No code before a plan.** If no plan exists and the user did not say "skip plan", load `03-plan-feature.md` first.
2. **No hardcoded tokens.** All colors / spacing / radii / typography must map to entries in `./.agent/ui/01-tokens.md`. If the token is missing, add it there first, then use it.
3. **Grep before build.** Before creating a new shared component, grep `./.agent/ui/components/` for a match. Only build new if nothing fits.
4. **Data layer before UI.** `04-scaffold-data.md` must complete before `05-transform-code.md` starts.

## Brainstorm policy
For vague, multi-screen, or architecturally unclear requests, first ask:
> "Bạn muốn brainstorm trước không? (yes/no)"
- `yes` → load `01-brainstorm.md`
- `no`  → proceed directly to `03-plan-feature.md`
- Small, well-specified tasks skip this prompt.

## TDD policy
`07-verify.md` runs typecheck + lint by default. Run tests only if the user asks, or if the task is explicitly a bug fix that should add a regression test.

## Response style
- Acknowledge which skill file you loaded before executing its steps.
- Cite file paths with `[name](path)` markdown links so the IDE can jump.
- Follow each skill's checklist as a to-do ledger. Tick items as you go.
```

- [ ] **Step 2: Commit**

```bash
git add templates/AGENTS.md.tmpl
git commit -m "feat(templates): add root AGENTS.md template"
```

---

### Task 5: Write `templates/.agent/README.md.tmpl`

**Files:**
- Create: `templates/.agent/README.md.tmpl`

- [ ] **Step 1: Write the router**

```md
# Project Rules Index — Read Me First

This folder describes **what this project is**. The framework under `{{FRAMEWORK_ROOT}}` describes **how to work**.

## Session start (ALWAYS load in this order)
1. `context/01-stack.md`
2. `context/02-architecture.md`
3. `context/03-conventions.md`

## Before writing ANY UI code (MANDATORY)
- `ui/01-tokens.md` — no hardcoded colors, spacing, radii, typography.
  If the design uses a value with no token, ADD a token first.

## Before creating a new shared component
1. Guess the category (data-display, forms, dialogs, selects, dates, layout, media, editor, primitives).
2. Grep `ui/components/<category>.md` for the component you need.
3. If unclear which category, scan file names in `ui/components/`.
4. If nothing fits, build the component, then append an entry to the matching category file.

## Building a page
- List page   → `patterns/02-list-page.md`
- Detail page → `patterns/03-detail-page.md`
- Form page   → `patterns/04-form-page.md`
- Page shell  → `patterns/01-page-shell.md`

## Creating a data layer (types / api / hooks)
→ `patterns/05-data-layer.md`

## Before claiming a task is done
→ `checklists/dod-feature.md`

## Environment
API credentials, MCP tokens, i18n catalog paths are in `context/04-env.md`.
```

- [ ] **Step 2: Commit**

```bash
git add templates/.agent/README.md.tmpl
git commit -m "feat(templates): add .agent/README.md router template"
```

---

### Task 6: Write `templates/.agent/profile.json.tmpl`

**Files:**
- Create: `templates/.agent/profile.json.tmpl`

- [ ] **Step 1: Write the profile template**

```json
{
  "frameworkVersion": "{{FRAMEWORK_VERSION}}",
  "project": {
    "name": "{{PROJECT_NAME}}",
    "stack": {
      "nextVersion": "{{NEXT_VERSION}}",
      "stateLib": "{{STATE_LIB}}",
      "i18nLib": "{{I18N_LIB}}",
      "uiPackage": "{{UI_PACKAGE}}"
    }
  },
  "paths": {
    "frameworkRoot": "{{FRAMEWORK_ROOT}}",
    "profileRoot": ".agent",
    "extractRoot": "_extract"
  },
  "mcp": {
    "figmaEnv": ".env.figma",
    "confluenceEnv": ".env.confluence"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add templates/.agent/profile.json.tmpl
git commit -m "feat(templates): add profile.json template"
```

---

### Task 7: Write `templates/.agent/context/*.md.tmpl` (4 files)

**Files:**
- Create: `templates/.agent/context/01-stack.md.tmpl`
- Create: `templates/.agent/context/02-architecture.md.tmpl`
- Create: `templates/.agent/context/03-conventions.md.tmpl`
- Create: `templates/.agent/context/04-env.md.tmpl`

- [ ] **Step 1: Write `01-stack.md.tmpl`**

```md
# Stack

- **Framework**: Next.js {{NEXT_VERSION}} (App Router)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS + Shadcn UI
- **State**: {{STATE_LIB}}
- **i18n**: {{I18N_LIB}}
- **Shared UI package**: `{{UI_PACKAGE}}`
- **Forms**: react-hook-form

Fill in any non-obvious runtime requirements below (Node version, package manager, deploy target).

- Node version: <fill>
- Package manager: <pnpm | yarn | npm>
- Deploy target: <vercel | docker | k8s | other>
```

- [ ] **Step 2: Write `02-architecture.md.tmpl`**

```md
# Architecture

## Folder layout
<fill with the top-level src layout, e.g.:>
- `apps/client/src/app/(protected)/` — authenticated pages
- `apps/client/src/hooks/` — app-specific hooks
- `packages/shared/ui/` — shared design system

## Routing
- App Router file-based. Route groups in parentheses (`(protected)`) do not affect URL.
- Server components by default; mark `'use client'` explicitly where hooks are used.

## State
<fill: RTK Query setup location, store boundary, middleware>

## Import aliases
- `@/` → `apps/client/src`
- `{{UI_PACKAGE}}` → `packages/shared/ui`
- `@shared/utils` → `packages/shared/utils`
- `@shared/store` → `packages/shared/store`
- `@shared/types` → `packages/shared/types`
```

- [ ] **Step 3: Write `03-conventions.md.tmpl`**

```md
# Conventions

## File naming
- Components: PascalCase, one component per file (`{Feature}ListPage.tsx`).
- Hooks: camelCase starting with `use` (`usePageTableState.ts`).
- Types: `{feature}.type.ts`. API slice: `{feature}-api.ts`.

## Folder layout per feature
```
app/(protected)/<feature>/
├── page.tsx                 (or list/detail/create under subroutes)
├── components/              feature-scoped components
├── hooks/                   feature-scoped hooks (app-local)
└── types.ts                 feature-scoped types if small
```

## i18n
- All visible strings go through `t('<FEATURE>.<KEY>')`.
- Catalog location: <fill path to `en.json` / `vi.json`>.
- Never inline Vietnamese or English strings in JSX.

## Commit style
- Conventional Commits. `feat(<feature>): …`, `fix(<feature>): …`, `chore: …`.
```

- [ ] **Step 4: Write `04-env.md.tmpl`**

```md
# Environment

## MCP credentials (gitignored)
- `.env.figma` — `FIGMA_TOKEN` for REST API fallback.
- `.env.confluence` — `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`.

## i18n catalogs
- <fill paths to translation JSON files>

## API base URL
- Dev:  <fill>
- Prod: <fill>
```

- [ ] **Step 5: Commit**

```bash
git add templates/.agent/context/
git commit -m "feat(templates): add .agent/context/*.md templates"
```

---

### Task 8: Write `templates/.agent/ui/*.md.tmpl` (non-component files)

**Files:**
- Create: `templates/.agent/ui/01-tokens.md.tmpl`
- Create: `templates/.agent/ui/02-hooks.md.tmpl`
- Create: `templates/.agent/ui/03-utilities.md.tmpl`
- Create: `templates/.agent/ui/04-types.md.tmpl`

Content source: migrate from `design-to-code/workflow.md` sections "Shared Hooks", "Shared Utilities", "Shared Types & Constants". Tokens is new content (skeleton for users to fill).

- [ ] **Step 1: Write `01-tokens.md.tmpl`**

```md
# UI Tokens

> Rule: every color, spacing, radius, and type ramp used in code MUST map to an entry here. If a Figma value has no token, add it here first.

## Colors
<fill from tailwind-preset.ts + globals.css. Example row:>
| Token | Value | Tailwind class | Notes |
|---|---|---|---|
| `primary` | `#2563eb` | `bg-primary text-primary` | CTA |
| `muted-foreground` | `#64748b` | `text-muted-foreground` | Secondary text |

## Spacing
Tailwind default scale unless overridden.
| Token | px | Class |
|---|---|---|
| 1 | 4 | `p-1` |
| 2 | 8 | `p-2` |
| 4 | 16 | `p-4` |

## Radii
<fill>

## Typography
<fill: font families, weight ramps, size ramps, and their Tailwind classes>
```

- [ ] **Step 2: Write `02-hooks.md.tmpl`**

Reference: `design-to-code/workflow.md` section "Shared Hooks" (`@shared/utils/hooks` and `@/hooks`).

```md
# Shared Hooks

## `@shared/utils/hooks`

| Hook | Purpose |
|---|---|
| `useRowNavigation` | Click handler for table row → detail page navigation |
| `useTabUrl` | Syncs active tab with URL search params |
| `useDebounce` | Debounces a value (used internally by DataTable search) |
| `useFileUpload` | File upload logic with progress tracking |
| `useDeferredUpload` | Deferred upload (after form submit) |
| `useCountdownTimer` | Countdown (OTP resend) |
| `useUnsavedChanges` | Warn on navigating away from unsaved form |
| `useSidebar` | Sidebar open/close state |

## `@/hooks` (app-specific)

| Hook | Purpose |
|---|---|
| `usePageTableState` | Pagination + filters + search for server-side DataTable |
| `useQueryError` | Standardized error/not-found rendering for {{STATE_LIB}} |
| `usePermission` | Check user permissions for conditional UI |
| `useConsumeNavFilters` | Consume one-time navigation filters from URL params |
```

- [ ] **Step 3: Write `03-utilities.md.tmpl`**

Reference: `design-to-code/workflow.md` section "Shared Utilities".

```md
# Shared Utilities

## Formatting (`@shared/utils/format`)

| Function | Purpose | Example |
|---|---|---|
| `formatVND` | Vietnamese currency | `1.234.567 đ` |
| `formatCurrency` | Generic currency | `1,234,567` |
| `formatNumber` | Number with separators | `1,234` |
| `formatPercentage` | Percentage display | `85%` |
| `formatPhoneNumber` | Phone | `0912 345 678` |
| `formatFileSize` | Bytes → human | `1.5 GB` |
| `formatMBSize` | MB → human | `512 MB` |
| `formatDuration` | Seconds → readable | `2h 30m` |
| `truncateText` | Truncate w/ ellipsis | `Long text...` |
| `getInitials` | Name → initials | `NT` |
| `maskEmail` | Mask email | `n***@gmail.com` |

## Date (`@shared/utils/dateUtils`)

| Function | Purpose |
|---|---|
| `formatDate` | Format date (default `dd/MM/yyyy`) |
| `formatDateRange` | Range formatter |
| `formatUtcDate` | Parse UTC string + format |
| `formatLastReply` | Relative time (e.g. "2 giờ trước") |
| `daysBetween` | Days between two dates |
| `addBusinessDays` | Add working days |
| `isWorkday` | Check if date is workday |
```

- [ ] **Step 4: Write `04-types.md.tmpl`**

```md
# Shared Types & Constants (`@shared/types`)

| Export | Purpose |
|---|---|
| `DEFAULT_PAGINATION` | Default pageSize (used by `usePageTableState`) |
| `StatusEnum` | Generic Active/Inactive |
| `OrderStatusEnum` | Order statuses |
| `PaymentStatusEnum` | Payment statuses |
| `TicketStatusEnum` | Ticket statuses |
| `InvoiceStatusEnum` | Invoice statuses |
| `phoneRegex` | Vietnamese phone validation |
| `passwordRegex` | Password strength validation |
| `API_ERROR_CODE` | Standard API error codes |

## Store / API (`@shared/store/api`)

| Export | Purpose |
|---|---|
| `ApiListResponse<T>` | Paginated list response shape |
| `BaseQueryParams` | Standard query params (page, limit, search, sorts) |
| `getStatusCode` | Extract HTTP status from {{STATE_LIB}} error |
```

- [ ] **Step 5: Commit**

```bash
git add templates/.agent/ui/01-tokens.md.tmpl templates/.agent/ui/02-hooks.md.tmpl templates/.agent/ui/03-utilities.md.tmpl templates/.agent/ui/04-types.md.tmpl
git commit -m "feat(templates): add .agent/ui non-component templates"
```

---

### Task 9: Write `templates/.agent/ui/components/*.md.tmpl` (9 category files)

**Files:**
- Create: `templates/.agent/ui/components/data-display.md.tmpl`
- Create: `templates/.agent/ui/components/forms.md.tmpl`
- Create: `templates/.agent/ui/components/dialogs.md.tmpl`
- Create: `templates/.agent/ui/components/selects.md.tmpl`
- Create: `templates/.agent/ui/components/dates.md.tmpl`
- Create: `templates/.agent/ui/components/layout.md.tmpl`
- Create: `templates/.agent/ui/components/media.md.tmpl`
- Create: `templates/.agent/ui/components/editor.md.tmpl`
- Create: `templates/.agent/ui/components/primitives.md.tmpl`

Format for every entry (keep consistent for grep-ability):

```md
## <ComponentName>

- **Path**: `<import path>`
- **Use when**: <one-line purpose>
- **Key props**: <comma-separated>
- **Notes**: <optional, e.g. "server-side: manualPagination={true}">
- **Pattern**: <optional link to patterns/*.md>
```

Source mapping (from `design-to-code/workflow.md`):
- `data-display.md` ← Step 4 "UI Components" (DataTable, StatusBadge, EntityHeaderCard, SectionHeader, StringStatusBadge, NumericStatusBadge, Spinner, StorageUsageBar, StorageUsageRing, InfoTooltip, SimpleTooltip)
- `forms.md` ← Step 4 "Form Components"
- `dialogs.md` ← Step 4 "Custom Dialog Components"
- `selects.md` ← Step 4 "Select Components"
- `dates.md` ← Step 4 "Date/Time Components"
- `layout.md` ← Step 4: PageTabs, Tabs, Stepper, Breadcrumb, Drawer, Separator, Card, ScrollArea, Accordion
- `media.md` ← Step 4: AvatarUpload, AttachmentList, FileUploadDialog, ImageViewer, Avatar
- `editor.md` ← Step 4: TextEditor, TextEditorRender
- `primitives.md` ← Step 4 "Shadcn Primitives" remainder (Button, Input, Textarea, Checkbox, Switch, Badge, Skeleton, Popover, Label, InputOTP, AlertDialog-low-level, ColorPicker, RadioGroup, DropdownMenu)

- [ ] **Step 1: Write `data-display.md.tmpl`**

```md
# Components — Data Display

## DataTable
- **Path**: `{{UI_PACKAGE}}/components/table`
- **Use when**: primary content is a data grid (list pages)
- **Key props**: `data`, `columns`, `loading`, `pagination`, `onPaginationChange`, `onRowClick`
- **Notes**: Server-side → `manualPagination={true}` + `usePageTableState`; client-side → omit `manualPagination` and pass full dataset.
- **Pattern**: `patterns/02-list-page.md`

## StringStatusBadge
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: render a status as a colored text badge
- **Key props**: `status`, `variant`

## NumericStatusBadge
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: render a numeric status code as a badge
- **Key props**: `code`, `variant`

## SectionHeaderCard
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: section header with blue accent

## SectionHeader
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: plain section header

## EntityHeaderCard
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: summary card with icon at the top of a detail page

## Spinner
- **Path**: `{{UI_PACKAGE}}/components/Spinner`
- **Use when**: loading state indicator

## StorageUsageBar
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: resource usage shown as a horizontal bar

## StorageUsageRing
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: resource usage shown as a ring / donut

## InfoTooltip
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: info icon with explanatory tooltip

## SimpleTooltip
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: hover tooltip on any element

## Field
- **Path**: `@/app/(protected)/components`
- **Use when**: read-only key-value row on a detail page

## ServiceStatus
- **Path**: `@/app/(protected)/components`
- **Use when**: service status badge (Active/Suspended/etc.)

## ProgressStepper
- **Path**: `@/app/(protected)/components`
- **Use when**: multi-step progress indicator
```

- [ ] **Step 2: Write `forms.md.tmpl`**

```md
# Components — Forms (react-hook-form)

All form components live under `{{UI_PACKAGE}}/components/form`. Each wraps a shared primitive and integrates with `useForm` via `control`/`name`.

## TextField
- **Path**: `{{UI_PACKAGE}}/components/form`
- **Use when**: text/email/url input inside a form
- **Key props**: `name`, `label`, `control`, `type`

## TextareaField
- **Use when**: multi-line text input in a form

## NumberField
- **Use when**: numeric input in a form

## PasswordField
- **Use when**: password with show/hide toggle

## PhoneField
- **Use when**: simple Vietnamese phone input

## PhoneNumberField
- **Use when**: international phone input with country selector

## DropdownForm
- **Use when**: single-select dropdown bound to form state

## MultiDropdownForm
- **Use when**: multi-select dropdown bound to form state

## TreeSelectForm
- **Use when**: hierarchical single-select in a form

## MultiTreeSelectForm
- **Use when**: hierarchical multi-select in a form

## SwitchForm
- **Use when**: boolean toggle inside a form

## CheckboxForm
- **Use when**: checkbox inside a form

## DateTimePickerForm
- **Use when**: datetime picker inside a form

## TabForm
- **Use when**: tab-based selection inside a form
```

- [ ] **Step 3: Write `dialogs.md.tmpl`**

```md
# Components — Dialogs (custom-dialog)

All under `{{UI_PACKAGE}}/components/custom-dialog`. Prefer these over low-level Shadcn primitives.

## AlertDialog
- **Use when**: confirm/cancel modal
- **Key props**: `open`, `onOpenChange`, `onConfirm`, `title`, `description`

## Dialog
- **Use when**: generic content modal
- **Key props**: `open`, `onOpenChange`, `title`

## FormDialog
- **Use when**: react-hook-form inside a modal
- **Key props**: `open`, `onOpenChange`, `onSubmit`, `defaultValues`
```

- [ ] **Step 4: Write `selects.md.tmpl`**

```md
# Components — Selects

All under `{{UI_PACKAGE}}/components/select`. For forms, use the `*Form` wrappers in `ui/components/forms.md`.

## Dropdown
- **Use when**: single-select dropdown
- **Key props**: `value`, `onChange`, `options: SelectableItem[]`

## MultiDropdown
- **Use when**: multi-select dropdown
- **Key props**: `values`, `onChange`, `options`

## TreeSelect
- **Use when**: single-select hierarchical tree

## MultiTreeSelect
- **Use when**: multi-select hierarchical tree
```

- [ ] **Step 5: Write `dates.md.tmpl`**

```md
# Components — Date/Time

All under `{{UI_PACKAGE}}/components/dates`.

## DateTimePicker
- **Use when**: full datetime selection

## DateRangePicker
- **Use when**: start/end date range

## DateRangeInput
- **Use when**: inline date range input

## TimePicker
- **Use when**: hours/minutes selection

## MonthYearPicker
- **Use when**: month + year only
```

- [ ] **Step 6: Write `layout.md.tmpl`**

```md
# Components — Layout

## PageTabs + PageTabsContent
- **Path**: `{{UI_PACKAGE}}/components/PageTabs`
- **Use when**: top-level tabs on a detail page
- **Pattern**: `patterns/03-detail-page.md`

## Tabs + TabsContent
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: content-level tabs (not top-level)

## Stepper + StepperContent
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: multi-step wizard flow

## Breadcrumb
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: breadcrumb navigation

## Drawer
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: side panel / slide-over

## PageContent
- **Path**: `@/app/(protected)/components`
- **Use when**: standard page content wrapper
```

- [ ] **Step 7: Write `media.md.tmpl`**

```md
# Components — Media

## AvatarUpload
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: upload user avatar

## AttachmentList
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: list of uploaded attachments with download/preview

## FileUploadDialog
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: modal for uploading files

## ImageViewer
- **Path**: `{{UI_PACKAGE}}/components`
- **Use when**: image lightbox / gallery viewer
```

- [ ] **Step 8: Write `editor.md.tmpl`**

```md
# Components — Rich Text Editor

## TextEditor
- **Path**: `{{UI_PACKAGE}}/components/text-editor`
- **Use when**: WYSIWYG editor in a form

## TextEditorRender
- **Path**: `{{UI_PACKAGE}}/components/text-editor`
- **Use when**: read-only render of editor output
```

- [ ] **Step 9: Write `primitives.md.tmpl`**

```md
# Components — Shadcn Primitives

Under `{{UI_PACKAGE}}/shadcn-components`. Use these only when nothing in the other category files fits.

| Component | File | Common use |
|---|---|---|
| `Button` | `button` | All buttons |
| `Input` | `input` | Text input outside forms |
| `Textarea` | `textarea` | Multi-line input outside forms |
| `Checkbox` | `checkbox` | Standalone checkbox |
| `Switch` | `switch` | Toggle switch |
| `Badge` | `badge` | Small label badge |
| `Card` | `card` | Card container |
| `Skeleton` | `skeleton` | Loading placeholder |
| `Separator` | `separator` | Horizontal/vertical divider |
| `Accordion` | `accordion` | Collapsible sections |
| `Avatar` | `avatar` | User avatar |
| `ScrollArea` | `scroll-area` | Custom scrollable container |
| `Popover` | `popover` | Floating content |
| `Label` | `label` | Form label |
| `InputOTP` | `input-otp` | OTP input |
| `ColorPicker` | `color-picker` | Color selection |
| `RadioGroup` | `radio-group` | Radio button group |
| `DropdownMenu` | `dropdown-menu` | Kebab / action menu |
| `AlertDialog` | `alert-dialog` | Low-level alert (prefer `custom-dialog/AlertDialog`) |
```

- [ ] **Step 10: Commit**

```bash
git add templates/.agent/ui/components/
git commit -m "feat(templates): add component registry split by category"
```

---

### Task 10: Write `templates/.agent/patterns/*.md.tmpl` (5 files)

**Files:**
- Create: `templates/.agent/patterns/01-page-shell.md.tmpl`
- Create: `templates/.agent/patterns/02-list-page.md.tmpl`
- Create: `templates/.agent/patterns/03-detail-page.md.tmpl`
- Create: `templates/.agent/patterns/04-form-page.md.tmpl`
- Create: `templates/.agent/patterns/05-data-layer.md.tmpl`

Source: `design-to-code/workflow.md` Step 5 (6a/6b/6c) and Step 3.

- [ ] **Step 1: Write `01-page-shell.md.tmpl`**

```md
# Pattern — Page Shell

Every page must render these three states in order: loading → error → content.

```tsx
import { Spinner } from '{{UI_PACKAGE}}/components/Spinner'
import { useQueryError } from '@/hooks/useQueryError'

if (isLoading) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-108px)]">
      <Spinner />
    </div>
  )
}

const { renderError } = useQueryError({ error, hasData: !!data, notFoundKey: '{FEATURE}.NOT_FOUND' })
const errorElement = renderError()
if (errorElement) return errorElement

return <div className="space-y-4 p-6">{/* content */}</div>
```

Rules:
- Never return `null` for loading/error — always render the Spinner or error element.
- The root content wrapper uses `space-y-4 p-6` unless the spec says otherwise.
```

- [ ] **Step 2: Write `02-list-page.md.tmpl`**

```md
# Pattern — List Page (DataTable)

Two modes. Detect from the spec: paginated API → server-side; small local dataset → client-side.

## Server-side

Required shape:
- Response: `ApiListResponse<T>` from `@shared/store/api` (`items`, `total`, `totalPages`, `page`, `limit`).
- State: `usePageTableState()` from `@/hooks/usePageTableState`.
- Pass `baseQueryParams` to the query hook. The API returns pre-sliced data.

```tsx
'use client'

import { DataTable, type TableColumn } from '{{UI_PACKAGE}}/components/table'
import { usePageTableState } from '@/hooks/usePageTableState'
import { useRowNavigation } from '@shared/utils/hooks'
import type { ApiListResponse } from '@shared/store/api'

export default function {Feature}ListPage() {
  const { t } = useTranslation()
  const { pagination, setPagination, columnFilters, handleColumnFiltersChange,
          handleGlobalFilterChange, baseQueryParams } = usePageTableState()
  const handleRowClick = useRowNavigation('/{features}')

  const { data, isLoading, isFetching } = useGet{Feature}sQuery(baseQueryParams)
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages

  const columns: TableColumn<{Feature}>[] = useMemo(() => [
    { accessorKey: 'field', header: t('{FEATURE}.FIELD'), cell: ({ row }) => <span>{row.original.field}</span> },
  ], [t])

  return (
    <DataTable
      data={items}
      columns={columns}
      loading={isLoading || isFetching}
      pagination={{ ...pagination, totalPages, totalRows: total }}
      onPaginationChange={setPagination}
      onRowClick={handleRowClick}
      className="border-0"
      paginationClassName="border-0 shadow-none"
    />
  )
}
```

Key rules:
- `pagination={{ ...pagination, totalPages, totalRows: total }}` — spread; do NOT compute `Math.ceil` manually.
- Do NOT slice data on the client — the API returns only the current page.

## Client-side

```tsx
<DataTable
  data={allItems}
  columns={columns}
  loading={isLoading}
  showPagination={false}
  manualFiltering={false}
  manualPagination={false}
  globalFilterPlaceholder={t('SEARCH_PLACEHOLDER')}
/>
```

## Toolbar: filter vs search
Independent flags: `enableGlobalFilter` (search), `enableFilterData` + `filterConfigs` (filters).
- Filter only: `enableFilterData` + `filterConfigs` + `enableGlobalFilter={false}`
- Search only: `enableGlobalFilter` (default)
- Both: all three set
```

- [ ] **Step 3: Write `03-detail-page.md.tmpl`**

```md
# Pattern — Detail Page (Tabs)

```tsx
'use client'

import { PageTabs, PageTabsContent } from '{{UI_PACKAGE}}/components/PageTabs'
import { useTabUrl } from '@shared/utils/hooks'
import dynamic from 'next/dynamic'

const GeneralInfo = dynamic(() => import('../components/GeneralInfo'))
const ConfigTab = dynamic(() => import('../components/ConfigTab'))

export default function {Feature}DetailPage() {
  const { t } = useTranslation()
  const { activeTab, setActiveTab } = useTabUrl({ defaultTab: 'general', paramName: 'tab' })

  const tabs = useMemo(() => [
    { value: 'general', label: t('{FEATURE}.TAB_GENERAL') },
    { value: 'config',  label: t('{FEATURE}.TAB_CONFIG')  },
  ], [t])

  return (
    <div className="space-y-6 p-6">
      <PageTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab}>
        <PageTabsContent value="general"><GeneralInfo data={data} loading={isFetching} /></PageTabsContent>
        <PageTabsContent value="config"><ConfigTab id={id} /></PageTabsContent>
      </PageTabs>
    </div>
  )
}
```

Rules:
- Tab content components use `dynamic()` to code-split.
- Sync tab state to the URL via `useTabUrl`.
```

- [ ] **Step 4: Write `04-form-page.md.tmpl`**

```md
# Pattern — Form Page

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { TextField, DropdownForm } from '{{UI_PACKAGE}}/components/form'
import { Button } from '{{UI_PACKAGE}}/shadcn-components/button'

type {Feature}FormValues = { name: string; status: string }

export default function {Feature}FormPage() {
  const { t } = useTranslation()
  const { control, handleSubmit, formState } = useForm<{Feature}FormValues>({
    defaultValues: { name: '', status: 'active' },
  })
  const [create{Feature}, { isLoading }] = useCreate{Feature}Mutation()

  const onSubmit = handleSubmit(async (values) => {
    await create{Feature}(values).unwrap()
    // navigate / toast
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-6">
      <TextField control={control} name="name" label={t('{FEATURE}.NAME')} rules={{ required: true }} />
      <DropdownForm control={control} name="status" label={t('{FEATURE}.STATUS')} options={STATUS_OPTIONS} />
      <Button type="submit" disabled={isLoading || !formState.isValid}>
        {t('COMMON.SUBMIT')}
      </Button>
    </form>
  )
}
```

Rules:
- Use `{{UI_PACKAGE}}/components/form` wrappers, not raw inputs, inside forms.
- Guard submission with `formState.isValid` and the mutation's `isLoading`.
- For unsaved-changes warning, wrap with `useUnsavedChanges`.
```

- [ ] **Step 5: Write `05-data-layer.md.tmpl`**

```md
# Pattern — Data Layer

Rule: always create the data layer BEFORE writing any UI component.

## Files, in order
1. `{feature}.type.ts`   — entity + request/response types
2. `{feature}-api.ts`    — {{STATE_LIB}} endpoints and tag types
3. `hooks/use{Feature}.ts` — thin wrappers around generated hooks

## Example: RTK Query

```ts
// {feature}.type.ts
export type {Feature} = { id: string; name: string; status: 'active' | 'inactive' }
export type Create{Feature}Input = Omit<{Feature}, 'id'>

// {feature}-api.ts
import { createApi } from '@reduxjs/toolkit/query/react'
import type { ApiListResponse, BaseQueryParams } from '@shared/store/api'
import type { {Feature}, Create{Feature}Input } from './{feature}.type'

export const {feature}Api = createApi({
  reducerPath: '{feature}Api',
  baseQuery: /* your baseQuery */,
  tagTypes: ['{Feature}'],
  endpoints: (builder) => ({
    get{Feature}s: builder.query<ApiListResponse<{Feature}>, BaseQueryParams>({
      query: (params) => ({ url: '/v1/{features}', params }),
      providesTags: ['{Feature}'],
    }),
    get{Feature}: builder.query<{Feature}, string>({
      query: (id) => ({ url: `/v1/{features}/${id}` }),
      providesTags: (_r, _e, id) => [{ type: '{Feature}', id }],
    }),
    create{Feature}: builder.mutation<{Feature}, Create{Feature}Input>({
      query: (body) => ({ url: '/v1/{features}', method: 'POST', body }),
      invalidatesTags: ['{Feature}'],
    }),
  }),
})

export const {
  useGet{Feature}sQuery,
  useGet{Feature}Query,
  useCreate{Feature}Mutation,
} = {feature}Api
```
```

- [ ] **Step 6: Commit**

```bash
git add templates/.agent/patterns/
git commit -m "feat(templates): add patterns templates (page-shell, list, detail, form, data-layer)"
```

---

### Task 11: Write `templates/.agent/checklists/*.md.tmpl` (2 files)

**Files:**
- Create: `templates/.agent/checklists/dod-feature.md.tmpl`
- Create: `templates/.agent/checklists/dod-component.md.tmpl`

- [ ] **Step 1: Write `dod-feature.md.tmpl`**

```md
# DoD — Feature

Mark every box before claiming done.

- [ ] Feature requirements from spec mapped to types, API endpoints, hooks
- [ ] Data layer created BEFORE UI (types → api → hooks)
- [ ] Each UI section is its own component file
- [ ] Loading + error states follow `patterns/01-page-shell.md`
- [ ] Business rules from spec implemented (not just visual)
- [ ] All colors / spacing / radii / typography map to `ui/01-tokens.md`
- [ ] No inline strings — every visible label goes through `t(...)`
- [ ] i18n keys added to the catalogs listed in `context/04-env.md`
- [ ] Responsive layout applied where the spec requires
- [ ] `07-verify.md` run (typecheck + lint pass with no new errors)
- [ ] Tests added if the user requested TDD
- [ ] Commit messages follow Conventional Commits
```

- [ ] **Step 2: Write `dod-component.md.tmpl`**

```md
# DoD — Component

- [ ] One component per file, named in PascalCase
- [ ] Props typed; no `any`
- [ ] Uses tokens from `ui/01-tokens.md` only
- [ ] Reuses existing shared components where possible (greppped `ui/components/`)
- [ ] Accessible: labels associated, keyboard focusable, ARIA roles where relevant
- [ ] No hardcoded strings — all text from `t(...)`
- [ ] Added to `ui/components/<category>.md` if it becomes shared
```

- [ ] **Step 3: Commit**

```bash
git add templates/.agent/checklists/
git commit -m "feat(templates): add DoD checklists"
```

---

### Task 12: Write `skills/00-router.md`

**Files:**
- Create: `skills/00-router.md`

- [ ] **Step 1: Write the router**

```md
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

## Chains
- **TC chain**: `02-extract-context → 03-plan-feature → 04-scaffold-data → 05-transform-code → 07-verify`
- **EC standalone**: `02-extract-context` only; no implementation.
- **Bug fix** (no trigger): if user says "fix bug X", load `03-plan-feature` first unless user says "skip plan"; after implementation, load `07-verify` and add a regression test only if user asked for TDD.

## Brainstorm gate
On vague or complex requests, the agent asks: "Bạn muốn brainstorm trước không? (yes/no)". Only load `01-brainstorm.md` on `yes`.

## Hard gates (mirror `AGENTS.md`)
1. No code before a plan (unless "skip plan").
2. No hardcoded design tokens.
3. Grep `.agent/ui/components/` before building a new shared component.
4. Data layer before UI.
```

- [ ] **Step 2: Commit**

```bash
git add skills/00-router.md
git commit -m "feat(skills): add 00-router"
```

---

### Task 13: Write `skills/01-brainstorm.md`

**Files:**
- Create: `skills/01-brainstorm.md`

- [ ] **Step 1: Write the skill**

```md
---
id: 01-brainstorm
trigger: opt-in on vague or complex requests
requires: []
---

# Brainstorm

Invoke ONLY after the user answered "yes" to "Brainstorm trước không?".

## Preconditions
- User opted in.
- You have not started writing code for this task.

## Steps
1. Read the user's request literally. Restate it back in 1-2 sentences and ask for confirmation.
2. Ask clarifying questions ONE AT A TIME. Multiple-choice when possible.
3. Cover in order: purpose → users → success criteria → constraints → unknowns.
4. When uncertainty remains about UI shape, ask for a Figma URL or an ASCII mock.
5. Propose 2-3 approaches with trade-offs. Recommend one.
6. On approval, summarise the confirmed design in ≤ 200 words.
7. Hand off to `03-plan-feature.md`.

## Output
- A short design summary saved under `_extract/<task-id>/design.md`.

## Verification
- [ ] User explicitly approved the summary.
- [ ] Summary fits in one screen (≤ 200 words).
- [ ] All open questions are resolved or explicitly marked "deferred".
```

- [ ] **Step 2: Commit**

```bash
git add skills/01-brainstorm.md
git commit -m "feat(skills): add 01-brainstorm"
```

---

### Task 14: Write `skills/02-extract-context.md`

**Files:**
- Create: `skills/02-extract-context.md`

Migration source: `design-to-code/workflow.md` Step 1a–1e (parse inputs, Figma extract, Figma REST fallback, Confluence extract, `_extract/` convention).

- [ ] **Step 1: Write the skill**

```md
---
id: 02-extract-context
trigger: "EC <figma-url> [<figma-url> ...] [spec=<confluence-url>] [<target-folder>]"
requires: []
---

# Extract Context (EC)

Pull Figma design context (and optional Confluence spec) into the project's extract folder.

## Preconditions
- `~/.erp-agent/lib/figma_mcp_client.js` exists.
- Figma Desktop MCP Server running at `http://127.0.0.1:3845/mcp`.
- If `spec=<url>` is given: `.env.confluence` present with `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN`.
- A task id is known (ask the user if not; example: `ERP-1318`).

## Steps
1. Parse the trigger: collect one or more Figma URLs and an optional `spec=<confluence-url>` and optional target folder. If labels are provided (`list=<url>`), keep them; otherwise auto-derive from Figma node names.
2. Create `_extract/<task-id>/` at the project root. Add `_extract/` to `.gitignore` if not already.
3. For each Figma URL, write an ES module scratch script `_extract/<task-id>/extract_figma_<label>.mjs` that imports `FigmaMCPClient` from `~/.erp-agent/lib/figma_mcp_client.js`, calls `getFullDesign({ url })`, and writes: `designContext.txt`, `metadata.xml`, `screenshot.png`.
4. Verify pixel details: call Figma REST `https://api.figma.com/v1/files/<fileKey>/nodes?ids=<nodeId>` with `X-Figma-Token` from `.env.figma`. Walk the tree and extract `absoluteBoundingBox`, `layoutMode`, `itemSpacing`, `padding*`, `cornerRadius`, `fills`, `strokes`, `style.font*`, `characters`, `type==='LINE'`, `componentProperties`. Save to `figma_tree.txt`.
5. If MCP/REST returns 429: fallback order is (a) direct REST with token, (b) analyze `screenshot.png` via vision, (c) reuse cached `figma_tree.txt`, (d) fetch child nodes incrementally.
6. If `spec=<url>` given: write `_extract/<task-id>/extract_spec.mjs` that loads `.env.confluence`, imports `ConfluenceMCPClient` from `~/.erp-agent/lib/confluence_mcp_client.js`, calls `getPageAsMarkdown(url)` (or `getMultiplePagesAsMarkdown` for multiple), writes `spec.md`.
7. Run the scratch scripts from the extract folder; clean them up afterwards if you wish.
8. Summarise what was extracted (component list, tokens found, screens + node ids, spec sections) for the user. If requirements are provided, also produce an extracted-requirements table (API endpoints, data model, business rules, user actions, states).

## Output
- `_extract/<task-id>/designContext.txt`
- `_extract/<task-id>/metadata.xml`
- `_extract/<task-id>/screenshot.png`
- `_extract/<task-id>/figma_tree.txt`
- `_extract/<task-id>/spec.md` (if spec provided)

## Verification
- [ ] All expected output files exist and are non-empty.
- [ ] No Figma color or typography was summarised without a matching entry in `.agent/ui/01-tokens.md`; missing tokens are flagged.
- [ ] A human-readable summary was returned to the user.
```

- [ ] **Step 2: Commit**

```bash
git add skills/02-extract-context.md
git commit -m "feat(skills): add 02-extract-context"
```

---

### Task 15: Write `skills/03-plan-feature.md`

**Files:**
- Create: `skills/03-plan-feature.md`

- [ ] **Step 1: Write the skill**

```md
---
id: 03-plan-feature
trigger: "PL (or implicit before any code)"
requires: ["02-extract-context (optional)", "06-fetch-spec (optional)"]
---

# Plan Feature (PL)

Produce a written implementation plan before code.

## Preconditions
- If a Figma/spec extraction exists, its artifacts are in `_extract/<task-id>/`.
- The feature's target folder is known (ask the user if unclear).

## Steps
1. Determine the page archetype(s): **List**, **Detail**, or **Form** (see `.agent/patterns/`). Signals: data grid → List; tabbed sections → Detail; input fields → Form.
2. Decide shared data layer: if multiple screens touch the same entity, one data layer serves all.
3. Draft a file plan grouped as (a) data layer, (b) per-screen page, (c) page-scoped components. List exact paths.
4. For each file, write one-line responsibility + key exports.
5. Map requirements → files: every spec requirement must point to a file. Flag gaps.
6. Propose task ordering: always `data-layer → screen shell → sub-components → wiring`.
7. List open questions for the user. Block on any that prevent correct implementation.
8. Save the plan to `_extract/<task-id>/plan.md`.

## Output
- `_extract/<task-id>/plan.md` containing: archetype, file plan, requirement map, task order, open questions.

## Verification
- [ ] Every file listed has a one-line responsibility.
- [ ] Every requirement in the spec maps to at least one file.
- [ ] No open question is left unassigned.
- [ ] The user approved the plan (or said "skip plan" explicitly).
```

- [ ] **Step 2: Commit**

```bash
git add skills/03-plan-feature.md
git commit -m "feat(skills): add 03-plan-feature"
```

---

### Task 16: Write `skills/04-scaffold-data.md`

**Files:**
- Create: `skills/04-scaffold-data.md`

- [ ] **Step 1: Write the skill**

```md
---
id: 04-scaffold-data
trigger: "SD or chained from TC"
requires: ["03-plan-feature"]
---

# Scaffold Data Layer (SD)

Create types, API slice, and hooks before any UI code.

## Preconditions
- Plan exists (`_extract/<task-id>/plan.md`) and names the feature.
- API endpoints are specified in the spec or provided by the user.
- `.agent/patterns/05-data-layer.md` is loaded.

## Steps
1. Create `{feature}.type.ts` with entity, request, and response types. Include enums referenced from `.agent/ui/04-types.md` when relevant.
2. Create `{feature}-api.ts` with the {{STATE_LIB}} slice: `tagTypes`, one endpoint per spec, `providesTags`/`invalidatesTags` set correctly. Re-export generated hooks.
3. Create `hooks/use{Feature}.ts` only if there is a non-trivial transform over the generated hooks. Otherwise skip.
4. If an enum belongs in `@shared/types` (reused beyond this feature), add it there and update `.agent/ui/04-types.md`.
5. Run typecheck for the data layer before moving on.

## Output
- Data layer files under the feature folder, compiling cleanly.

## Verification
- [ ] `tsc --noEmit` passes for the feature folder.
- [ ] No endpoint missing a tag strategy.
- [ ] All request/response types reflect the spec exactly.
```

- [ ] **Step 2: Commit**

```bash
git add skills/04-scaffold-data.md
git commit -m "feat(skills): add 04-scaffold-data"
```

---

### Task 17: Write `skills/05-transform-code.md`

**Files:**
- Create: `skills/05-transform-code.md`

- [ ] **Step 1: Write the skill**

```md
---
id: 05-transform-code
trigger: "TC <figma-url> [spec=<cf-url>] [target]"
requires: ["02-extract-context", "03-plan-feature", "04-scaffold-data"]
---

# Transform to Code (TC)

Implement the UI per the plan, reusing shared components and tokens.

## Preconditions
- Plan approved in `_extract/<task-id>/plan.md`.
- Data layer is in place (`04-scaffold-data` done).
- `.agent/ui/01-tokens.md` loaded.

## Steps
1. For each page in the plan, scaffold the file under the target folder using the matching pattern from `.agent/patterns/0[2-4]-*.md`. Wrap in `patterns/01-page-shell.md` (loading → error → content).
2. For each UI section on the page, create a separate component file under `<feature>/components/`.
3. For each component need, grep `.agent/ui/components/<category>.md` for an existing match BEFORE building. If found, import from its documented path. If not found, build it; if it is reusable, append to the matching category file.
4. Map every Figma style to a token in `.agent/ui/01-tokens.md`. If a token is missing, add it first, then use it. No inline hex, no arbitrary spacing values.
5. Every visible string goes through `t('<FEATURE>.<KEY>')`. Add missing keys to the catalogs named in `.agent/context/04-env.md`.
6. Wire business rules (visibility, permissions, conditional UI) from the spec — not just the visual.
7. Run `07-verify.md` before claiming done.

## Output
- Page files, section components, added tokens, added i18n keys.

## Verification
- [ ] Loading + error states present on every page.
- [ ] Zero hardcoded colors/spacing (grep: no raw hex in `.tsx`).
- [ ] Zero inline visible strings (grep: no Vietnamese/English outside `t(...)`).
- [ ] Every new shared component appended to the matching `.agent/ui/components/<category>.md`.
- [ ] `07-verify.md` passed.
```

- [ ] **Step 2: Commit**

```bash
git add skills/05-transform-code.md
git commit -m "feat(skills): add 05-transform-code"
```

---

### Task 18: Write `skills/06-fetch-spec.md`

**Files:**
- Create: `skills/06-fetch-spec.md`

- [ ] **Step 1: Write the skill**

```md
---
id: 06-fetch-spec
trigger: "CS <confluence-url> [<confluence-url> ...]"
requires: []
---

# Fetch Confluence Spec (CS)

## Preconditions
- `.env.confluence` with `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN`.
- Task id known.

## Steps
1. Create `_extract/<task-id>/` if missing.
2. Write `_extract/<task-id>/extract_spec.mjs` that loads `.env.confluence`, imports `ConfluenceMCPClient` from `~/.erp-agent/lib/confluence_mcp_client.js`, and calls:
   - single: `getPageAsMarkdown(url)`
   - multiple: `getMultiplePagesAsMarkdown([url1, url2])`
3. Save each page as `_extract/<task-id>/spec-<page-slug>.md` (or plain `spec.md` for single).
4. Summarise to the user: title, page id, sections present, extracted requirements table (API endpoints, data model, business rules, user actions, states). Ask for confirmation before any downstream work.

## Output
- `_extract/<task-id>/spec*.md` and a summary table.

## Verification
- [ ] Output files exist and are non-empty.
- [ ] Summary table presented to the user.
```

- [ ] **Step 2: Commit**

```bash
git add skills/06-fetch-spec.md
git commit -m "feat(skills): add 06-fetch-spec"
```

---

### Task 19: Write `skills/07-verify.md`

**Files:**
- Create: `skills/07-verify.md`

- [ ] **Step 1: Write the skill**

```md
---
id: 07-verify
trigger: "VF (or tail of any TC/SD chain)"
requires: []
---

# Verify (VF)

Evidence-based verification. Produce output; do not claim success from memory.

## Preconditions
- Changes are on disk (and ideally committed).

## Steps
1. Detect package manager from `.agent/context/01-stack.md` (pnpm / yarn / npm).
2. Run typecheck. Capture full output.
3. Run lint. Capture full output.
4. If the user asked for tests OR the task was a bug fix with a regression test: run tests. Capture output.
5. If any step fails, report the first failure with file path, line, and expected fix. Stop. Do not continue to other steps.
6. On success, paste the last 10 lines of each command's output as evidence.

## Output
- A report in the chat containing: commands run, exit codes, tail of output.

## Verification
- [ ] Typecheck exit 0.
- [ ] Lint exit 0 (or user explicitly approved a warning).
- [ ] If tests were run: exit 0.
```

- [ ] **Step 2: Commit**

```bash
git add skills/07-verify.md
git commit -m "feat(skills): add 07-verify"
```

---

### Task 20: Write `skills/08-code-review.md`

**Files:**
- Create: `skills/08-code-review.md`

- [ ] **Step 1: Write the skill**

```md
---
id: 08-code-review
trigger: "RV"
requires: []
---

# Code Review (RV)

Review the current diff against the plan and project conventions.

## Preconditions
- A diff exists (`git diff` or PR branch).

## Steps
1. Enumerate changed files. For each, list the purpose stated in the plan.
2. Check each file against:
   - Tokens (`.agent/ui/01-tokens.md`) — no hardcoded values.
   - Component reuse (`.agent/ui/components/*.md`) — grep for custom rewrites of existing components.
   - Conventions (`.agent/context/03-conventions.md`) — naming, folder layout, i18n.
   - DoD (`.agent/checklists/dod-feature.md`, `dod-component.md`).
3. Produce findings graded by severity:
   - **Blocker**: breaks build, contract violation, missing hard gate.
   - **Major**: convention violation, missed reuse, accessibility miss.
   - **Minor**: duplication, dead code, naming drift.
   - **Nit**: style-only.
4. For each finding, include file:line and a suggested patch (short diff or replacement snippet).
5. Never fix issues unless the user asks.

## Output
- A review report with sections per severity.

## Verification
- [ ] Every file in the diff is mentioned or explicitly declared "no issues".
- [ ] Every finding cites a file:line.
```

- [ ] **Step 2: Commit**

```bash
git add skills/08-code-review.md
git commit -m "feat(skills): add 08-code-review"
```

---

### Task 21: Write `skills/09-refactor-scan.md`

**Files:**
- Create: `skills/09-refactor-scan.md`

- [ ] **Step 1: Write the skill**

```md
---
id: 09-refactor-scan
trigger: "RF <path>"
requires: []
---

# Refactor Scan (RF)

Find duplication and propose refactor scope. Do NOT refactor.

## Preconditions
- `<path>` is a folder or file inside the project.

## Steps
1. For UI files in `<path>`: search for raw hex/rgb colors, arbitrary Tailwind values (`text-[...]`, `p-[...]`), inline strings, duplicated JSX shapes.
2. For components: detect near-duplicates (≥ 70% similar props + layout). Propose consolidation into an existing or new shared component; suggest the target category file in `.agent/ui/components/`.
3. For hooks: detect common patterns (`useEffect` + fetch, manual debounce). Suggest using existing shared hooks from `.agent/ui/02-hooks.md`.
4. Group findings by file. For each: severity (high/med/low), proposal, estimated scope (files touched, LOC delta).
5. If findings exceed ~20 items, group into 3-5 focused refactor proposals the user can tackle separately.

## Output
- A refactor report with grouped proposals and effort estimates. Nothing on disk is changed.

## Verification
- [ ] No code edited during scan.
- [ ] Every proposal cites file:line of the duplication.
- [ ] Proposals reference existing shared components/hooks when applicable.
```

- [ ] **Step 2: Commit**

```bash
git add skills/09-refactor-scan.md
git commit -m "feat(skills): add 09-refactor-scan"
```

---

### Task 22: Update top-level `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite `README.md`**

```md
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
| `RV` | code review |
| `RF` | refactor scan |

Brainstorming is opt-in; the agent asks before running it.

## Contributing

Edit `skills/`, `templates/`, or `lib/` and submit a PR. Bump the CLI version in `bin/erp-agent`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for framework usage"
```

---

### Task 23: Smoke test the CLI in a scratch directory

**Files:**
- (temporary) `/tmp/erp-agent-smoke/`

- [ ] **Step 1: Point the framework at this repo and run init**

```bash
rm -rf /tmp/erp-agent-smoke
mkdir -p /tmp/erp-agent-smoke
cd /tmp/erp-agent-smoke
/Users/thienpham/Downloads/erp-agent/bin/erp-agent init <<'EOF'
smoke-project
14
rtk-query
react-i18next
@shared/ui
EOF
```

Expected: script prints `✅ Profile written to /tmp/erp-agent-smoke/.agent/` and `✅ AGENTS.md written to /tmp/erp-agent-smoke/AGENTS.md`.

- [ ] **Step 2: Verify structure**

```bash
find /tmp/erp-agent-smoke -maxdepth 3 -type f | sort
```

Expected listing (at minimum):
- `/tmp/erp-agent-smoke/AGENTS.md`
- `/tmp/erp-agent-smoke/.agent/README.md`
- `/tmp/erp-agent-smoke/.agent/profile.json`
- `/tmp/erp-agent-smoke/.agent/context/01-stack.md`
- `/tmp/erp-agent-smoke/.agent/ui/01-tokens.md`
- `/tmp/erp-agent-smoke/.agent/ui/components/data-display.md`
- `/tmp/erp-agent-smoke/.agent/patterns/02-list-page.md`
- `/tmp/erp-agent-smoke/.agent/checklists/dod-feature.md`

- [ ] **Step 3: Verify interpolation**

```bash
grep 'smoke-project' /tmp/erp-agent-smoke/AGENTS.md
grep '@shared/ui' /tmp/erp-agent-smoke/.agent/patterns/02-list-page.md
grep '"nextVersion": "14"' /tmp/erp-agent-smoke/.agent/profile.json
```

Expected: all three commands print a matching line.

- [ ] **Step 4: Verify `doctor`**

```bash
cd /tmp/erp-agent-smoke
/Users/thienpham/Downloads/erp-agent/bin/erp-agent doctor
```

Expected: `profile.json: ok`

- [ ] **Step 5: Clean up**

```bash
rm -rf /tmp/erp-agent-smoke
```

- [ ] **Step 6: Commit (nothing to commit unless a fix was needed)**

If smoke test surfaced a fix, commit it now:

```bash
git add -A
git commit -m "fix(cli): <specific issue from smoke test>"
```

Otherwise skip.

---

### Task 24: Delete `design-to-code/` and `.env.confluence` root stub

**Files:**
- Delete: `design-to-code/`
- Delete: `.env.confluence` (the empty root stub)

All content from `design-to-code/` is now migrated into `templates/`, `skills/`, and `README.md`. The empty `.env.confluence` belongs in the consumer project, not the framework.

- [ ] **Step 1: Remove the old folder and stub**

```bash
git rm -r design-to-code
git rm .env.confluence
```

- [ ] **Step 2: Verify no stale references**

```bash
grep -r "design-to-code" . --exclude-dir=.git --exclude-dir=docs || echo "no references"
grep -r "design-to-code/workflow.md" . --exclude-dir=.git --exclude-dir=docs || echo "no references"
```

Expected: both print `no references`. References inside `docs/` (the spec and plan) are historical and allowed.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove legacy design-to-code folder (content migrated)"
```

---

## Final Verification

After all tasks, confirm:

- [ ] `bin/erp-agent version` prints `0.1.0`
- [ ] `bin/erp-agent init` in a fresh dir produces the full `.agent/` tree and root `AGENTS.md`
- [ ] `bin/erp-agent doctor` passes
- [ ] No file under the repo references `design-to-code/` except under `docs/`
- [ ] `find skills -name '*.md' | wc -l` returns 10
- [ ] `find templates/.agent -type f | wc -l` returns 26
  (README + profile.json + 4 context + 4 ui + 9 ui/components + 5 patterns + 2 checklists = 26; plus `templates/AGENTS.md.tmpl` at the `templates/` root)
