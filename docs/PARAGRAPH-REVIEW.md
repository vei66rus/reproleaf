# Paragraph evidence and research status

Version 0.7.0 retains the established inventory algorithm and exact donor-span validation. Three unreleased paragraph retrieval experiments failed independent quality gates and have been quarantined from the distributed source and public interfaces. They are not available as selectable modes, CLI features, API options or MCP tools.

## Available behavior

The shared blog inventory schema accepts an omitted recommendationMode or the explicit value legacy. It rejects the experimental paragraph-v1, paragraph-v2 and paragraph-context-v3 values. CLI file input, inline MCP input and the HTTP endpoint use this same schema.

Optional pages[].passageInventory stores bounded supplementary observations for inspection and export. The separate production validator checks Unicode, coordinates, ordinals, coverage and serialized size. It does not run experimental retrieval or establish semantic relevance. Omitted link region means unknown; content/navigation/unknown annotations do not change legacy recommendations.

The optional WordPress administrator exporter can include supplementary paragraphs from saved published markup. It excludes private and password-protected posts, does not render a live page or execute dynamic shortcodes, and adds no frontend output, tracking, automatic edits or mandatory backlinks. Other systems can supply the inventory schema; WordPress is not required.

## What exact spans prove

anchorEvidence identifies an exact substring in the unchanged named donor excerpt. Half-open offsets count Unicode code points, not UTF-16 units or visible glyphs. Case, whitespace, entity decoding and Unicode normalization do not manufacture a literal span. A proposed anchor absent from that excerpt is distinguished from a literal span.

Renderers must validate stored evidence against the actual displayed fields after redaction or transformation. Missing, forged or shifted metadata remains unconfirmed. Excerpts are text data; insert them as text, not HTML. Supplied document positions and hashes do not establish the identity or current state of a live document.

A literal anchor can still refer to the wrong meaning, role or polarity. It is text-location evidence, not semantic approval, an automatic linking instruction or a search ranking prediction.

## Why the experiments are not distributed

Each implementation was frozen before its separate evaluation output. Earlier negative results were retained. The small samples do not estimate production accuracy; paired language versions are not independent observations.

| Private experiment / runtime | Useful pairs retrieved, RU / EN | Harmful candidates emitted, RU / EN | Outcome |
| --- | --- | --- | --- |
| V1, Node: heading terms and literal donor anchors | 3/7, 5/7 | 0/4, 0/4 | RU retrieval gate failed. |
| V2, Node/PHP parity: navigation regions and conservative inflection | 5/5, 5/5 | 1/4, 3/4 | Precision gate failed. |
| V3, Node only: additional exact body context terms | 2/6, 3/6 | 2/3, 2/3 | Precision failed; RU retrieval also failed. |

PHP V1 was evaluated separately and retrieved 4/7 useful RU pairs and 6/7 EN pairs; the table's V1 counts are Node results. V2 Node/PHP outputs matched on the evaluated sample. V3 was tested only in Node; no PHP V3 result is claimed.

Three RU V3 controls involved conservative unknown existing-edge suppression. Literal span checks passed, and missing target body content produced no V3 suggestions. These structural successes do not cancel the relevance failures. Two shared body terms did not solve polysemy, semantic roles or negation. No further lexical version is presented as that solution.

Private research snapshots preserve the implementations, authored controls and run instructions. They are excluded from source exports and do not create a public repository or package release.

## Privacy and optional model review

Ordinary local analysis does not send inventories to the toolkit owner. Sanitized exports omit nested raw evidence; review every export before sharing. A private saved-site integration uses its own explicit endpoint and capability token, rather than anonymous usage collection. The Chrome inspector runs on an explicit active-tab action.

Semantic model review is a separate disabled capability. No hosted provider or budget has been approved, and no usable local model was found during this review. Deterministic evidence must not be described as a model judgement. Historical 0.6.1 rule and evidence URLs remain immutable; this source candidate does not replace them.
