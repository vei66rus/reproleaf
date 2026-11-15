# Dev.to Launch Article Draft

**Title:** Deterministic SEO & GEO Auditing in CI: Auditing HTML, JSON-LD, and `llms.txt` Before Merge

**Tags:** `seo`, `webdev`, `githubactions`, `opensource`

Static-site generators make it easy to ship broken canonicals, CSR-only landing pages invisible to AI search crawlers, or malformed `llms.txt` endpoints returning HTML soft-404s.

Reproleaf checks all of those locally or inside GitHub Actions in seconds:

```yaml
- uses: vei66rus/reproleaf/integrations/github-action@main
  with:
    dir: dist
    preset: docs
    format: sarif
    comment-pr: 'true'
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

In our verifiable 24-origin dev-docs benchmark (`benchmarks/pilot-dataset.json`), **70.8% (17/24)** served valid `/llms.txt`, yet **only 33.3% (8/24)** embedded root-page JSON-LD schema.

Read the full breakdown, inspect the SHA-256 dataset, or run the browser leaderboard at https://evolkov.tech/en/tools/geo-benchmark-leaderboard.
