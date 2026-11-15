# State of GEO & AI Search Readiness in 2026: Benchmark of 24 Public Dev Docs

Our reproducible pilot probe across 24 public developer-docs and open-source origins exposes a sharp gap between crawler access and structured machine signals.

Every tested origin allows `OAI-SearchBot` and `PerplexityBot` (`24/24`). Seventeen origins (`70.8%`) serve a valid `/llms.txt` file, yet only eight (`33.3%`) embed homepage `JSON-LD` schema. Seven domains achieved a full `100/100` score: `nextjs.org`, `fastify.dev`, `nuxt.com`, `bun.sh`, `trpc.io`, `wordpress.org`, and `evolkov.tech`.

## How the ethical benchmark scores each origin

The benchmark inspects three public endpoints (`/robots.txt`, `/`, `/llms.txt`) at no more than one request every two seconds per domain.

Each origin starts with strict SSRF host resolution and respects `robots.txt` rules. Five objective checks award 20 points each toward a 100-point total.

- Reachable `HTTP 2xx/3xx` response on `/`.
- At least 80 visible non-JavaScript words in raw static HTML.
- Explicit or default access for both `OAI-SearchBot` and `PerplexityBot`.
- Valid `JSON-LD` structured data entities extracted from HTML.
- Structurally valid `/llms.txt` avoiding HTML soft-404 fallbacks.

## Why HTTP 200 on llms.txt still fails validation

Two inspected sites (`modelcontextprotocol.io` and `deno.com`) returned HTTP `200` for `/llms.txt` yet failed strict spec validation.

Common issues include missing blockquote summaries (`>`) or broken Markdown section structure. Four sites (`astro.build`, `tailwindcss.com`, `eslint.org`, `playwright.dev`) returned HTTP `404`, and `www.typescriptlang.org` returned `503`.

## Homepage JSON-LD remains the rarest GEO signal

Only 8 of 24 tested technical sites (`33.3%`) declare `JSON-LD` entities on their root page.

High-traffic developer ecosystems including `nodejs.org`, `react.dev`, `vuejs.org`, and `llmstxt.org` scored `80/100` purely from missing `Organization`, `WebSite`, or `SoftwareApplication` schema. Adding verified JSON-LD alongside `llms.txt` closes that gap quickly.

## Reproduce the SHA-256 dataset locally

Run the public Reproleaf CLI benchmark runner against the repository origin list to verify every observation independently.

```bash
npx reproleaf benchmark --file benchmarks/origins-devdocs.txt --allow-network --output report.json
```

Pilot corpus SHA-256 (`benchmarks/pilot-dataset.json`): `f872c46c32ed9547bb8375526576ba2d05558f1332c73b453b08a09f5c0b6e95`. Filter all 24 measured domains interactively in the [GEO Benchmark Leaderboard](/en/tools/geo-benchmark-leaderboard).
