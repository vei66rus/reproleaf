# Reproleaf CI Workflow Examples

Copy any workflow template below into `.github/workflows/reproleaf-audit.yml` in your repository to fail pull requests when HTML, JSON-LD, OpenGraph, or AI crawler checks fail.

- `nextjs-github-action.yml` — Next.js static export (`out/`)
- `astro-github-action.yml` — Astro (`dist/`)
- `docusaurus-github-action.yml` — Docusaurus (`build/`, `preset: docs`)
- `vitepress-github-action.yml` — VitePress (`docs/.vitepress/dist`, `preset: docs`)
- `hugo-github-action.yml` — Hugo (`public/`)
- `wordpress-static-audit.yml` — Exported WordPress static mirror or snapshot HTML via CLI (`npx reproleaf batch-audit`)
