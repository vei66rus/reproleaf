# Changelog

## 2.3.1 - 2026-11-16

- Show a short localized no-pair status for after, added and removed metrics when only one XML sitemap is supplied. Preserve numeric zero for an actual unchanged comparison and keep the JSON contract unchanged.
- Keep the single-inventory status inside existing metric cards on RU/EN mobile and desktop layouts; no new components or styles.

## 2.3.0 - 2026-11-16

- Add optional bounded static-HTML facts to the existing inventory report: first HTML title absence, empty description, advisory H1 element count, multiple canonical elements and duplicate descriptions within a locale partition. Missing, ambiguous and oversized values remain unknown; no length score or universal single-H1 requirement is introduced.
- Populate facts from supplied local HTML and successful saved Node crawl HTML, excluding raw HTML from inventory exports. Keep WordPress saved-crawl projection and URL-only behavior unchanged. Add the supported facts to the existing example/help text and CSV/JSON reports.
- Require positive supplied evidence for thirteen inventory rechecks. Recompute duplicate values across complete locale partitions; preserve missing captures, incomplete groups and unknown canonical/robots targets as unverified. This is not source-authenticity or cryptographic engine-version verification, and does not verify unrelated finding-only diffs.
- Leave explicit XHTML DOM facts unsupported rather than infer missing metadata with an HTML parser; retain separately supplied legacy observations.
- Preserve HTTP204/205/206 status while excluding their body-derived metadata and facts from absence/positive-fix claims. Required empty link arrays represent unavailable body evidence, not known empty documents.
- Match document-title capture to the first HTML-namespace title; SVG tooltips and a later nonempty title cannot hide an empty first title. Keep ambiguous multiple-canonical targets unknown.

## 2.2.0 - 2026-11-16

- Add an explicit local-only axe-core 4.14.0 static accessibility audit for CLI and unrestricted stdio MCP. Require browser opt-in; use a bounded child, one active job, separate work/owned-cleanup deadlines and safe unavailable/error outcomes. The transformed DOM excludes source scripts/resources; this is not original-page WCAG certification or operating-system network isolation. Public interfaces remain 44 restricted stdio / 46 local HTTP tools; the separately hosted gateway is unchanged.
- Add metadata-only inventory analysis without link counts, orphan findings, clusters or link recommendations. Retain exact URL identities and unknown fields. The site integration provides an authenticated saved-crawl handoff into the existing workspace without starting a crawl or forwarding project keys.
- Use bounded byte-aware file reads for html-audit, schema-audit and social-audit, preserving supported charset/BOM observations and rejecting malformed or unsupported input. Other HTML CLI paths remain separate; accessibility-audit deliberately accepts UTF-8 files only.
- The WordPress site integration decodes bounded received HTML before both native observers using a curated encoding profile, fixed safe failures and engine fingerprinting. Raw transport byte counts and hashes remain original. The PHP declaration parser has explicitly conservative limits and does not claim full HTML5 encoding support.
- Preserve required axe MPL/third-party licenses and Houtini Apache notices.


## 2.1.0 - 2026-11-16

- Decode received HTML bytes before Node parsing and browser file analysis, with BOM/header/meta precedence, explicit supported encoding observations, fatal malformed-input handling, and separate raw/decoded limits. Pasted Unicode and JSON are not decoded again. The WordPress PHP fetch path is separate and still assumes UTF-8 in this release.
- Add eight supplied-inventory observations for repeated titles/H1, canonical syntax and targets, supplied target HTTP/noindex, chains and cycles. Preserve unknown metadata, explicit locale partitions and URL-only scope. No live target requests or Google-selected canonical claims.
- Convert saved Node crawl JSON into bounded browser inventories with report --format inventory. Exclude source HTML and response headers, preserve final URL identity, and reject aliases that the existing link graph cannot distinguish.
- Add editable nginx/Apache redirect drafts from consistent supplied same-origin permanent chains, with explicit 301/308 selection, exact query-free matching, blocked-case explanations and download. Drafts are never applied automatically.
- Preserve per-URL/rule comparison coverage in private server-project MCP context. The WordPress server integration separately adds evidence-bound partial comparison and readable report scope; finding-only CLI diffs remain unconfirmed.
- Remove duplicate generic-panel headings and include required reused-code notices in browser archives and the optional gateway image. The hosted gateway is not upgraded by this source release.


## 2.0.3 - 2026-11-16

- Treat disappeared findings in finding-only crawl and batch comparisons as unconfirmed, including missing pages and failed reads. These comparisons return `verificationComplete: false`, `ok: false` and CLI exit code 1; `noObservedRegressions` reports only the narrower regression observation. An absent finding is not proof of a fix.
- Correct local Cursor configuration and remote Windsurf transport labels.
- Distinguish configuration examples and transport checks from actual client-app verification.
- Remove obsolete tool counts and unpublished npm installation commands from client recipes.


## 2.0.2 (2026-11-16, source release candidate)

