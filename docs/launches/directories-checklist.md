# Directory & Marketplace Submission Checklist (Manual Review Required)

Submit externally ONLY after final release approval:

1. **npm Registry (`reproleaf`)**
   - Command: `npm publish --access public` (dry-run first via `npm pack --dry-run`)
   - Package URL: `https://github.com/vei66rus/reproleaf`
   - Homepage: `https://evolkov.tech/tools/reproleaf`

2. **Chrome Web Store (`integrations/chrome-extension/`)**
   - Checklist & privacy policy: `integrations/chrome-extension/STORE-CHECKLIST.md`, `integrations/chrome-extension/PRIVACY.md`
   - Permissions justification: `activeTab` + `scripting` only on explicit click, zero background collection.

3. **VS Code Marketplace (`integrations/vscode/`)**
   - Package with `vsce package` inside `integrations/vscode/` and verify offline Code Actions + JSON-LD quick fixes.

4. **MCP Directories (`Glama`, `Smithery`, `modelcontextprotocol/servers`)**
   - Metadata manifests: `server.json`, `glama.json`, `smithery.yaml`
   - Transport: stdio (`npx reproleaf-mcp`) + optional HTTP public gateway (`/mcp`).

5. **GitHub Marketplace Action (`integrations/github-action/`)**
   - Action file: `integrations/github-action/action.yml`
   - Verified templates: `examples/nextjs-github-action.yml`, `astro`, `docusaurus`, `vitepress`, `hugo`.

6. **Product Hunt / AlternativeTo / Awesome Lists**
   - Tagline: Deterministic local SEO, GEO & `llms.txt` linter, CLI, MCP server, and CI Action.
   - Live interactive showcase: `https://evolkov.tech/en/tools/geo-benchmark-leaderboard`
