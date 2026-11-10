# Changelog

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