- Add RU/EN supplied-data panels for JSON-LD, Open Graph/Twitter metadata, robots rules, redirect observations and hreflang matrices/XML inventory comparison. These panels do not fetch supplied URLs or claim full Google/Schema.org validation, live bot access or platform preview rendering.
- Add local batch markup review for up to 20 HTML files, 1 MiB each and 5 MiB total, with actual per-file progress, cancellation, exact-content duplicate references and checked/failed/not-processed outcomes. Default exports exclude source HTML and filenames; incomplete coverage never reports an overall successful audit.
- Validate bounded schema/social inputs, real Schema.org context hosts, calendar dates and HTTP(S) metadata URLs. Keep metadata previews text-only and JSON syntax diagnostics free of source snippets.
- Tighten robots matching and supplied redirect-trace validation. Preserve unknown final responses and distinguish incomplete traces, open cycles and return visits that subsequently reach an observed terminal response; method, cookie and state effects remain outside the supplied-trace model.
- Keep absent hreflang targets unconfirmed and sitemap indexes distinct from checked URL inventories. Review benchmark snapshot structure, counts and content digest without claiming observation authenticity or freshness.
- Replace unavailable npm quickstarts with source installation and separate hosted 0.8.0/11-tool gateway observations from the source 50/44/46-tool transports. Preserve historical evidence snapshots.

## 2.0.1 (2026-11-16, source release candidate)

- Add working RU/EN browser panels for GSC CSV review, deterministic keyword cleanup, supplied access logs, authorship/trust observations and supplied-page gap review, with bounded inputs, explicit errors and downloadable results.
- Change the shared webmaster CSV parser contract: reject unknown/duplicate headers, malformed quoting/row widths, missing required metrics, invalid numbers and unsafe totals rather than silently accepting an empty audit or coercing invalid values to zero. Valid supported CSV/TSV/semicolon exports remain supported; malformed inputs that previously appeared successful now fail validation.
- Derive CTR from observed clicks and impressions. Label the fixed CTR selection curve as illustrative rather than a site benchmark or click forecast. Query-only input does not establish competing page URLs or prove cannibalization.
- Preserve exact source counts and explicitly bounded previews. Keyword cleanup normalizes and deduplicates supplied strings with deterministic casing and transparent prefix groups; it does not collect live suggestions or perform semantic/SERP clustering.
- Keep crawler user-agent labels separate from verified identity, supplied trust signals separate from factual authority, and missing observations separate from successful checks. Prevent stale asynchronous file reads from restoring obsolete results; keep raw inputs out of tool event telemetry.

## 0.7.1 (2026-11-10)

- Return empty 202 responses for accepted notifications and validate JSON-RPC IDs, initialization, bounded batches, Accept and protocol headers.
- Enforce exact origin scheme/authority and trust forwarded identities only behind explicit peer IP allowlists.
- Require public-only route isolation for wildcard binding; disable AI configuration and ledger initialization in that mode regardless of ambient settings.
- Cap active rate buckets and reject excessive public input complexity before algorithm dispatch; document that request timeouts do not interrupt synchronous CPU work.
- Verify the eleven-tool public gateway with the official MCP client SDK and retain all private/file/mutation denials.
- Remove the inherited browser-connector promise; a remote URL alone does not install a ChatGPT web integration.
- Keep frozen 0.7.0 archives and historical rule/evidence references unchanged.
- Supply a non-root container template and a verified hosted read-only Streamable HTTP endpoint, isolated from WordPress and private project data.

## 0.7.0 (2026-11-10, local review candidate)

- Bind installed skills to the configured toolkit root so commands work from a separate project directory.
- Record adapter execution policy, blocked transports and final page state; keep incomplete runs distinct from successful checks.
- Validate literal donor spans with Unicode code-point offsets and reject stale or forged evidence after text changes.
- Preserve the legacy inventory algorithm and exact-span evidence. Quarantine unreleased paragraph retrieval experiments after independent retrieval/relevance failures; public CLI/API/MCP reject their mode values.
- Accept bounded supplementary passage observations and optional region annotations without changing legacy recommendation behavior.
- Add optional WordPress stored-paragraph export without frontend tracking, automatic edits or mandatory backlinks.
- Keep paid model review disabled pending provider and budget approval; do not equate exact text evidence with semantic relevance.
- Include guarded source export, portable client/browser checks, citation metadata and paragraph-review limitations. This candidate does not publish a public repository or replace immutable 0.6.1 rule/evidence artifacts.

## 0.6.1 (2026-11-09, local review candidate)

- Require active application selection when metadata describes several applications; never merge a legacy root manifest with the current site.
- Preserve unknown route rendering modes instead of inferring CSR from arbitrary JavaScript dependencies or SSR from symptom words.
- Label Astro inference as architecture metadata; retain ambiguity for mixed rendering frameworks or WordPress integrations.
- Exclude canvas navigation and hydration cases when the caller explicitly says their required interaction is absent.
- Label every ranked case as requiring precondition verification and not executed.
- Add CLI context files, an application selector and shared stdio/HTTP contract coverage.
- Preserve allowlisted target-topic provenance in the private saved-site context and document the hosted PHP title-prefix fallback separately from Node inventory weighting.
- Include the project-context guide in the source distribution and refresh dated synthetic evidence for this candidate.

