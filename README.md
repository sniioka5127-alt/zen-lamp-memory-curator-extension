# ZEN LAMP Memory Curator Extension

A local-first browser extension for turning long AI conversations into structured memory candidates that a **human explicitly reviews and approves**, with a governed Room 3 Context Bridge runtime and Room 4 Roundtable Core evidence / comparison layers.

Current extension / Core development line: **MC-01 + CB-06 + RT-03 / v0.3.0**.

## Principle

The goal is not to preserve everything.

**AI proposes memory candidates. The human decides what remains.**

> One house, four rooms.

- **Chat Atlas** — see / understand
- **Memory Curator** — choose what remains
- **Context Bridge** — choose what travels
- **Roundtable AI** — compare
- **Human Gate** — decide

## Room 2 — Memory Curator

1. Paste a long AI conversation, or capture selected text from a page.
2. Generate the MC-01 curator prompt.
3. Paste the returned `context_items` JSON back into the extension.
4. Each candidate is stored locally as a `PROPOSED` ContextItem.
5. The human explicitly **Approves / Rejects** each item and chooses its Memory Policy.

AI-controlled `status`, approval timestamps, or approval metadata are not accepted as ContextItem authority fields.

## Room 3 — Context Bridge

The popup includes **Open Context Bridge**, which opens a dedicated browser runtime for CB-01 through CB-06.

The runtime flow is:

`purpose → proposal-only selection → Human-chosen ContextItems → ContextPackage Human Gate → exclusion/redaction Human Gate → canonical provider render → copy attempt → Human-confirmed manual handoff`

Room 3 currently includes:

- **CB-01** — ContextPackage schema, lifecycle, revision-bound Human Gate, source integrity, freshness acknowledgment, transfer-policy enforcement.
- **CB-02** — local deterministic Context Selection Engine with explainable `proposal_only` ranking.
- **CB-03** — Exclusion / Redaction Layer with Human redact / keep / whole-item exclude decisions.
- **CB-04** — canonical Generic / GPT / Claude / Gemini rendering with one semantic payload and fingerprint.
- **CB-05** — Transfer Audit / Outbound Handoff Boundary separating `rendered_not_sent`, `attempted_not_confirmed`, and Human-confirmed manual handoff receipts while keeping provider delivery `unverified`.
- **CB-06** — browser runtime orchestration that exposes the full governed flow without adding automated provider transport.

CB-06 stores only session references and UI controls as its optional runtime session record; it does not duplicate canonical JSON or rendered provider prompts into that session cache.

## Room 4 — Roundtable AI

### RT-01 — Canonical Context Input

Before any provider responses are compared, RT-01 verifies that every Roundtable participant is bound to the same Human-approved ContextPackage revision, TransferView, canonical JSON, semantic fingerprint, and exact CB-04 provider rendering. Provider coverage must exactly match the approved Roundtable target.

RT-01 produces a runtime `RoundtableCanonicalInput` with:

- `status = prepared_not_executed`
- one canonical semantic payload
- provider-specific presentation inputs derived from that same payload
- optional CB-05 Human-confirmed handoff evidence
- no winner, model ranking, response interpretation, majority vote, or Human decision

### RT-02 — Provider Response Capture / Provenance

RT-02 captures each provider answer as **raw, uninterpreted evidence** bound to the exact RT-01 input.

RT-02 v0.1 is manual-only:

- `manual_paste`
- `manual_file`
- `other_manual`

Because provider attribution is manually asserted, capture requires a Human actor and records:

- `status = captured_raw_uninterpreted`
- `authority = evidence_only_no_interpretation`
- `source_authenticity = human_attested_unverified`
- exact raw response text, preserving whitespace and line breaks
- RT-01 input ID, provider, rendering ID, ContextPackage revision, TransferView, and canonical semantic fingerprint
- a lightweight response fingerprint for mutation detection

RT-02 does not trim, rewrite, summarize, translate, classify, compare, score, majority-vote, or select a winner.

If a capture must be corrected, RT-02 creates a new record with `supersedes_response_id`; the earlier raw response remains unchanged as historical evidence.

Optional CB-05 handoff receipts may strengthen provenance, but `provider_delivery_status` remains `unverified` and provider-origin authenticity remains Human-attested rather than provider-authenticated.

