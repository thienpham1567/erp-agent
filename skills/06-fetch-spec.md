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
