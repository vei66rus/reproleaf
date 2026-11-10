# Selecting project context

`diagnose_project` ranks candidate checks from supplied metadata. It does not inspect repository files, run an application, confirm a rendering configuration or discover a bug. Existing callers can still pass one stack/dependency context. The added fields are supported by local MCP, public MCP, the HTTP API and CLI.

For a workspace with several applications, supply each application separately:

```json
{
  "applications": [
    {"id":"legacy","dependencies":{"nuxt":"4"}},
    {"id":"site","dependencies":{"astro":"7","vue":"3"}}
  ],
  "activeApplication":"site",
  "symptom":"Disclosure state resets after hydration",
  "interaction":{"hydratesServerHtml":true}
}
```

Without `activeApplication`, multiple applications produce `status: needs-application-selection`, an empty `matchedRules` array and `adapterTemplate: null`. Application summaries let the caller choose. One supplied application is selected automatically. IDs are bounded labels, not filesystem paths. Unknown or duplicate IDs, excessive metadata and attempts to merge top-level stack/dependencies with application metadata are rejected.

For the CLI, save metadata in a JSON file, then run:

```sh
node src/cli.mjs diagnose --context examples/project-context.json
node src/cli.mjs diagnose --context examples/project-context.json --application site
```

`--context` and `--package` are mutually exclusive and each input is limited to 256 KiB. Only the explicitly named file is read. CLI flags can supply the symptom or active application. In a selected application, declare `renderMode` inside that application's object; this avoids combining route configuration from a different application.

Rendering output includes `renderModeSource`, `possibleRenderModes` and warnings. An explicit `renderMode` is marked `declared`, not independently verified. An Astro dependency can identify an islands-capable architecture but cannot prove that a particular route hydrates a component. Multiple rendering frameworks, WordPress integrations, arbitrary JavaScript dependencies and words such as "SSR" in a symptom do not establish rendering mode.

`interaction.canvasOwnsPageNavigation: false` excludes the canvas page-navigation trap case. `interaction.hydratesServerHtml: false` excludes hydration cases. Missing values remain unknown. A positive value cannot confirm all case preconditions: every candidate retains `applicabilityStatus: requires-precondition-check` and `verificationStatus: not-run`. Adapter selectors are templates that must be customized and checked on the actual page before editing it.

These changes are packaged as the local 0.6.1 review candidate. The immutable published 0.6.0 distribution and its evidence remain unchanged. Building or accepting a local candidate does not publish it.
