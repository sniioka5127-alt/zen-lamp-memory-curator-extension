# ZEN LAMP Memory Curator Extension

A local-first browser extension for turning long AI conversations into structured memory candidates that a **human explicitly reviews and approves**, with a governed Room 3 Context Bridge runtime.

Current extension development version: **MC-01 + CB-06 / v0.3.0**.

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

The popup now includes **Open Context Bridge**, which opens a dedicated browser runtime for CB-01 through CB-06.

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

## Local First / Privacy

The extension itself does not call an AI API.

Conversation text, drafts, ContextItems, and Core governance records are stored in `chrome.storage.local`. Nothing is sent to an external AI unless the user explicitly copies / hands it off.

CB-03 local detection is assistive, not comprehensive. It supports email, phone-like strings, IPv4, representative credential-like strings, exact custom literals, and the underlying Core also supports Human-selected manual ranges. It does **not** claim complete PII or person-name detection.

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

## Install on Chrome / Edge

1. Download or clone this repository.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Turn on Developer mode.
4. Click **Load unpacked**.
5. Select the folder containing `manifest.json`.
6. Open the extension popup for Memory Curator, or click **Open Context Bridge** for Room 3.

## Tests

```bash
node --test tests/*.test.mjs
```

GitHub Actions validates the Human Agency Core, MC-01 contract, Context Bridge Core, and CB-06 browser runtime contract.

## License

MIT License
