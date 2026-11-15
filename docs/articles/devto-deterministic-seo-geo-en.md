---
title: "Deterministic SEO & GEO Auditing in TypeScript-Free Node.js + Browser Modules"
tags: "seo, webdev, opensource, mcp"
canonical_url: "https://evolkov.tech/en/tools/deterministic-geo-llms-case"
---

## Why Deterministic Audits Matter More Than AI Scores

Opaque SEO scores fail engineers because you cannot put a subjective 74/100 rating into CI. When rules live as pure JavaScript functions backed by strict Zod schemas, running `npx reproleaf` locally matches both the browser checker and the MCP server.

Every widget and CLI command in [Reproleaf](https://github.com/vei66rus/reproleaf) executes identical validation logic. Analysis runs locally without paid API lock-in or external LLM calls.

## Auditing `llms.txt` Token Budgets and AI Bot Access

Misconfigured `robots.txt` rules or oversized `llms-full.txt` bundles quietly block retrieval pipelines used by `OAI-SearchBot`, `GPTBot`, `ClaudeBot`, and `PerplexityBot`. An unpruned bundle also burns context windows before an agent ever reaches pricing or docs pages.

Two browser tools run these checks directly inside client memory. [llms.txt Studio](https://evolkov.tech/en/tools/llms-txt-studio) audits syntax and token limits, while [GEO Readiness Checker](https://evolkov.tech/en/tools/geo-readiness-checker) simulates AI crawler rules.

- Detects missing section headings, empty descriptions, and duplicate URLs in `llms.txt`.
- Separates search-indexing bots such as `OAI-SearchBot` from training crawlers such as `GPTBot`.
- Scores Answer-First paragraph length below every `H2`/`H3` heading without rewriting your voice.

```bash
npx reproleaf llms-txt audit --file llms.txt
npx reproleaf llms-budget-audit --file budget-input.json
npx reproleaf llms-bundle --file bundle-spec.json
npx reproleaf geo-audit --file geo-input.json
```

## Preventing SERP Truncation and Tool-Page Cannibalization

Publishing overlapping tool pages splits internal links and confuses both classic search crawlers and RAG indexers.

Before launching five new bilingual tool routes, we pulled DataForSEO Labs volumes for key English queries. Top demand includes `generative engine optimization tool` (880/mo) and `llms.txt generator` (390/mo). Mid-tail queries add `llms full txt` (170/mo), `ai citation checker` (140/mo), and `serp preview tool` (110/mo).

Next, we ran deterministic audits across all 16 English and 16 Russian routes to confirm zero title or intent overlap before shipping markup.

```bash
npx reproleaf serp-audit --file page.html
npx reproleaf cannibalization-audit --file pages.json
npx reproleaf cocoon-audit --file inventory.json
npx reproleaf indexation-audit --file pages.json
```

Three specialized browser checkers mirror those CLI pipelines without uploading files:

- [SERP Pixel Preview](https://evolkov.tech/en/tools/serp-pixel-preview) checks exact desktop and mobile title truncation width.
- [Editorial Clarity Linter](https://evolkov.tech/en/tools/editorial-clarity-linter) flags filler prose and dense walls of text.
- [Cocoon & Cannibalization Matrix](https://evolkov.tech/en/tools/cocoon-matrix-checker) exports overlap graphs as formula-safe CSV.

## Zero-Dependency Browser Delivery Without Framework Bloat

Heavy SEO dashboards often load megabytes of scripts for one check. Reproleaf compiles its UI into lazy ES chunks behind a 1,134-byte loader (`tool-loader.js`). Meanwhile, the Node core (`264` passing tests) installs cleanly with zero Playwright binary required by default.

All tools run locally in your browser with zero signup required. You can inspect schemas, CLI commands, and MCP server specs in [github.com/vei66rus/reproleaf](https://github.com/vei66rus/reproleaf).