## 0.6.0 (2026-11-09)

- Publish a bilingual methodology, 46 deterministic check definitions and 9 synthetic browser case citations.
- Sanitize fresh 36-outcome verifier evidence, dependency versions and known input hashes for immutable public snapshots.
- Add list_check_rules and get_check_rule to the single MCP and its read-only public gateway.
- Add private project task reads and explicit operator decisions without changing observed evidence.
- Preserve full Unicode and multiline notes; omit notes on decision-only updates and flag capability-redacted displays.
- Prefer known H1 metadata over title branding for Node inventory candidates while retaining declared queries and cluster behavior.
- Document the separate Node weighted-inventory and hosted PHP HTML heuristics and their explicit limits.

## 0.5.1 (2026-11-09)

- Preserve separate observed content, navigation and unclassified edge counts in the private saved-site MCP context.
- Include up to 20 compact page summaries; unknown content incoming/outgoing observations remain null rather than zero.
- State that DOM link regions do not establish semantic relevance and can overlap.
- Retain allowlisted existing-link and donor-region provenance so navigation-only observations remain visible alongside lexical link suggestions.
- Keep unknown fields and project credentials out of returned context; cover legacy exports, count validation and redaction with injected fixtures.
- Refresh browser, source, WordPress and standalone workspace distributions with matching version metadata and retained licenses.

## 0.5.0 (2026-11-09)

- Add a local-only MCP tool for saved private server crawl observations with optional configured job UUID.
- Preserve in-progress and partial readiness, completed-page checks, observed link graph and conservative comparison counts.
- Bound authenticated HTTPS export reads by timeout and byte limit; reject redirects and redact project credentials from output.
- Keep operator credentials unavailable to public MCP mode and the HTTP gateway.
- Add injected transport and MCP contracts covering schema failures, body limits, timeout, credential redaction and partial reports.
- Package the saved-context release checklist with the source download.

## 0.4.0 (2026-11-09, local release candidate)

- Require explicit AI activation, model, prices and allocation; keep WordPress direct paid calls disabled.
- Persist conservative request reservations with atomic multi-process locking and retain reservations after uncertain upstream results.
- Fail closed on damaged budget storage and pause on unexpected usage.
- Extend report/contribution redaction across token families, metadata, diagnostics and attribution; keep manual review mandatory.
- Add regression coverage for restarts, parallel processes, failures, rollover and adversarial sharing inputs.


## 0.3.0 (2026-11-07)

### Added
- **Project Workspace & Repeat Check Memory (Stage 1):** Named projects in IndexedDB, JSON project archive export and import (`importProjectArchive`), target object filtering, baseline run pinning, per-finding and per-recommendation decisions (`accepted`, `deferred`, `dismissed`), and comparison reports (`new`, `remaining`, `resolved`, `unconfirmed`) with `environmentDiff`.
- **Actionable SEO & Link Graph Workspace (Stage 2):** 5-field editorial findings (`observation`, `why`, `snippet`, `suggestion`, `verifyHint`), topic cluster and hub link graph analysis, donor sentence excerpts, suggested anchors, unresolved internal targets list, and Ahrefs-style dark audit terminal with Issue Explorer tabs, category filters, and instant search.
- **Expanded Mobile Web Suite & Project Diagnosis (Stage 3):** Expanded synthetic corpus to 9 verified cases (`sticky-bar-focus-occlusion`, `async-submit-double-fire`, `ssr-disclosure-hydration-reset`), added `focus-occlusion` check in `src/check-target.mjs`, and added `diagnose_project` and `compare_check_runs` MCP/CLI tools.
- **Client Configs, Stateless MCP & Hardened API (Stage 4):** Added `src/client-setups.mjs` covering 5 agent and web-client targets (`codex`, `claude-code`, `gemini-cli`, `chatgpt`, `grok`), `POST /v1/mcp` stateless JSON-RPC transport, `REPROLEAF_PUBLIC_MCP=1` public mode, and rate/concurrency/timeout guards (`RL_RATE_LIMIT`, `RL_CONCURRENCY_LIMIT`, `RL_REQUEST_TIMEOUT`).
- **Server-Keyed AI Review Prototype (Stage 5, superseded by 0.4.0 safeguards):** Added `src/ai-review.mjs` and WordPress REST proxy `reproleaf-ai.php` with server-only OpenAI key handling, in-flight daily budget protection (`RL_AI_BUDGET_EXCEEDED`), explicit draft opt-in, strict inventory URL allowlist (`droppedHallucinatedUrls`), and `ai-hypothesis-unverified` status labeling.
- **Sanitized Public Sharing, Contribution Validator & Chrome Extension (Stage 6):** Added `src/public-share.mjs` (`POST /v1/sanitize-report`, `POST /v1/contribution-preview`, CLI `sanitize` and `contribute`), browser sanitized report & attribution badge export, and `integrations/chrome-extension/` Manifest V3 `activeTab` inspector.
