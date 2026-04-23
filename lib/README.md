# lib/ — MCP Clients

Reusable Node.js ESM modules that talk to external services.

- `figma_client.js` — wraps the Figma Desktop MCP Server (Streamable HTTP at `http://127.0.0.1:3845/mcp`). Exports `FigmaMCPClient` and `parseFigmaUrl`.
- `confluence_client.js` — wraps the Confluence REST API with Basic Auth. Reads `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN` from the environment. Exports `ConfluenceMCPClient` and `parseConfluenceUrl`.

Framework skills (`skills/02-extract-context.md`, `skills/06-fetch-spec.md`) import these from `~/.erp-agent/lib/`.
