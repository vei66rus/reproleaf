export const findingCodeCatalog={
 editorial:[
  {code:'title-not-provided',severity:'warning',scope:'article-metadata'},
  {code:'description-not-provided',severity:'warning',scope:'article-metadata'},
  {code:'primary-query-not-provided',severity:'warning',scope:'query-alignment'},
  {code:'reader-task-not-provided',severity:'warning',scope:'reader-intent'},
  {code:'h1-count',severity:'error',scope:'heading-structure'},
  {code:'heading-level-gap',severity:'warning',scope:'heading-structure'},
  {code:'internal-inventory-not-provided',severity:'warning',scope:'internal-links'},
  {code:'unknown-internal-target',severity:'error',scope:'internal-links'},
  {code:'unsafe-link-scheme',severity:'error',scope:'link-safety'},
  {code:'raw-html-not-audited',severity:'warning',scope:'raw-html'},
  {code:'glossary-variant',severity:'warning',scope:'terminology'},
  {code:'no-declared-claims',severity:'warning',scope:'evidence-records'},
  {code:'duplicate-source-id',severity:'error',scope:'evidence-records'},
  {code:'duplicate-claim-id',severity:'error',scope:'evidence-records'},
  {code:'claim-not-in-draft',severity:'warning',scope:'evidence-records'},
  {code:'unbound-fact',severity:'error',scope:'evidence-records'},
  {code:'unknown-source',severity:'error',scope:'evidence-records'},
  {code:'unreviewed-source',severity:'warning',scope:'evidence-records'},
  {code:'missing-calculation-evidence',severity:'error',scope:'evidence-records'},
  {code:'observation-needs-review',severity:'warning',scope:'evidence-records'},
  {code:'sections-need-editorial-review',severity:'warning',scope:'editorial-review'}
 ],
 blogGraph:[
  {code:'invalid-link-url',severity:'warning',scope:'link-syntax'},
  {code:'no-observed-incoming',severity:'warning',scope:'internal-link-graph'},
  {code:'no-observed-outgoing',severity:'warning',scope:'internal-link-graph'},
  {code:'no-observed-topic-link',severity:'warning',scope:'topic-clusters'},
  {code:'unresolved-internal-targets',severity:'warning',scope:'inventory-boundary'}
 ],
 frontendEvidence:[
  {code:'behavior-failed',severity:'error',scope:'adapter-check'},
  {code:'check-not-completed',severity:'warning',scope:'adapter-check'},
  {code:'setup-error',severity:'warning',scope:'adapter-runtime'},
  {code:'runtime-error',severity:'warning',scope:'adapter-runtime'}
 ]
};

export const errorCodeCatalog=[
 {error:'ai-budget-unavailable',code:'RL_AI_BUDGET_UNAVAILABLE',httpStatus:503,description:'Budget ledger is locked, damaged or unavailable; no AI request was dispatched.'},
 {error:'ai-configuration',code:'RL_AI_CONFIGURATION',httpStatus:503,description:'Explicit AI model, prices, budget and activation are required.'},
 {error:'host-rejected',code:'RL_HOST_REJECTED',httpStatus:403,description:'Request Host header does not match the bound local API address.'},
 {error:'origin-rejected',code:'RL_ORIGIN_REJECTED',httpStatus:403,description:'Request Origin header is not permitted.'},
 {error:'not-found',code:'RL_NOT_FOUND',httpStatus:404,description:'Endpoint path does not exist.'},
 {error:'method-not-allowed',code:'RL_METHOD_NOT_ALLOWED',httpStatus:405,description:'HTTP method is not supported by this endpoint.'},
 {error:'post-required',code:'RL_POST_REQUIRED',httpStatus:405,description:'Endpoint requires HTTP POST.'},
 {error:'request-timeout',code:'RL_REQUEST_TIMEOUT',httpStatus:408,description:'Request body or execution exceeded requestTimeoutMs.'},
 {error:'application-json-required',code:'RL_JSON_REQUIRED',httpStatus:415,description:'Content-Type must be application/json.'},
 {error:'body-too-large',code:'RL_BODY_TOO_LARGE',httpStatus:413,description:'Request payload exceeds configured byte budget.'},
 {error:'rate-limit-exceeded',code:'RL_RATE_LIMIT',httpStatus:429,description:'Too many requests within the active rate-limit window.'},
 {error:'concurrency-limit-exceeded',code:'RL_CONCURRENCY_LIMIT',httpStatus:429,description:'Too many concurrent requests are already in flight.'},
 {error:'ai-budget-exceeded',code:'RL_AI_BUDGET_EXCEEDED',httpStatus:429,description:'Daily server AI spending limit has been reached.'},
 {error:'ai-disabled',code:'RL_AI_DISABLED',httpStatus:503,description:'Server AI layer is not configured; deterministic checks remain available.'},
 {error:'ai-upstream-error',code:'RL_AI_UPSTREAM_ERROR',httpStatus:502,description:'Upstream AI model request failed; deterministic report remains intact.'},
 {error:'private-data-detected',code:'RL_PRIVATE_DATA_DETECTED',httpStatus:400,description:'Payload contains a secret token, email address or local filesystem user path.'},
 {error:'invalid-input',code:'RL_INVALID_INPUT',httpStatus:400,description:'Request JSON is malformed or failed schema validation.'}
];

