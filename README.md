# ZEN LAMP Memory Curator Extension

A local-first browser extension for turning long AI conversations into structured memory candidates that a **human explicitly reviews and approves**.

Current Memory Curator development version: **MC-01 / v0.2.0**.

## Principle

The goal is not to preserve everything.

**AI proposes memory candidates. The human decides what remains.**

Memory Curator is Room 2 of the HIRAKU Tools / Human Agency Workspace.

> One house, four rooms.

- **Chat Atlas** — see / understand
- **Memory Curator** — choose what remains
- **Context Bridge** — choose what travels
- **Roundtable AI** — compare
- **Human Gate** — decide

## MC-01 workflow

1. Paste a long AI conversation, or capture selected text from a page.
2. Choose **Simple / Power User** and **INITIAL / UPDATE**.
3. Generate a Memory Curator prompt.
4. Paste that prompt into ChatGPT, Claude, Gemini, or another AI.
5. Paste the returned `context_items` JSON back into the extension.
6. Each candidate is stored locally as a `PROPOSED` ContextItem.
7. The human explicitly **Approves / Rejects** each item and chooses its Memory Policy.
8. Approved ContextItems can be copied as structured JSON for future use.

### UPDATE mode

If the Existing Memory field is empty, the extension uses already human-approved local ContextItems from the selected Project as the existing memory input.

Legacy memory can still be pasted into the field for gradual migration.

## Human Gate

MC-01 never auto-approves external AI output.

- AI result → `proposed`
- Human Approve → `approved`
- Human Reject → `rejected`
- Editing approved semantic content → `needs_review`

AI-controlled `status`, approval timestamps, or approval metadata are not accepted as ContextItem authority fields.

## Memory is not Context

Memory Curator owns **what remains**.

The legacy **Next Chat Handoff / AI-specific Handoff** responsibility has been removed from the MC-01 prompt contract. **Context Bridge** owns transfer and handoff governance.

Room 3 now has four implemented Core phases:

- **CB-01** defines the canonical ContextPackage schema, separate lifecycle, revision-bound Human Gate, source-integrity checks, freshness acknowledgment, and transfer-policy enforcement.
- **CB-02** adds a local deterministic Context Selection Engine that ranks eligible approved ContextItems for a stated purpose while remaining strictly `proposal_only`.
- **CB-03** adds a local Exclusion / Redaction Layer. Detector findings are proposal-only; a human must decide whether to redact, explicitly keep, or exclude content before an approved TransferView exists.
- **CB-04** adds a Context Renderer that converts one approved TransferView into Generic / GPT / Claude / Gemini presentation formats while preserving one identical canonical semantic payload and fingerprint.

CB-03 includes local hints for email, phone-like strings, IPv4 addresses, common credential-like patterns, exact custom literals, and Human-selected manual ranges. It does **not** claim complete PII or person-name detection. Redaction plans do not duplicate the matched sensitive text, and whole-item exclusions do not copy excluded content into the TransferView.

CB-04 provider formatting may differ, but the canonical JSON and semantic fingerprint must remain identical. Roundtable rendering verifies this equivalence before returning provider-specific views. CB-04 still does not call an AI API or mark anything as sent; rendered artifacts remain `rendered_not_sent`.

## Local First / Privacy

The extension itself does not call an AI API.

Conversation text, drafts, and ContextItems are stored in `chrome.storage.local`. Nothing is sent to an external AI unless the user explicitly copies it into an AI service.

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

The reference Core includes Project Store, ContextItem Store, Provenance, Memory / Transfer Policy, Freshness, Audit Log, ContextPackage governance, proposal-only context selection, Human-approved privacy-reduced TransferViews, and canonical provider rendering.

## Install on Chrome / Edge

1. Download or clone this repository.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Turn on Developer mode.
4. Click **Load unpacked**.
5. Select the folder containing `manifest.json`.

## Tests

```bash
node --test tests/*.test.mjs
```

GitHub Actions validates the Human Agency Core, MC-01 contract, and Context Bridge Core tests.

## License

MIT License