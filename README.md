# Reproleaf

A local toolkit with installable agent skills, a local CLI, an HTTP JSON API, and read-only MCP tools for mobile web verification and evidence-backed SEO/editorial work. Nine freshly written synthetic UI cases use Vue, React, Three.js, Phaser and HTML. Existing client and personal project repositories remain private.

This is a synthetic regression suite and structural diagnostic toolkit, not a search ranking predictor or autonomous website crawler.

## Version 0.7.1

[Download the source kit, WordPress helper or standalone browser workspace](https://github.com/vei66rus/reproleaf/releases/tag/v0.7.1). Choose the source kit for local CLI/MCP, the helper for WordPress admin, or the browser workspace for a self-hosted static interface. [Report a reproducible issue](https://github.com/vei66rus/reproleaf/issues) with synthetic data; [contribution requirements](CONTRIBUTING.md) describe the acceptance boundary.

Use the browser workspace, CLI or MCP to inspect article structure, observed internal links and mobile interface behavior. The source includes guarded skill installation, execution-policy and final-state evidence, exact donor-span validation, and an optional WordPress published-content exporter. WordPress is not required. The exporter adds no frontend tracking, automatic edits or mandatory backlinks.

Unreleased passage retrieval experiments failed independent relevance gates and are excluded from the distribution and public CLI/API/MCP. The existing inventory algorithm remains available. Exact text spans prove text locations, not that a link is useful. See [paragraph evidence and research results](docs/PARAGRAPH-REVIEW.md). Paid semantic review remains disabled pending provider and budget approval. The reviewed source is published at [vei66rus/reproleaf](https://github.com/vei66rus/reproleaf).

The public Streamable HTTP MCP endpoint is `https://evolkov.tech/mcp/reproleaf`. It exposes eleven read-only tools with request and work limits. It has no access to saved private projects, local source files, task mutations or paid models. Supplied article/inventory data is sent to this service when a client invokes a review tool; use local stdio for data that must stay on your computer. See [public gateway limits and hosting boundary](docs/PUBLIC-GATEWAY.md). A remote URL does not install a ChatGPT web integration.

MCP initialization supplies a short shared workflow and an accurate capability note for the active mode. The [official OpenAI MCP guide](https://learn.chatgpt.com/docs/extend/mcp) distinguishes direct local-client connections from ChatGPT web plugins. A remote URL alone does not install a web integration.

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

## MCP (15 local tools; public read-only modes)

The local stdio server (`src/mcp.mjs`) registers 15 tools. Fourteen are read-only; `update_project_task` writes an explicitly requested decision and optional note to the configured private project. It requires the operator's project capability and does not modify website content or resolve an observed finding.

Public stdio mode (`REPROLEAF_PUBLIC_MCP=1`) exposes nine read-only tools. It excludes the three private project tools, the local source/evidence tools and `get_workflow`. Stateless JSON-RPC HTTP (`POST /v1/mcp`) exposes the same nine operations plus `get_schemas` and `get_client_setups`, for 11 read-only tools. The complete local stdio tool list is:

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

The 0.6.1 rule and evidence references above are historical, immutable artifacts. The current 0.7.1 release does not rewrite them or imply a new public evidence release. `docs/PROJECT-CONTEXT.md` explains active application selection without merging legacy and current manifests.

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
- `integrations/wordpress/reproleaf/`: optional administrator plugin that exports published content into the embedded local workspace. Supplementary stored-markup paragraphs require an explicit checkbox. No frontend output, tracking, automatic content edits or forced backlinks.
- `integrations/chrome-extension/`: Manifest V3 `activeTab` inspector that checks the active tab only on explicit button click without `<all_urls>` or background browsing history access.