export const clientSetups=[
 {
  id:'codex',
  name:'OpenAI Codex CLI',
  icon:'codex',
  connectionKind:'stdio-mcp',
  verifiedLocalStdio:true,
  configLocation:'~/.codex/config.toml',
  configSnippet:'[mcp_servers.reproleaf]\ncommand = "node"\nargs = ["/absolute/path/to/reproleaf/src/mcp.mjs"]',
  setupSteps:[
   'Unpack the local Reproleaf kit and run npm ci inside its directory.',
   'Add the [mcp_servers.reproleaf] block to ~/.codex/config.toml with the absolute path to src/mcp.mjs.',
   'Start Codex CLI and verify the server appears in the active MCP tool list.'
  ],
  verifyConnection:'Run list_workflows or diagnose_project from Codex CLI and confirm JSON output is returned.',
  firstUsefulPrompt:'Call diagnose_project for a React SSR page where a fixed bottom bar covers a focused form input, then show the preconditions and adapterTemplate.',
  honestyNote:'Requires local stdio MCP configuration in ~/.codex/config.toml.'
 },
 {
  id:'claude-code',
  name:'Claude Code',
  icon:'claude',
  connectionKind:'stdio-mcp',
  verifiedLocalStdio:true,
  configLocation:'.mcp.json or claude mcp add',
  configSnippet:'claude mcp add reproleaf -- node /absolute/path/to/reproleaf/src/mcp.mjs',
  setupSteps:[
   'Install dependencies in the unpacked Reproleaf directory with npm ci.',
   'Register the stdio server via claude mcp add reproleaf -- node /absolute/path/to/reproleaf/src/mcp.mjs.',
   'Run claude mcp list to confirm reproleaf is connected.'
  ],
  verifyConnection:'claude mcp get reproleaf',
  firstUsefulPrompt:'Use reproleaf diagnose_project for an Astro islands disclosure button that resets aria-expanded on hydration, and prepare an adapter check.',
  honestyNote:'Uses local stdio MCP registration; no external cloud token is required.'
 },
 {
  id:'gemini-cli',
  name:'Gemini CLI',
  icon:'gemini',
  connectionKind:'stdio-mcp',
  verifiedLocalStdio:true,
  configLocation:'~/.gemini/settings.json',
  configSnippet:'{\n  "mcpServers": {\n    "reproleaf": {\n      "command": "node",\n      "args": ["/absolute/path/to/reproleaf/src/mcp.mjs"]\n    }\n  }\n}',
  setupSteps:[
   'Unpack the Reproleaf kit and run npm ci.',
   'Add the reproleaf entry under mcpServers in ~/.gemini/settings.json.',
   'Launch Gemini CLI and run /mcp to inspect the registered tool set and its write boundaries.'
  ],
  verifyConnection:'In Gemini CLI, execute /mcp. Default local stdio registers 15 tools, including the explicit update_project_task mutation; REPROLEAF_PUBLIC_MCP=1 registers nine read-only tools. The separate HTTP gateway lists 11 read-only tools.',
  firstUsefulPrompt:'Call review_editorial_packet or diagnose_project to inspect headings, internal links, or mobile UI preconditions.',
  honestyNote:'The stdio process runs locally. Private project tools contact only the operator-configured endpoint when invoked; public mode omits those tools.'
 },
 {
  id:'chatgpt',
  name:'ChatGPT Web / Report Handoff',
  icon:'chatgpt',
  connectionKind:'prompt-handoff',
  verifiedLocalStdio:false,
  configLocation:'Manual browser prompt handoff',
  configSnippet:'Copy the structured report prompt in the Reproleaf web workspace and paste it into ChatGPT. A remote MCP URL alone does not install a ChatGPT web integration; supported app/plugin setup is separate.',
  setupSteps:[
   'Run the deterministic check in the Reproleaf browser workspace first.',
   'Use the Discuss with AI panel to copy the structured report prompt (draft excluded by default unless explicitly checked).',
   'Paste the prompt into ChatGPT; opening the chat window alone does not install an MCP server.'
  ],
  verifyConnection:'Verify that the pasted prompt contains the Reproleaf JSON report block before asking for editorial or layout advice.',
  firstUsefulPrompt:'Review the attached Reproleaf findings and propose edits for each warning without inventing URLs or unverified facts.',
  honestyNote:'Opening ChatGPT in a browser tab is a manual prompt handoff, not an automatic MCP installation.'
 },
 {
  id:'grok',
  name:'Grok / Web Chat Handoff',
  icon:'grok',
  connectionKind:'prompt-handoff',
  verifiedLocalStdio:false,
  configLocation:'Manual clipboard handoff from Reproleaf report',
  configSnippet:'Copy the Reproleaf JSON report or AI handoff prompt and paste it into your Grok conversation.',
  setupSteps:[
   'Generate a deterministic report in Reproleaf (SEO workspace, link graph, or CLI adapter report).',
   'Copy the prepared prompt from the handoff preview.',
   'Paste it into Grok to discuss prioritization and wording changes.'
  ],
  verifyConnection:'Confirm the deterministic JSON report is included in the copied text.',
  firstUsefulPrompt:'Summarize the prioritized fixes from this Reproleaf report while preserving all stated evidence limits.',
  honestyNote:'Web chat handoff only; no direct local MCP bridge is claimed.'
 }
];
