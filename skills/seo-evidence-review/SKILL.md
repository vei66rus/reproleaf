---
name: seo-evidence-review
description: Build or review an evidence-backed SEO article brief and content handoff with claim provenance, domain terminology and real link targets. Use for a concrete article workflow; not for promising rankings or changing a site's publishing settings.
---

## Locate the installed CLI

The bundled installer creates `scripts/reproleaf.mjs` and a private toolkit binding inside this skill. Resolve the launcher relative to this `SKILL.md`, not the target project's working directory. Pass its absolute path as one Node argument. Keep the working directory at the target project so relative input files still refer to that project.

Run `node "<absolute-skill-directory>/scripts/reproleaf.mjs" --toolkit-paths` for the absolute CLI and resource paths. If the trusted toolkit checkout moves, reinstall into a new destination or explicitly set `REPROLEAF_ROOT` to its new absolute path. The override selects executable local code, so it must name a trusted checkout. Missing toolkit metadata must not fall back to the target project's `src/cli.mjs`.

Install with the toolkit's `skill install --skill seo-evidence-review --dest <skills-directory>` command. Copying only a template `SKILL.md` does not install the launcher. Registered MCP tools can be used independently.

## Review workflow

Use the `editorial-evidence` workflow from `get_workflow` or the `editorialWorkflow` path returned by `--toolkit-paths`. The owner's project rules are inputs, not universal Google requirements.

- Establish the reader's task, target language and country, primary query, existing-page overlap and the new page's useful contribution. Preserve any separate instruction not to edit or publish existing articles.
- Retrieve only relevant glossary entries. Bind important claims to primary sources, actual observations or reproducible calculations with assumptions. Record dates and uncertainty. Do not invent first-hand experience, interface labels or benchmark outcomes.
- Structure the draft around direct answers and supporting evidence or repeatable actions. Heading count, article length, link count and FAQs follow the task. Do not force keyword repetition or use a plugin color as a quality verdict.
- Plan internal links against a supplied site inventory and propose useful incoming links. Existing pages are not edited just because they appear in that plan. Preserve factual paid-link disclosures when applicable.
- Assemble a packet matching the `editorialSchema` path returned by `--toolkit-paths`, then call `review_editorial_packet` or run `node "<absolute-skill-directory>/scripts/reproleaf.mjs" editorial review --packet <local-file>`. The tool checks declared records and supported Markdown syntax. It does not fetch sources, discover every claim, validate factual truth or approve publication.
- Resolve deterministic errors, then separately review factual support, intent coverage, terminology, readability, media rights and mobile legibility. Findings need a quoted passage or a specific missing record, not a generic quality score.

Hand off the brief/draft, source and calculation records, glossary proposals, link plan, unresolved findings and publishing status. Keep private strategies, unpublished content, original glossaries and credentials local. Publication, paid API use and shared-glossary changes remain within the user's actual authorization.
