# Contributing to Reproleaf

Reproleaf accepts synthetic mobile web regression cases, deterministic SEO/editorial checks, and portable adapter improvements.

## Case Contribution Rules

1. **Synthetic code only:** Every contributed case must be written from scratch with synthetic content. Do not include client code, proprietary designs, customer names, internal URLs, analytics IDs, emails, API keys, or local filesystem paths.
2. **Broken and fixed variants:** Each case must reproduce a concrete failure mode in `?variant=broken` and pass the independent behavioral check in `?variant=fixed` at both `360x640` and `390x844`.
3. **Outcome-based check:** Checks must observe layout geometry, hit targets (`elementFromPoint`), scroll position, or focus visibility — never inspect `?variant=`, fixture class names, or CSS rules directly.
4. **Honest limitations:** Document what the check does not prove (for example, Chromium viewport emulation vs physical iOS/Android hardware).

## Validating a Contribution Locally

Prepare a JSON contribution packet and run:

```sh
node src/cli.mjs contribute --packet my-case-contribution.json
```

Or validate via the local API:

```sh
curl -X POST http://127.0.0.1:4180/v1/contribution-preview \
  -H "Content-Type: application/json" \
  -d @my-case-contribution.json
```

The validator checks schema completeness, scans for accidental secrets/emails/user paths (`RL_PRIVATE_DATA_DETECTED`), and generates a `cases/catalog.json` candidate entry with a SHA-256 integrity hash.
