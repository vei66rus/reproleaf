# MCP Ecosystem & Directory Registration Cards

This guide contains verified metadata and copy-ready submissions for MCP registries and curated awesome lists.

## GitHub Repository Topics

Recommended topics for `https://github.com/vei66rus/reproleaf`:

`seo`, `geo`, `llms-txt`, `mcp`, `mcp-server`, `technical-seo`, `json-ld`, `robots-txt`, `internal-linking`, `ai-search`, `open-graph`, `hreflang`, `playwright`, `model-context-protocol`

## Registry Metadata Files

- [server.json](../server.json): Official MCP Registry manifest (`io.github.vei66rus/reproleaf`, version `1.0.0`, npm package `reproleaf`, stdio + remote streamable-http `https://evolkov.tech/mcp/reproleaf`).
- [glama.json](../glama.json): Glama directory maintainer verification (`vei66rus`).
- [smithery.yaml](../smithery.yaml): Smithery stdio runner definition (`npx -y reproleaf-mcp`).

## Directory Cards

### Official MCP Registry / Smithery / Glama / PulseMCP / MCP.so

- **Name:** `reproleaf` (`io.github.vei66rus/reproleaf`)
- **Tagline:** Deterministic SEO, GEO, `llms.txt`, JSON-LD, SERP Pixel, Internal Linking, and Mobile Web Verification MCP Server (43 local / 39 HTTP public tools).
- **Homepage:** `https://evolkov.tech/tools/reproleaf`
- **Repository:** `https://github.com/vei66rus/reproleaf`
- **npm Package:** `reproleaf` (`npx -y reproleaf-mcp`)
- **Remote Streamable HTTP MCP:** `https://evolkov.tech/mcp/reproleaf`
- **License:** MIT

#### Stdio Client Snippet

```json
{
  "mcpServers": {
    "reproleaf": {
      "command": "npx",
      "args": ["-y", "reproleaf-mcp"]
    }
  }
}
```

#### Streamable HTTP Snippet (Read-Only Public Gateway)

```json
{
  "mcpServers": {
    "reproleaf_public": {
      "url": "https://evolkov.tech/mcp/reproleaf"
    }
  }
}
```

### Curated List PR Entries (`awesome-mcp-servers`, `awesome-seo`)

- **Markdown entry for `awesome-mcp-servers`:**

```markdown
- [reproleaf](https://github.com/vei66rus/reproleaf) - Deterministic technical SEO, AI Search (GEO), `llms.txt` token-budgeting, SERP pixel preview, internal-link cocoon graph, Schema.org JSON-LD, and Playwright mobile UI verification MCP server (`43` local tools + public read-only gateway at `https://evolkov.tech/mcp/reproleaf`).
```

- **Markdown entry for `awesome-seo`:**

```markdown
- [Reproleaf](https://evolkov.tech/tools/reproleaf) ([GitHub](https://github.com/vei66rus/reproleaf)) - Open-source deterministic SEO & GEO toolkit (CLI, MCP server, and zero-backend browser workbench) for `robots.txt`, `sitemap.xml`, `llms.txt`, `Answer-First` structure, SERP snippet pixel widths, cocoon internal linking, and cannibalization audits.
```

## Pre-Submission Checklist

1. Publish `reproleaf@1.0.0` to npm so `npx -y reproleaf-mcp` resolves cleanly.
2. Apply GitHub topics listed above to `vei66rus/reproleaf`.
3. Run `mcp-publisher publish` against `server.json` after npm publication.
4. Submit `https://github.com/vei66rus/reproleaf` to `smithery.ai`, `glama.ai`, `mcp.so`, and `pulsemcp.com`, then open PRs to `awesome-mcp-servers` and `awesome-seo`.
