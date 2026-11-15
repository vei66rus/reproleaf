# Reddit Community Launch Packs

## 1. r/TechSEO

**Title:** Open-sourced a local CLI + browser toolset for `llms.txt`, AI bot access (`OAI-SearchBot` / `PerplexityBot`), and PageRank cocoon graphing

**Body:**

Sharing a local Node.js CLI, MCP server, and GitHub Action I built for technical SEO and GEO workflows without sending unreleased staging URLs to external SaaS tools:

- Validate `llms.txt` against Markdown structure rules while rejecting HTML soft-404 fallbacks.
- Inspect `robots.txt` per AI search vs training bot (`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `GPTBot`, `ClaudeBot`, `Google-Extended`).
- Compute damped internal PageRank (`d=0.85`), CheiRank, click depth, and orphan pages from crawl JSON or HTML exports.
- Export SARIF 2.1.0, CSV (with spreadsheet formula neutralization), JSONL, or PR comment summaries on every CI push.

Verified 24-origin dev-docs pilot benchmark + browser tools: https://evolkov.tech/en/tools/geo-benchmark-leaderboard  
Source: https://github.com/vei66rus/reproleaf

## 2. r/SEO

**Title:** Audited 24 major developer doc sites for AI search readiness: 70.8% ship valid `llms.txt`, only 33.3% put JSON-LD on root pages

**Body:**

Ran an ethical 3-endpoint public check (`/robots.txt`, `/`, `/llms.txt` at <=1 request per 2s) across 24 open-source documentation domains (`benchmarks/pilot-dataset.json`).

Observed takeaways:
1. All 24 tested sites allow `OAI-SearchBot` and `PerplexityBot`.
2. Two sites returned HTTP `200` on `/llms.txt` yet failed Markdown/blockquote validation.
3. Missing root `JSON-LD` (`Organization`, `WebSite`, `SoftwareApplication`) caused several top ecosystems (`nodejs.org`, `react.dev`, `vuejs.org`) to score `80/100` instead of `100/100`.

You can filter the full dataset or check your own site in the browser toolset: https://evolkov.tech/en/tools/geo-benchmark-leaderboard

## 3. r/mcp

**Title:** Reproleaf MCP server: 50 local SEO, Schema.org, `llms.txt`, and semantic linking tools for coding agents

**Body:**

Built an MIT-licensed MCP server designed specifically so IDE agents (Cursor, Claude, VS Code) verify technical SEO and structured data before merging PRs:

- 50 local read-only/workspace analysis tools across HTML, JSON-LD, OpenGraph, `hreflang`, `llms.txt`, AI crawler access, editorial clarity, and internal PageRank.
- Zero automatic network requests on offline audit tools; SSRF IP/hostname guard (`assertSafePublicUrl`) on opt-in network tools.
- Pairs directly with a VS Code diagnostics extension and Manifest V3 Chrome extension.

Repository: https://github.com/vei66rus/reproleaf

## 4. r/LocalLLaMA

**Title:** Deterministic offline linter for `llms.txt` + RAG chunk boundaries + `llms-full.txt` token budgets

**Body:**

For teams publishing `llms.txt` and Markdown documentation consumed by local RAG pipelines and coding agents, Reproleaf adds CLI + MCP checks for token budget estimation, RAG chunk length balance, canonical term consistency, and prompt-injection hygiene in static HTML/Markdown files.

Zero external API calls needed; runs offline on local Markdown and built HTML artifacts: https://github.com/vei66rus/reproleaf
