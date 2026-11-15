# Reproleaf GEO & AI Search Readiness Benchmark Corpus

This directory stores reproducible public dataset artifacts collected with `reproleaf benchmark`.

## Methodology

Each run probes strictly 3 public endpoints per domain (`/robots.txt`, `/`, `/llms.txt`) using `ReproleafBenchmarkBot/2.0`, SSRF-guarded public DNS resolution (`assertSafePublicUrl`), and an enforced minimum delay of `2000ms` per domain. Domains that disallow `/` in `robots.txt` are recorded as `skipped_by_robots` without fetching HTML or `/llms.txt`.

## Reproduce Locally

```bash
node src/cli.mjs benchmark --file benchmarks/origins-devdocs.txt --concurrency 6 --allow-network --output benchmarks/pilot-dataset.json
```

Verify schema and inspect per-domain permission logs inside `benchmarks/pilot-dataset.json`.
