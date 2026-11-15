# Show HN Draft (Ready for Manual Submission)

**Title:** Show HN: Reproleaf – Deterministic local SEO, GEO & llms.txt audit CLI, MCP server, and CI Action

**URL:** https://github.com/vei66rus/reproleaf

**Text:**

I built Reproleaf because SEO and GEO linters either send private pre-release drafts to opaque SaaS clouds or charge per-seat fees just to inspect static HTML, `llms.txt`, `robots.txt` AI crawler directives, JSON-LD graphs, and internal PageRank.

Reproleaf runs 100% locally in Node.js (>=22), inside CI (`integrations/github-action` with SARIF 2.1.0 and PR delta tables), as an MCP server for coding agents, in Chrome MV3 (`activeTab` only), and in VS Code.

Key verified components:
- Deterministic HTML, JSON-LD, OpenGraph, `hreflang` matrix, redirect trace, and server log analyzers (`parse5` + SQLite via `node:sqlite`, zero Puppeteer dependency required for core checks).
- `llms.txt` spec validator + HTML soft-404 detector + token budget auditor.
- Semantic cocoon graph & PageRank/CheiRank analyzer with browser SVG visualizers running offline inside standard web components.
- Ethical public GEO benchmark runner (`node src/cli.mjs benchmark`) probing strictly `/robots.txt`, `/`, and `/llms.txt` at <=1 req/2s per domain with SHA-256 verification.

In our 24-origin developer-docs pilot run (`benchmarks/pilot-dataset.json`, SHA-256 `f872c46c32ed9547bb8375526576ba2d05558f1332c73b453b08a09f5c0b6e95`), all 24 domains allowed `OAI-SearchBot` and `PerplexityBot`, 17 of 24 (70.8%) served valid `/llms.txt`, yet only 8 of 24 (33.3%) included root-page `JSON-LD` entities.

Interactive browser tools and live leaderboard (zero login required): https://evolkov.tech/en/tools/geo-benchmark-leaderboard

Feedback on false positives, missing schema checks, or framework presets is very welcome.
