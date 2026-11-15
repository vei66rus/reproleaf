# Reproleaf 1.0.0 Open Corpus

Reproleaf ships a deterministic, reproducible benchmark corpus covering mobile UI regressions (`fixtures/`), structural HTML/Schema/OpenGraph/Hreflang/Robots/AI-crawler checks, and GEO readiness checks (`rag-audit`, `grounding-audit`, `terminology-audit`, `prompt-injection-audit`).

## Reproducing locally

```sh
node src/cli.mjs verify --all
node src/cli.mjs batch-audit --dir fixtures --format sarif --output reproleaf-corpus.sarif
npm test
```

## Scope

All corpus checks are stateless and deterministic. They verify structural HTML, metadata, JSON-LD, link-graph invariants, and RAG/GEO extractability without predicting search engine rankings.
