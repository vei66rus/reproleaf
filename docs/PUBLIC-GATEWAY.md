# Public HTTP gateway

Version 0.7.1 hardens the stateless `/v1/mcp` endpoint. It exposes eleven read-only tools and does not expose local source files, saved private projects, task mutation, arbitrary file paths or paid model calls. Deployment templates are optional; building or testing the package does not publish an endpoint.

The installed official MCP client SDK is covered by a local Streamable HTTP test: initialize, server version, tool listing, rule call and close. The endpoint negotiates `2025-03-26`. Accepted notifications return HTTP 202 with an empty body; bounded request batches are supported, while initialize cannot be batched. Unsupported methods and invalid IDs/parameters produce JSON-RPC errors. An optional GET stream is not offered and returns 405.

POST clients must send `Content-Type: application/json` and accept both `application/json` and `text/event-stream`. A negotiated `MCP-Protocol-Version` header, when present, must match the supported version. Raw HTTP examples and tests must include these headers; a successful basic SDK call is not a guarantee for every client.

## Hosted endpoint

The public URL is `https://evolkov.tech/mcp/reproleaf`. On 10 November 2026, the official MCP client SDK completed HTTPS initialization, listed eleven read-only tools and read the rule/case catalogs. Private/source/mutation tools were denied. Exact-origin rejection, empty notification responses, request size, batch and wrapped-comparison quotas were checked through the actual proxy. The site fallback and its 57-URL sitemap remained available.

The running service has no host mounts, published host ports, site credentials or database network. It runs as a non-root user with a read-only filesystem, 256 MiB memory, half a CPU, 64 processes, two concurrent requests and thirty requests per client per minute. Its dedicated Docker bridge is internal and shared only with the HTTPS proxy. These configuration and probe checks do not establish a general sandbox or availability guarantee.

Client-supplied text is processed remotely when a review tool is called. Do not submit secrets or private project tokens. The endpoint does not retain article bodies or create a site project, and the deployment does not log request bodies. Local stdio remains available for local-only review. A ChatGPT web plugin/app connection and account availability are separate; this URL is not a one-click web installation.

For a Codex CLI remote connection, add a separate entry to your user configuration:

```toml
[mcp_servers.reproleaf_public]
url = "https://evolkov.tech/mcp/reproleaf"
```

This public endpoint requires no authentication token. Keep an existing local `reproleaf` configuration if you need local fixtures or saved private project tools. Ask the connected client to call `list_check_rules` and `get_check_rule` with `id: "editorial:h1-count"` before submitting article data. Configuration format: [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). The release acceptance used the official MCP SDK; it did not install the endpoint into every supported client or a ChatGPT web account.

## Hosting boundary

`startApi` defaults to `listenHost: '127.0.0.1'` and `publicGatewayOnly: false`, preserving the full local API. The only supported addresses are `127.0.0.1`, `::1` and `0.0.0.0`. Binding `0.0.0.0` requires explicit `publicGatewayOnly: true`; arbitrary interface addresses and a non-loopback full API are rejected before listening.

Public-only mode serves only `/v1/mcp` and `/health`. Every other HTTP route returns 404. It skips AI environment/configuration and budget-ledger initialization entirely, regardless of ambient credentials or supplied AI options. Health identifies public-gateway mode and reports AI disabled. Local file/private project/mutation tools remain absent.

For a Caddy container on a separate bridge, use public-only mode on `0.0.0.0` inside a dedicated container network, with no host port publication. Caddy can reach its explicit service alias; a host-loopback-only listener in another network namespace would not be reachable. Put HTTPS in front of the exact MCP path. Keep the gateway separate from WordPress, without site credentials, database-network access, secrets or host mounts. The proxy/container configuration and actual trusted peer addresses belong to the operator and are not enabled by this package.

`allowedOrigins` accepts exact HTTP(S) origins, including scheme and authority. Adding an `allowedHosts` entry does not authorize an Origin. Requests without Origin remain valid for CLI clients. No cross-origin browser access or ChatGPT web installation follows from having a remote URL; a web app/plugin connection is separate. The browser report prompt remains a manual handoff.

Forwarded client identity is ignored unless the socket peer is explicitly present in `trustedProxyPeers`. Entries are IP literals, not DNS names or wildcards. With a trusted peer, X-Forwarded-For is validated and read from right to left until the nearest untrusted hop. The proxy must overwrite or correctly append the real remote address; it must not pass an attacker-controlled identity as authoritative. Other processes sharing that trusted network boundary are trusted too.

