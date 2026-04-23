---
id: 02-extract-context
trigger: "EC <figma-url> [<figma-url> ...] [spec=<confluence-url>] [<target-folder>]"
requires: []
---

# Extract Context (EC)

Pull Figma design context (and optional Confluence spec) into the project's extract folder.

## Preconditions
- Framework lib exists at `<frameworkRoot>/lib/figma_client.js` where `<frameworkRoot>` is `.agent/profile.json → paths.frameworkRoot` (an absolute path; do NOT use the literal `~` in ES `import` specifiers).
- Figma Desktop MCP Server running at `http://127.0.0.1:3845/mcp`.
- If `spec=<url>` is given: `.env.confluence` present with `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN`.
- A task id is known (ask the user if not; example: `ERP-1318`).

## Steps
1. Parse the trigger: collect one or more Figma URLs and an optional `spec=<confluence-url>` and optional target folder. If labels are provided (`list=<url>`), keep them; otherwise auto-derive from Figma node names.
2. Create `_extract/<task-id>/` at the project root. Add `_extract/` to `.gitignore` if not already.
3. For each Figma URL, write an ES module scratch script `_extract/<task-id>/extract_figma_<label>.mjs` that imports `FigmaMCPClient` from `<frameworkRoot>/lib/figma_client.js` (substitute the absolute `frameworkRoot` from `profile.json`), calls `getFullDesign({ url })`, and writes: `designContext.txt`, `metadata.xml`, `screenshot.png`.
4. Verify pixel details: call Figma REST `https://api.figma.com/v1/files/<fileKey>/nodes?ids=<nodeId>` with `X-Figma-Token` from `.env.figma`. Walk the tree and extract `absoluteBoundingBox`, `layoutMode`, `itemSpacing`, `padding*`, `cornerRadius`, `fills`, `strokes`, `style.font*`, `characters`, `type==='LINE'`, `componentProperties`. Save to `figma_tree.txt`.
5. If MCP/REST returns 429: fallback order is (a) direct REST with token, (b) analyze `screenshot.png` via vision, (c) reuse cached `figma_tree.txt`, (d) fetch child nodes incrementally.
6. If `spec=<url>` given: write `_extract/<task-id>/extract_spec.mjs` that loads `.env.confluence`, imports `ConfluenceMCPClient` from `<frameworkRoot>/lib/confluence_client.js` (absolute path), calls `getPageAsMarkdown(url)` (or `getMultiplePagesAsMarkdown` for multiple), writes `spec.md`.
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
