---
name: design-to-code
description: "Converts Figma designs + Confluence specs into high-quality React components using the project's design system (Tailwind + Shadcn/Custom UI). Use when you have a Figma URL or Confluence wiki spec to implement."
---

# Design-to-Code Skill

Converts Figma designs + Confluence feature specs → React components with strict design-system adherence and shared-component reuse.

## Prerequisites

1. Read `docs/project-context.md` — Mandatory. Contains architecture, tokens, i18n rules, naming conventions.
2. **Figma**: Ensure Figma MCP Server is running (`localhost:3845`) and `figma_mcp_client.js` exists at project root.
3. **Confluence**: Set env vars in `.env.confluence` (`CONFLUENCE_EMAIL` + `CONFLUENCE_API_TOKEN`). Client: `confluence_mcp_client.js` at project root.

## Input Format

### Single Screen

```
EC [Figma URL] [target file/folder]   ← Extract Context (analyze only)
TC [Figma URL] [target file/folder]   ← Transform to Code (EC + implement)
TC                                     ← Implement after a previous EC
```

### Multiple Screens (Batch)

```
EC [Figma URL 1] [Figma URL 2] ... [target folder]              ← Extract all screens
EC [screen_label_1]=[URL_1] [screen_label_2]=[URL_2] [target]   ← Extract with labels
TC                                                                ← Implement all after EC
```

When labels are not provided, the agent auto-derives them from Figma node names (e.g., `list_page`, `detail_page`, `create_form`).

### Confluence Spec

```
CS [Confluence URL]                              ← Fetch spec → save as markdown
CS [Confluence URL 1] [Confluence URL 2]         ← Fetch multiple specs
```

### ⭐ Combined: Multi-Figma + Confluence Spec (Recommended for full features)

```
TC [Figma URL 1] [Figma URL 2] [Figma URL 3] spec=[Confluence URL] [target folder]
EC [Figma URL 1] [Figma URL 2] spec=[Confluence URL] [target folder]
```

**Example — 3 UI screens + 1 spec:**

```
TC https://figma.com/design/...?node-id=100-1
   https://figma.com/design/...?node-id=100-2
   https://figma.com/design/...?node-id=100-3
   spec=https://vietnixvn.atlassian.net/wiki/spaces/VEV/pages/141033474/...
   apps/client/src/app/(protected)/services/vps
```

**Behavior**: Agent fetches all 3 Figma screens + Confluence spec simultaneously → merges into unified EC summary → creates ONE shared data layer + per-screen UI components.

**Best**: Multiple Figma URLs + Confluence spec URL + target folder. Screenshot is auto-fetched by MCP.

## Capabilities

| Code | Description                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC   | Extract context — single or multi-screen. Fetches design context via `figma_mcp_client.js`, parses requirements, identifies components. Saves artifacts per screen. |
| TC   | Transform → full feature module (scaffold + data layer + components). Handles shared data layer across screens and per-screen UI components.                        |
| CS   | Confluence Spec — Fetches wiki page(s) via `confluence_mcp_client.js`, converts to markdown, saves as `spec.md` in target folder. Can be combined with EC/TC.       |

## Core Principles

1. **ZERO Hardcode** — ALL colors/spacing must use tokens from `globals.css` + `tailwind-preset.ts`. If a Figma color has no token → ADD it first.
2. **Reuse First** — Scan `@shared/ui/components` + `@shared/ui/shadcn-components` BEFORE building custom UI.
3. **One File = One Component** — Each logical UI section → own file.
4. **Spec-Driven Data Layer** — API endpoints and data models come from feature requirements (Confluence or manual), NOT guessed from design.
5. **Unified Data Layer** — When multiple screens share the same feature, create ONE consolidated data layer (types, API, hooks) serving all screens.
6. **Ask First** — When anything is unclear (API shape, business logic, component behavior, pagination mode, button actions, etc.), **always ask the user** before assuming. Do NOT guess or invent behavior not explicitly stated in the spec or design.

**CRITICAL**: Invoke logic from `./workflow.md`. Do NOT invent capabilities.