`maxRateBuckets` defaults to 1000. New identities are rejected when all buckets are occupied; active limits are not evicted to admit rotating identities. Default requests use the socket identity, so a loopback reverse proxy without trusted identity configuration shares one rate bucket. Retain global concurrency/resource limits in addition to per-client rate limiting.

## Public work limits

Public HTTP MCP applies these limits before algorithm dispatch. Local CLI and local stdio inventory behavior is unchanged.

| Input | Bound |
| --- | --- |
| Request body | 1 MiB by default |
| JSON depth / elements | 32 / 50000 |
| JSON-RPC batch | 8 messages |
| Blog inventory | 100 pages, 10000 links, 200000 supplied UTF-16 text units |
| Editorial input | 50000 Markdown units, 200 glossary variants |
| Comparison | 2000 rows per recognized collection; 4000 total across both effective reports |
| Combined estimated work | 2000000 units per request/batch |

Blog work counts pages squared, supplied links and text. Editorial work counts Markdown length multiplied by one plus the variant count. Work estimates are conservative input quotas, not CPU time measurements. A request can exceed a combined budget even when individual field limits pass. Tool descriptions and `/v1/schemas` disclose the public caps.

Comparison quotas unwrap the same single `report` envelope consumed by normalization, for both before and after. Nested envelopes, ambiguous outer collections and non-array recognized collections are rejected before dispatch. Wrapping a report does not bypass its quota.

`requestTimeoutMs` is an I/O deadline. It cannot interrupt synchronous JavaScript analysis, and this candidate does not claim a hard CPU deadline. Use process/container CPU and memory isolation. A future worker implementation would need explicit cancellation and separate tests before making a hard-interruption claim.

## Validation and remaining deployment work

Run `node --test tests/public-gateway.test.mjs` and the full suite on Node 22 and 24. Tests cover the official SDK, notification handling, invalid envelopes, exact origins, trusted/untrusted forwarding, bounded buckets, work caps and private-tool denial.

Before deployment, separately review the actual HTTPS proxy, trusted-peer addresses, authentication policy, resource isolation, logs and external client behavior. No production container or Caddy configuration is enabled by running tests. Historical 0.6.1 check rules and evidence remain unchanged.

## Container template

The files under `deploy/public-gateway/` configure a non-root, read-only service with no host ports, volumes, database network or credentials. It has a 256 MiB memory limit, half a CPU, 64 processes and a 16 MiB temporary filesystem. The launch script accepts an exact public HTTPS origin and one trusted proxy IP. It enables only public gateway mode, with two concurrent requests and thirty requests per client per minute. The process handles graceful termination and caps socket count; these settings do not establish a hard per-call CPU deadline.

Choose an unused private subnet for an internal Docker network. Attach only the reverse proxy and gateway, with fixed addresses. For example, after confirming the subnet is unused:

```sh
docker network create --internal --subnet 172.30.71.0/28 reproleaf_gateway_internal
docker network connect --ip 172.30.71.2 reproleaf_gateway_internal edge_caddy
export REPROLEAF_PUBLIC_ORIGIN=https://example.com
export REPROLEAF_TRUSTED_PROXY=172.30.71.2
export REPROLEAF_GATEWAY_IP=172.30.71.3
docker compose -f deploy/public-gateway/compose.yaml build
docker compose -f deploy/public-gateway/compose.yaml up -d
```

Replace the origin and proxy container name for the installation. The external network must actually be internal; the Compose template does not create or reclassify an existing network. Runtime package downloads and internet access are unnecessary after image construction.

Merge `Caddyfile.example` into the owned HTTPS site and preserve its fallback routes. The exact `/mcp/reproleaf` path rewrites to `/v1/mcp`; no other local API path is exposed. The example strips cookies, authorization and private project credentials, overwrites forwarded identity with the actual remote peer, preserves Origin, limits request size, and disables response caching/indexing. A separate CDN can cause callers to share its source-IP quota unless that additional trust boundary is deliberately configured.

Validate the complete Caddy configuration before reload, then test the public URL with the official SDK. Inspect actual container networks, mounts and limits rather than treating the template as a deployment receipt. References: [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [request body limits](https://caddyserver.com/docs/caddyfile/directives/request_body).
