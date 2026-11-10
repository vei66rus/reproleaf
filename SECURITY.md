# Security Policy

## Network and Write Boundaries

- **No silent telemetry:** The CLI, MCP server, browser workspace, WordPress plugin, and `activeTab` Chrome extension do not send background analytics, browsing history, or project files.
- **Loopback isolation:** `src/server.mjs` and `src/api.mjs` bind to `127.0.0.1` only and enforce `Host` and `Origin` checks (`RL_HOST_REJECTED`, `RL_ORIGIN_REJECTED`).
- **Private stdio MCP:** `src/mcp.mjs` registers 15 tools. Fourteen are read-only. `update_project_task` is a mutation tool with `readOnlyHint: false`: it saves a requested decision and optional note using the operator-configured HTTPS project endpoint and capability. It does not change site content, insert links, run a crawl or establish that a finding was resolved. Treat its authorization separately from permission to read project results.
- **Public MCP:** `REPROLEAF_PUBLIC_MCP=1` exposes nine read-only stdio tools; `POST /v1/mcp` exposes those nine operations plus `get_schemas` and `get_client_setups`, for 11. The three private project tools, `get_case_source`, `get_latest_evidence` and `get_workflow` are absent from both public modes. No MCP input accepts a shell command, arbitrary local path or caller-selected URL to fetch. Private stdio project reads and writes use only the explicit endpoint configured in the operator's environment; its capability belongs in the request header and must not appear in URLs or returned context.
- **Server-only AI keys:** The standalone optional AI server reads `OPENAI_API_KEY` in `src/ai-review.mjs`; keys do not belong in browser assets or source exports. It enforces explicit enablement and the configured durable daily budget. The separately hosted WordPress `reproleaf-ai.php` adapter is outside this source kit; its operational configuration is not supplied by installing the standalone toolkit.
- **Minimal extension permissions:** `integrations/chrome-extension/manifest.json` requests only `["activeTab", "scripting"]` and executes only when the user clicks the extension button.
- **Source exports:** The PowerShell 7 preview exporter includes `.gitignore`, rejects private paths before creating an archive, refuses symlinks and destinations inside included source directories, and creates a new file exclusively. It never replaces an existing archive. `-DryRun` writes no ZIP. Path checks do not replace a review of source contents, mock-secret fixtures and dependency licenses before a public release.

## Adapter execution

`check --adapter` executes the target's JavaScript in a fresh browser context. Its HTTP routing permits GET/HEAD, excludes known analytics, blocks service workers and, under execution profile 2, blocks WebSocket connections before upstream connection. `--allow-network` permits external hosts; it does not permit additional HTTP methods or WebSocket traffic. Reports retain the effective final route/viewport, a private full-URL digest, the execution profile, blocked functional methods/transports and a count of deliberately excluded analytics requests.

Individual checks may pass while execution is incomplete. Setup/runtime errors or blocked functional methods/transports make `executionComplete` and overall `success` false; deliberate analytics exclusion is part of the declared policy. Imported legacy reports remain readable, but unknown adapter/checker/browser identities, route state or execution policy cannot confirm a repair. Neither can an incomplete baseline or a changed execution scope.

Routing is not a security sandbox. GET endpoints can have side effects, target scripts execute, and WebRTC is outside this routing policy. Run only authorized targets in an isolated local or production-like preview without authenticated accounts or live write services. These observations do not certify general application safety or physical-device behavior.

## Reporting a Vulnerability

If you discover a security or privacy issue (such as a path traversal vector, origin bypass, or accidental secret inclusion), please report it privately via the contact channels on `https://evolkov.tech` before public disclosure.
