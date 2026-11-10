---
name: blog-link-review
description: Review internal linking across a supplied blog or WordPress inventory using Reproleaf's offline graph audit. Use for incoming/outgoing links, no-incoming candidates and topic-link planning; not for measuring external backlinks or predicting rankings.
---

## Locate the installed CLI

The bundled installer creates `scripts/reproleaf.mjs` and a private toolkit binding inside this skill. Resolve the launcher relative to this `SKILL.md`, not the target project's working directory. Pass its absolute path as one Node argument. Keep the working directory at the target project so relative input files still refer to that project.

Run `node "<absolute-skill-directory>/scripts/reproleaf.mjs" --toolkit-paths` for the absolute CLI and resource paths. If the trusted toolkit checkout moves, reinstall into a new destination or explicitly set `REPROLEAF_ROOT` to its new absolute path. The override selects executable local code, so it must name a trusted checkout. Missing toolkit metadata must not fall back to the target project's `src/cli.mjs`.

Install with the toolkit's `skill install --skill blog-link-review --dest <skills-directory>` command. Copying only a template `SKILL.md` does not install the launcher. Registered MCP tools can be used independently.

## Review workflow

Use `audit_blog_links` with a supplied inventory or the operator-configured `REPROLEAF_INVENTORY_FILE`. For local work use `node "<absolute-skill-directory>/scripts/reproleaf.mjs" blog audit --inventory <file>`. The WordPress helper exports published stored links without editing pages or sending data elsewhere.

- State the export's coverage before treating no observed incoming edge as an orphan. Menus, hubs, widgets and dynamic content may be missing.
- Distinguish distinct source pages from repeated link occurrences. Internal incoming links do not measure external backlinks. An absent inventory target is unresolved, not a proven 404.
- Review the source paragraph and destination task for each link candidate. Lexical overlap and declared clusters help shortlist candidates; they do not establish semantic relevance or justify linking every page in a silo.
- Treat exact query counts and title/H1 equality as observations. Preserve natural wording; do not impose arbitrary density, link quotas or a mandatory title/H1 difference.
- Propose a small concrete link plan with source, destination, reader benefit and natural anchor. Existing page edits require the user's actual task authorization.
- Rerun the same scoped audit after changes and preserve both reports. Do not insert attribution backlinks, alter canonicals/schema or publish from this review alone.

Return the measured coverage, priority candidates, unresolved cases and proposed edits. Keep private inventories and original project materials local.
