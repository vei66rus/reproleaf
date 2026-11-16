# Reproleaf

[![M8ven Verified](https://m8ven.ai/badge/mcp/vei66rus-reproleaf-1xe04q?variant=verified&v=acdf89194153532e30d0ad18a72082a4)](https://m8ven.ai/mcp/vei66rus-reproleaf-1xe04q?s=readme)

Local-first deterministic technical SEO, GEO (`llms.txt`, AI crawler access), Schema.org JSON-LD, internal PageRank, log analysis, and mobile web verification toolkit built for Node.js (>=22), CI pipelines, coding agents (MCP), Chrome, and VS Code.

Online browser tools and GEO leaderboard (runs offline inside your browser tab, zero login required): [evolkov.tech/en/tools/geo-benchmark-leaderboard](https://evolkov.tech/en/tools/geo-benchmark-leaderboard).

## Version 2.3.1

The XML inventory panel distinguishes a missing second sitemap from an observed zero difference. Short localized status values fit the existing metric layout; JSON report contracts are unchanged.

## Version 2.3.0

Five optional supplied-HTML inventory observations now join the existing report. Repeat checks for thirteen inventory observations require positive same-scope evidence; missing captures, omitted metadata and incomplete groups remain unverified. See the saved-crawl workflow and limits below. No new public browser runner or WordPress source capture is enabled.

## Version 2.2.0

Finding-only `diff` and `crawl-diff` reports retain disappeared observations as `unconfirmed`, not verified fixes. Missing pages, failed reads and unknown rule coverage cannot prove a correction. These commands return `verificationComplete: false`, `ok: false` and exit code 1 while coverage remains unconfirmed. `noObservedRegressions` describes only whether the supplied observations contain a newly detected regression; it is not a successful verification result.

Source release candidate: dedicated GSC, keyword cleanup, access-log, authorship, supplied-page comparison, JSON-LD, social metadata, robots, redirect and hreflang panels, plus bounded local batch HTML review. Unknown inputs remain unknown; observed signals do not establish rankings, verified crawler identity or factual authority. The hosted gateway and public releases are versioned separately.

Version 2.1.0 adds byte-aware HTML imports, optional inventory metadata observations, a saved-crawl inventory export, and editable nginx/Apache redirect drafts. Private server-project MCP context now retains the scope of the WordPress integration's per-URL/rule comparison. Finding-only CLI comparisons still cannot confirm corrections. The hosted gateway remains separately deployed.

### Use a saved crawl in the browser workspace

Convert an existing Node crawler JSON into the inventory format accepted by the main workspace's **Site inventory** mode:

```sh
node src/cli.mjs report --file crawl.json --format inventory --output inventory.json
```

Upload `inventory.json` in that mode. Conversion sends no requests and excludes raw HTML, headers and failed-request details. Observed final URLs, links and supported metadata remain available to the local analyzer. Paths and query strings remain in the file: review them before sharing. Multiple records with the same final URL require alias review before import. Distinct URLs such as `/a` and `/a/` that collide under the existing link graph's trailing-slash normalization are rejected, not merged.

Only successful HTML responses contribute title, a single supplied H1, canonical and meta robots observations. Other responses contribute their supplied HTTP status. Missing fields remain unknown; the converter does not infer article type, locale, page text, link placement or whole-site coverage. A single exported sitemap contains URLs, so it cannot supply these content observations.

### Review supplied HTML metadata in the existing workspace

Open the main [SEO workspace](https://evolkov.tech/en/tools/reproleaf), select **Site inventory**, and upload or paste an inventory JSON. The existing three-page example now includes synthetic HTML facts. The separate source example `examples/blog-html-metadata-facts.json` demonstrates all five additional observations: empty title, empty description, advisory H1 count, multiple canonical elements and duplicate descriptions within one locale partition.

To use your own saved Node crawl, convert it with the command above. Optional facts are extracted only when a successful HTML record includes its actual `html` body. Each facts capture is bounded to 1 MiB UTF-8, 20,000 DOM nodes and depth128. Raw HTML is excluded from the resulting inventory. Missing bodies, ambiguous/oversized descriptions, capture-limit failures and HTTP204/205/206 body-derived fields remain unknown. Status is retained; these responses cannot provide positive full-document recheck evidence. Explicit application/xhtml+xml records retain supplied legacy metadata, but new DOM facts are not processed because this adapter is an HTML parser, not an XML engine. Unsupported captures cannot establish positive body-derived recheck evidence. Existing WordPress saved-crawl projections do not provide these new HTML facts; their supported canonical/status observations continue unchanged.

The HTML/schema/social panels keep their existing reports; they do not automatically turn an HTML upload into an inventory. A sitemap supplies URLs rather than proof that metadata is missing. No length score, mandatory single-H1 rule, Google snippet-use claim or ranking prediction is added.

Run and repeat the inventory check locally:

```sh
node src/cli.mjs blog audit --inventory inventory.json > before.json
# Re-export after an intentional change, keeping the same page scope.
node src/cli.mjs blog audit --inventory updated-inventory.json > after.json
node src/cli.mjs compare --before before.json --after after.json
```

Positive rechecks are scoped to the thirteen supported inventory observations. They require explicit same-scope evidence: omitted facts, failed captures, truncated reports and unknown target directives remain unverified. Duplicate rechecks recompute values across the complete locale partition. These are comparisons of supplied observations, not proof of source authenticity or cryptographic engine-version verification. Other finding-only diff commands remain unconfirmed as described above.

### Local static accessibility audit

The optional local browser tool uses pinned `axe-core` 4.14.0. After `npm ci`, install the Playwright Chromium runtime if it is absent:

```sh
npx playwright install chromium
node src/cli.mjs accessibility-audit --file page.html --allow-browser --locale en --output accessibility.json
```

Files must contain valid UTF-8 and fit 512 KiB. Unrestricted local MCP provides `audit_static_accessibility` with inline `html`, `locale` and required `allowBrowser: true`. Restricted stdio, local public HTTP and the hosted gateway do not expose this browser tool. An operator may set `REPROLEAF_BROWSER_EXECUTABLE`; callers cannot submit an executable path or a URL.

This audits a transformed static DOM. Source scripts, active documents and external resources are removed or rejected; inline CSS is retained. External styling, dynamic states and manual checks remain unknown. Original-site WCAG conformance and OS network isolation are not established. A generated report, including CLI exit zero, is not a clean-audit certificate. Reports retain Reproleaf runner policy/version separately from the axe engine.

The local controller accepts one browser job at a time, caps input before spawning a child, and uses a 20-second work deadline plus up to 11 seconds of owned-process cleanup and scheduling overhead. Chromium's forced-crash temporary-profile remnants are not forensically excluded. Missing runtime, invalid input and cleanup failures do not produce a successful report. See [integration limits](src/vendor/axe-core/INTEGRATION.txt).

On evolkov.tech, **Review saved metadata** transfers the selected saved crawl sample into the existing workspace without another crawl. It excludes project keys, page text and the link graph. Metadata-only reports leave link/orphan/cluster counts unknown; they do not imply a whole-site audit.

### Source installation

Use a reviewed source checkout and Node.js 22 or later. The npm package was unavailable at the 2026-11-16 publication check; do not assume an `npx reproleaf` or `npx reproleaf-mcp` installation exists.

```sh
npm ci --omit=dev --ignore-scripts
node src/cli.mjs help
node src/cli.mjs batch-audit --dir /absolute/path/to/static-build --preset saas --format sarif --output reproleaf.sarif
node src/mcp.mjs
```

The static audit reads the supplied directory. The last command starts a local stdio MCP server; configure your client to launch Node with the absolute path to `src/mcp.mjs`. Browser fixture verification requires development dependencies and Chromium; it is separate from the runtime-only installation above.

- **GitHub Action v2 (PR delta table + SARIF):** copy a workflow from [examples/](examples/README.md) using `vei66rus/reproleaf/integrations/github-action@main`
- **Chrome MV3 extension (`activeTab` only):** load [integrations/chrome-extension](integrations/chrome-extension/STORE-CHECKLIST.md) for instant HTML, JSON-LD, SERP extractor & DOM checks
- **VS Code linter with Quick Fixes:** open [integrations/vscode](integrations/vscode/package.json) for real-time HTML, Markdown & `llms.txt` diagnostics
- **Saved 24-origin pilot snapshot:** inspect `benchmarks/pilot-dataset.json`; its provenance and integrity limits are described below. It is not a representative web sample.

## Architecture & Scope

The hosted Streamable HTTP MCP endpoint at `https://evolkov.tech/mcp/reproleaf` was observed as **0.8.0 with 11 tools** on 2026-11-16. This source candidate separately registers **51 local stdio tools**, **44 read-only tools** in restricted `REPROLEAF_PUBLIC_MCP=1` stdio mode, and **46 read-only tools** in its local HTTP implementation. Source capabilities are not a claim that the hosted gateway has been upgraded. Check `initialize` and `tools/list` on the transport you actually use. Public gateway tools exclude private project context and local file access, but supplied public requests still reach that server. See [public gateway limits](docs/PUBLIC-GATEWAY.md) and [MCP directory manifests](docs/MCP-DIRECTORIES.md).

## Run locally

Use Node.js 22 or later:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run dev
```

Open **http://127.0.0.1:4179** for the fixture workbench. This is a local testing surface, separate from the product landing inside evolkov.tech's WordPress site. The server binds to loopback only and sends `noindex` headers. Existing Chrome on Windows is also supported; `MWC_BROWSER_PATH` selects another Chromium executable.

```sh
npm run cases
node src/cli.mjs case modal-close-unreachable
node src/cli.mjs clients
node src/cli.mjs diagnose --stack react --render-mode ssr --symptom "sticky footer covers input"
node src/cli.mjs compare --before before.json --after after.json
node src/cli.mjs sanitize --report report.json
node src/cli.mjs contribute --packet contribution.json
node src/cli.mjs verify --all
node src/cli.mjs verify --case nested-scroll-trap
node src/cli.mjs verify --case canvas-touch-trap --variant fixed
npm test
```

The verifier starts an isolated fixture server, launches its own browser and closes both afterward. It never opens your browser profile, reads other project folders or sends forms. Browser requests are restricted to its own loopback origin.

## Cases and checks (9 synthetic mobile web cases)

| Case | Example stack | Independent observation |
| --- | --- | --- |
| `modal-close-unreachable` | Vue | Reach the last content element; the close control remains visible, topmost and usable. |
| `nested-scroll-trap` | React | A reverse touch gesture at a nested scroll boundary moves the parent document. |
| `canvas-resize-gap` | Three.js | A height-only resize leaves the viewport covered by the canvas element and matching 1x drawing buffer. |
| `canvas-touch-trap` | Phaser 3 | A vertical gesture over the tap-only game scrolls the page while tapping the circle still works. |
| `menu-under-overlay` | HTML | The tested navigation link is topmost and receives pointer input at its center. |
| `heading-grid-overflow` | HTML | A long heading does not widen the document beyond its layout viewport. |
| `sticky-bar-focus-occlusion` | HTML / CSS | Focused form fields and controls remain visible above a fixed bottom bar (`focus-occlusion`). |
| `async-submit-double-fire` | Vue | Rapid double taps on an async submit control trigger at most one submission while pending. |
| `ssr-disclosure-hydration-reset` | React | A disclosure opened before client hydration preserves its expanded state after hydration completes. |

Both broken and fixed variants run through the same checks at 360×640 and 390×844. A setup error never counts as successful bug detection. The checks do not read the variant query, fixture class names or the CSS settings that implement the fix.

## Evidence and limitations

Runs write `report.json` and screenshots under `artifacts/runs/<timestamp>/`. The report includes exact library and browser versions, operating system, viewport, observations, errors, fixture/check/build hashes and screenshot hashes. Artifacts are ignored by Git and remain local until reviewed.

Chromium viewport emulation and CDP touch injection are **not physical iOS or Android results**. Scroll and focus assertions do not establish full accessibility or performance compliance.

## Source MCP (51 local tools; 44 public stdio / 46 local HTTP)

The source stdio server (`node src/mcp.mjs`) registers 51 tools covering technical SEO, AI search (GEO), `llms.txt` token budgeting, Answer-First structure, SERP pixel preview, SERP clustering/gap/cocoon planning, E-E-A-T, JSON-LD, OpenGraph, hreflang, and synthetic mobile web checks. Fifty are read-only; `update_project_task` writes an explicitly requested decision and optional note to the configured private project.

Source public stdio mode (`REPROLEAF_PUBLIC_MCP=1`) exposes 44 read-only tools. The source stateless JSON-RPC HTTP implementation (`POST /v1/mcp`) exposes 46 read-only tools. These counts do not describe the separately deployed 0.8.0/11-tool gateway. The core local and editorial tools include:

- `list_cases`: search the synthetic case metadata (`query`, `category`, `limit`, `offset`).
- `get_case`: retrieve the expected behavior, limitations and local verification command.
- `get_case_source`: retrieve only allowlisted fixture, stylesheet or check source (hidden in `REPROLEAF_PUBLIC_MCP=1` mode).
- `get_latest_evidence`: retrieve actual local observations and their freshness status (hidden in `REPROLEAF_PUBLIC_MCP=1` mode).
- `get_site_project_context`: read compact saved private server crawl results by job UUID through an operator-configured HTTPS endpoint. This local stdio tool is absent from public MCP mode and the HTTP gateway.
- `get_project_tasks`: read saved private project task evidence and operator decisions without changing either.
- `update_project_task`: save an explicitly requested `todo`, `doing`, `deferred` or `dismissed` decision and a note. This local-only mutation does not resolve an observed finding or modify site content.
- `list_workflows`: list mobile web and editorial workflows.
- `get_workflow`: retrieve one workflow.
- `review_editorial_packet`: check supplied article evidence, terminology, H1–H6 structure and site-link records without fetching sources or publishing.
- `audit_blog_links`: audit a supplied blog page/link inventory, topic clusters, hubs, donor sentence excerpts and candidate internal links.
- `diagnose_project`: rank candidate mobile web checks and starter adapter templates from supplied metadata. Multiple applications require explicit selection. Dependencies alone do not establish route rendering mode; all candidates still require a precondition check and baseline execution.
- `compare_check_runs`: compare two saved editorial, blog or frontend reports and classify findings into `new`, `remaining`, `resolved`, and `unconfirmed` with `environmentDiff`.
- `list_check_rules`: list versioned editorial, public HTML, internal-link and synthetic browser check definitions with required inputs and explicit limitations.
- `get_check_rule`: retrieve one domain-qualified rule such as `editorial:h1-count`, including a stable documentation citation.

Nine `mwc://cases/<id>` resources expose the case descriptions. No MCP tool accepts an arbitrary local path, navigation URL or shell command.

### Prepare a source export for review

The PowerShell 7 exporter uses an explicit source allowlist, includes `.gitignore`, rejects private paths and symlinks, and refuses to overwrite an existing destination. Choose a new private output file outside the included source directories:

```sh
pwsh -NoProfile -File tools/package-local-preview.ps1 -Destination /absolute/private/reproleaf-source-preview.zip -DryRun
pwsh -NoProfile -File tools/package-local-preview.ps1 -Destination /absolute/private/reproleaf-source-preview.zip
pwsh -NoProfile -File tests/package-export.test.ps1
```

The dry run returns the intended entry list without writing an archive. Review file contents and licenses before sharing a source export. This command creates a local review archive and does not publish a repository or package.

### Public methodology and synthetic evidence

The bilingual documentation targets are `/tools/reproleaf-methodology` and `/tools/web-dev-cases` with English equivalents under `/en`. Each browser case has a stable fragment citation. Versioned JSON catalog, rule definitions, checklist, example packets and sanitized outcomes are published together under `/wp-content/themes/evolkov/assets/tools/reproleaf-evidence/0.6.1/` after release verification.

The public snapshot contains only synthetic case data, numeric/boolean measured observations, dependency versions and known verifier source hashes. Local paths, screenshots, arbitrary error messages, hostnames and client project reports are excluded. An expected outcome on the intentionally broken variant means that its behavioral check failed as expected; it is not a successful interface. No physical-device or independent-user claim follows from the synthetic suite.

Generate a review snapshot from a selected fresh verifier report:

```sh
node src/cli.mjs verify --all
node src/public-evidence.mjs /absolute/path/to/run/report.json /new/review/output /new/review/pages.json
```

The generator verifies known input hashes and dependencies. Missing or stale evidence is labeled `not-run` or `not-current` and publishes no current outcomes. Each versioned output directory rejects changed existing files. Build to a new review directory while editing; copy a reviewed release snapshot once and use a new version for later changes. A package version change invalidates the verifier input hash and requires another run before publication.

The 0.6.1 rule and evidence references above are historical, immutable artifacts. This source candidate does not rewrite them or imply a new public evidence release. `docs/PROJECT-CONTEXT.md` explains active application selection without merging legacy and current manifests.

### Pilot snapshot integrity

`benchmarks/pilot-dataset.json` records 24 origins and a declared generation time of `2026-11-15T15:05:20.803Z`. Its embedded SHA-256 is `f872c46c32ed9547bb8375526576ba2d05558f1332c73b453b08a09f5c0b6e95`, covering `JSON.stringify({summary,results})`, not the entire file or `generatedAt`. Validation checks structure, unique origins, compatible statuses, summary counts and that digest. A matching digest establishes internal self-consistency; it does not authenticate the observations, independently verify collection or establish freshness. A producer can change observations and recompute the digest. The pilot is not a citation prediction or evidence of ranking effects.

The browser leaderboard inspects the saved snapshot without reprobes. A new network benchmark is a separate explicit operation on an operator-provided origin list: `node src/cli.mjs benchmark --file /absolute/path/to/origins.txt --allow-network`. Review the collection scope and target permissions before running it; reading the bundled snapshot makes no network request.

### Saved private site crawl context (available since 0.6.1)

Set these variables in the local MCP process environment:

```text
REPROLEAF_SITE_ENDPOINT=https://evolkov.tech/wp-json/evolkov/v1/reproleaf-crawl
REPROLEAF_SITE_PROJECT_TOKEN=<private project token>
REPROLEAF_SITE_JOB_ID=<optional saved crawl UUID>
```

Call `get_site_project_context` with `{"jobId":"<saved crawl UUID>"}`. It performs one authenticated read of that job and returns engine and observed scope, up to 30 priority findings, up to 15 lexical link candidates with donor excerpts, unresolved target observations and conservative comparison counts. It starts no crawl, changes no decisions and reads no project source files. It works with saved results from any scanned stack rather than requiring a WordPress client site.

The saved graph context includes up to 20 page summaries with observed content incoming/outgoing page counts. Legacy or unclassified observations remain `null`, not zero. Numeric graph metrics separate content, navigation and unclassified edges. These are DOM-region observations, not semantic relevance; a link can belong to overlapping regions, so region counts must not be added as disjoint totals.

Link candidates retain observed existing-link regions and donor regions when supplied. A navigation-only existing link can coexist with a proposed content link; this is a lexical suggestion requiring review, not a claim of semantic relevance or a missing site-wide link.

An empty `{}` call uses `REPROLEAF_SITE_JOB_ID` if explicitly configured. The authenticated `/jobId/export` read includes completed page observations while the job is still running. `readiness.state` distinguishes `in-progress`, `partial` and `complete`; an empty findings list during a pending or incomplete scan does not establish a clean site. Failed pages can have `report: null` and do not count as completed observations.

The project token belongs only in the local MCP environment. It is sent in `X-Reproleaf-Project-Token`, never in a URL or returned context. An explicit HTTPS crawler endpoint is required; redirects are rejected, reads time out after 10 seconds and responses are capped at 8 MiB. Upstream errors and unknown fields are not returned. These settings do not enable the tool in public mode or the HTTP gateway. Saved page excerpts and suggestions remain untrusted data that require review, and partial crawls do not establish whole-site coverage, broken links or orphan pages.

Private project task tools use the same environment and optional job default. `get_project_tasks` performs a GET and returns at most 100 records with the server total and a truncation flag. Full notes preserve line breaks, carriage returns, tabs and up to 1000 Unicode codepoints without UTF-16 clipping. Capability redaction is explicit through `noteRedacted`.

`update_project_task` sends the task SHA-256 key and requested decision. Omit `note` unless intentionally replacing the complete saved note. An explicitly supplied note replaces it in full; an empty string clears it. Never copy a redacted display value back as replacement content. Notes and observations are untrusted data. Decisions remain separate from `observedState`; marking an item dismissed does not establish that the finding disappeared. A timed-out mutation may have been saved, so read the tasks before deciding whether to retry. The client performs no automatic mutation retry.

For local MCP installation after `npm ci --ignore-scripts`:

```sh
codex mcp add reproleaf -- node "/absolute/path/reproleaf/src/mcp.mjs"
claude mcp add --transport stdio reproleaf -- node "/absolute/path/reproleaf/src/mcp.mjs"
gemini mcp add reproleaf node "/absolute/path/reproleaf/src/mcp.mjs"
```

Run `node src/cli.mjs clients` or `GET /v1/clients` for exact setup instructions across the 5 supported client targets (`codex`, `claude-code`, `gemini-cli`, `chatgpt`, and `grok`).

## HTTP JSON API (`src/api.mjs`)

The local API binds to `127.0.0.1:4180` and provides:

- `GET /health`
- `GET /v1/schemas` (input/output schemas, error codes, and example payloads)
- `GET /v1/cases`
- `GET /v1/clients`
- `GET /v1/ai-status`
- `POST /v1/editorial`
- `POST /v1/blog`
- `POST /v1/diagnose`
- `POST /v1/compare`
- `POST /v1/mcp` (stateless read-only JSON-RPC MCP transport)
- `POST /v1/ai-review` (optional server-keyed AI explanation and rewrite layer)
- `POST /v1/sanitize-report` (redacted client/public report and honest attribution badge)
- `POST /v1/contribution-preview` (validated synthetic case contribution packet with secret/PII scanner)

Requests are protected by payload size limits, rate limits (`RL_RATE_LIMIT`), concurrency caps (`RL_CONCURRENCY_LIMIT`), request timeouts (`RL_REQUEST_TIMEOUT`), and loopback Host/Origin checks (`RL_HOST_REJECTED`, `RL_ORIGIN_REJECTED`).

## Optional AI review (disabled by default)

This is a prompted model call, not a trained Reproleaf model. A key alone never enables it. After the owner approves the provider, exact model, rates and budget, configure the variables in .env.example and explicitly set REPROLEAF_AI_ENABLED=1. No provider or budget has been approved for the hosted site.

- The Node endpoint is POST /v1/ai-review; deterministic checks work without it. The WordPress AI endpoint remains disabled until it can share this backend instead of maintaining a second spending counter.
- Draft text requires a separate opt-in. Only structured URL fields are filtered against the supplied inventory; free-text factual accuracy still requires human review.
- Each request reserves a conservative input-byte estimate plus maximum completion cost before dispatch, using explicitly configured model prices. The complete reservation remains charged after success or an uncertain failure. This may stop service before the actual provider bill reaches the daily allocation.
- A private persistent ledger with an atomic process lock shares reservations across restarts and processes. Every process sharing a budget must use the same persistent file. Damaged or locked storage fails closed; do not clear a stale lock while a process may be writing.
- Unexpected usage above a reservation pauses AI for review. The configured rates and token bound must be validated for the chosen text model; this application ledger is not a provider-enforced billing limit and cannot cover unannounced provider price changes.
- Outputs remain ai-hypothesis-unverified. Explicit activation, provider pricing, external pilot and a production backend connection are still required before enabling paid service.

## Browser audit workspace

The browser workspace (`src/browser/playground.js`, `src/browser/dashboard.mjs`, `src/browser/projects.js`) provides:

- Article, evidence-packet and site-graph workspaces using the site controls and shared selection components.
- Proportional check distribution bar (`good`, `attention`, `problem`, `unverified`) with honest `urls-only` XML sitemap handling (never fabricating `0` incoming links when link edges were not supplied).
- Interactive Issue Explorer with severity tabs (`All`, `Errors`, `Warnings`, `Info`), category filters (`Headings H1–H6`, `Metadata & query`, `Internal links & URLs`, `Evidence & claims`, `Glossary & HTML`), and real-time search by code, URL or snippet.
- Actionable 5-field findings (`observation`, `why`, `snippet`, `suggestion`, `verifyHint`), topic cluster/hub graph analysis, donor sentence excerpts, and one-click Markdown link copy.
- Named projects in IndexedDB with archive import/export (`Export project` / `Import project`), target object filter (`All objects` / `Selected object`), baseline run pinning (`Pin as baseline`), per-finding and per-recommendation decisions (`Accept` / `Defer` / `Dismiss`), and HTML/JSON/sanitized report exports.

## Integrations

- `integrations/static-site/export.mjs`: offline HTML directory exporter for blog link audits.
- `integrations/wordpress/reproleaf/`: optional administrator plugin that exports published content into the embedded local workspace. Build its static workspace assets locally before packaging with `npm run build:wordpress`. Supplementary stored-markup paragraphs require an explicit checkbox. No frontend output, tracking, automatic content edits or forced backlinks.
- `integrations/chrome-extension/`: Manifest V3 `activeTab` inspector that checks the active tab only on explicit button click without `<all_urls>` or background browsing history access.
- `integrations/vscode/`: real-time HTML, Markdown and `llms.txt` diagnostics with deterministic JSON-LD Quick Fixes.
- `integrations/github-action/` & `examples/`: CI action v2 with SARIF 2.1.0 output, baseline error delta comparisons, and fork-safe pull request comments for Next.js, Astro, Docusaurus, VitePress, Hugo, and WordPress static builds.
- `badges/`: lightweight SVG verification badges generated by `src/badge-generator.mjs`.

## How to cite

If you reference Reproleaf checks, mobile reproduction cases, or methodology in articles, audits, or research, cite the repository via [CITATION.cff](CITATION.cff) or link to `https://evolkov.tech/tools/reproleaf-methodology`.
