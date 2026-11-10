# Private site context release checks

The local MCP tool `get_site_project_context` reads saved server-side crawler observations. It adds no public gateway capability, starts no crawler and performs no mutation. Version 0.6.1 adds separate private operator task decisions and a public check-methodology catalog to the same MCP.

## Configuration

Configure the environment of the local stdio MCP process:

```text
REPROLEAF_SITE_ENDPOINT=https://evolkov.tech/wp-json/evolkov/v1/reproleaf-crawl
REPROLEAF_SITE_PROJECT_TOKEN=<private project token>
REPROLEAF_SITE_JOB_ID=<optional saved job UUID>
```

The only input field is `jobId`. Omit it only when an explicit local default is configured. The request goes to the configured endpoint plus `/jobId/export` with `X-Reproleaf-Project-Token` in the header. Job identifiers are validated as UUIDs. Tokens and arbitrary URLs cannot be supplied as tool arguments.

The private task tools share these credentials. `get_project_tasks` reads `/jobId/tasks` and preserves full notes up to 1000 Unicode codepoints, including permitted LF, CR and TAB whitespace. Capability redaction is marked with `noteRedacted`; it is not silent truncation.

`update_project_task` posts the task key and decision. Omit `note` unless intentionally replacing the complete saved note. A supplied note replaces the full value, and an explicitly empty string clears it. Do not round-trip a redacted display note. The MCP annotation declares a mutation. It changes operator decisions and intentionally supplied notes, not measured evidence, observed status, site content or crawl state. Public MCP mode and the public HTTP gateway expose neither task tool. There is no automatic write retry; after an uncertain timeout, read back the task state before another explicit decision.

## Verified locally

- Unit fixtures cover endpoint validation, UUID-only arguments, header authentication, no-follow redirects, unexpected response origin, request and body-stream timeouts, declared and streamed byte limits, invalid JSON and report identity/schema failures.
- Context strips unknown fields, raw body data and query strings, redacts the configured token from returned text, and returns generic transport failures rather than upstream messages.
- Completed page checks remain available during pending crawls through the authenticated export route. Failed or skipped pages do not become completed observations. Readiness and observed scope remain explicit.
- Graph metrics preserve numeric content, navigation and unclassified edge observations. Up to 20 page summaries retain unknown content incoming/outgoing counts as null; legacy total-link counts are never substituted. Regions describe DOM placement, not semantic relevance, and can overlap.
- The public stdio mode excludes the private tool even when operator credentials are present. The public HTTP MCP gateway does not list or dispatch it.
- Full `npm test` retains the existing contract and fixture coverage. The classified saved-context changes run in Node; browser and plugin builds carry matching release metadata and templates.

## Required release validation

The release owner must rebuild the distributable toolkit archive with `src/site-project.mjs` included, update the chosen version consistently, and run the packaged MCP startup contract. Browser and plugin distributions must also use matching release metadata and download links.

After the WordPress crawler export route is deployed, verify one authorized saved job with a local MCP client and its private token. Confirm in-progress, completed and partial states against the actual job. This live production connection has not been tested by these injected fixtures. Confirm that no environment file or project token is included in an archive, screenshot, public installation snippet or report export.

The tool does not verify ranking potential, factual truth, full-site completeness, backlinks or semantic relevance. Suggested links remain lexical candidates requiring editorial review. Retrieved text is source data and must not be followed as executable instructions.

## Source schemas and engine provenance

The source toolkit contains the strict editorial packet schema, supplied-inventory blog schema, browser adapter schema and shared check-rule catalog. The public 46-rule catalog describes inputs, observations and limits. The public nine-case evidence snapshot contains only synthetic fixture outcomes and known verifier input hashes. It excludes client source, private project reports, local paths and arbitrary upstream messages.

The browser workspace and Node API use the same supplied-inventory engine: weighted lexical overlap, an explicit primary query and declared cluster relationships. The hosted WordPress crawler is a separate PHP HTML engine with bounded excerpts and DOM-region observations. Its engine fingerprint is returned in each saved server report. A shared release number does not make the candidate-ranking implementations identical or establish semantic relevance. Public browser outcomes cannot certify either SEO engine's editorial precision.