### RT-03 — Response Comparison / Disagreement Matrix

RT-03 compares exactly one intact RT-02 response for every provider in the RT-01 provider set.

Its output is deliberately descriptive:

- `status = compared_not_decided`
- `authority = descriptive_no_truth_claim`
- exact normalized wording shared across all selected provider responses
- provider-unique wording segments as candidates for later review
- pairwise lexical overlap, exact shared-segment counts, and response-length diagnostics
- mandatory `interpretive_review.required = true`

RT-03 is local and deterministic. Its lexical analysis uses normal word tokens plus CJK bigrams so Japanese text does not depend on whitespace tokenization.

Exact shared wording means only that equivalent normalized text appears in every response. Pairwise lexical overlap is a diagnostic measure, not semantic agreement, model quality, or factual correctness.

RT-03 never creates `winner`, `decision`, `truth`, `majority_choice`, `model_ranking`, or `recommended_provider` fields. **Majority agreement is not converted into truth or Human authority.**

## Local First / Privacy

The extension itself does not call an AI API.

Conversation text, drafts, ContextItems, and Core governance records are stored in `chrome.storage.local`. Nothing is sent to an external AI unless the user explicitly copies / hands it off.

CB-03 local detection is assistive, not comprehensive. It supports email, phone-like strings, IPv4, representative credential-like strings, exact custom literals, and the underlying Core also supports Human-selected manual ranges. It does **not** claim complete PII or person-name detection.

RT-01 does not create a new persistent copy of canonical JSON or rendered provider prompts. RT-02 intentionally persists the raw provider response because that exact text is the evidence being governed. RT-03 computes a runtime comparison from those governed responses and does not add a new persistent comparison store in v0.1. Audit Log entries remain metadata-only and do not duplicate provider response bodies.

## Human Agency Core v0.1

The shared foundation includes:

- [`Human Agency Core v0.1`](docs/HUMAN_AGENCY_CORE_v0.1.md)
- [`Project Schema v0.1`](docs/PROJECT_SCHEMA_v0.1.md)
- [`ContextItem Schema v0.1`](docs/CONTEXT_ITEM_SCHEMA_v0.1.md)
- [`4 Module Boundary Spec v0.1`](docs/MODULE_BOUNDARY_SPEC_v0.1.md)
- [`MC-01 Migration Plan`](docs/MC01_PLAN_v0.1.md)
- [`CB-01 ContextPackage / State Machine / Human Gate`](docs/CB01_CONTEXT_PACKAGE_v0.1.md)
- [`CB-02 Context Selection Engine`](docs/CB02_CONTEXT_SELECTION_ENGINE_v0.1.md)
- [`CB-03 Exclusion / Redaction Layer`](docs/CB03_EXCLUSION_REDACTION_v0.1.md)
- [`CB-04 Context Renderer`](docs/CB04_CONTEXT_RENDERER_v0.1.md)
- [`CB-05 Transfer Audit / Outbound Handoff Boundary`](docs/CB05_TRANSFER_AUDIT_OUTBOUND_BOUNDARY_v0.1.md)
- [`CB-06 Browser Runtime Integration`](docs/CB06_BROWSER_RUNTIME_v0.1.md)
- [`RT-01 Roundtable Canonical Context Input`](docs/RT01_ROUNDTABLE_CANONICAL_CONTEXT_INPUT_v0.1.md)
- [`RT-02 Provider Response Capture / Provenance`](docs/RT02_PROVIDER_RESPONSE_CAPTURE_v0.1.md)
- [`RT-03 Response Comparison / Disagreement Matrix`](docs/RT03_RESPONSE_COMPARISON_MATRIX_v0.1.md)

## Install on Chrome / Edge

1. Download or clone this repository.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Turn on Developer mode.
4. Click **Load unpacked**.
5. Select the folder containing `manifest.json`.
6. Open the extension popup for Memory Curator, or click **Open Context Bridge** for Room 3.

RT-01 through RT-03 are currently Core contracts; a dedicated Room 4 browser runtime comes in a later phase.

## Tests

```bash
node --test tests/*.test.mjs
```

GitHub Actions validates the Human Agency Core, MC-01 contract, Context Bridge Core / browser runtime, and RT-01 through RT-03 Roundtable contracts.

## License

MIT License
