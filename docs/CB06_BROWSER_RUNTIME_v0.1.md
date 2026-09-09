# CB-06｜Context Bridge Browser Runtime Integration v0.1

Status: **Implemented candidate**

## Purpose

CB-06 connects the already-implemented Room 3 Core phases (CB-01 through CB-05) to a browser UI without weakening their authority boundaries.

The browser runtime is an orchestration layer. It does not become a new source of memory truth and it does not bypass Human Gates.

## Runtime flow

1. Select one existing Human Agency Project.
2. State the transfer purpose and target mode.
3. Run CB-02 and review `proposal_only` ContextItem candidates.
4. Human explicitly chooses the ContextItems to include.
5. Create a CB-01 ContextPackage draft, submit it, then Human-approve the exact revision.
6. Run CB-03 local redaction hints and whole-item exclusion review.
7. Human decides each finding: redact, explicitly keep, or exclude the whole ContextItem.
8. Human approves the privacy-reduced TransferView.
9. Run CB-04 to produce Generic / GPT / Claude / Gemini renderings from one canonical payload.
10. Copying a rendering records only a CB-05 outbound attempt.
11. After the user actually performs the manual handoff, the user may create a Human-confirmed receipt. Provider delivery remains `unverified`.

## UI entry point

`popup.html` remains the Room 2 Memory Curator popup.

CB-06 adds an **Open Context Bridge** action that opens the dedicated extension page:

- `context-bridge.html`
- `context-bridge.css`
- `context-bridge.js`

The dedicated page is used instead of compressing the five-gate Room 3 workflow into the popup.

## Human Authority invariants

CB-06 must preserve all existing Core rules:

- CB-02 recommendations never become selected authority automatically.
- ContextPackage approval is Human-only and revision-bound.
- Redaction findings are proposals, not automatic privacy decisions.
- TransferView approval is Human-only.
- Provider rendering cannot add, remove, or rewrite canonical semantic content.
- Rendering is `rendered_not_sent`.
- Copying records `attempted_not_confirmed` only.
- A handoff receipt is Human-confirmed evidence of a manual outbound action, not provider-confirmed delivery.
- Provider receipt / ingestion / processing is not claimed.

## Privacy

CB-06 uses `chrome.storage.local` and the existing Core stores.

The optional CB-06 session record stores references and UI controls only:

- Project ID
- ContextPackage ID
- RedactionPlan ID
- TransferView ID
- purpose / target UI settings

It deliberately does **not** duplicate:

- canonical JSON
- rendered provider prompt text
- ContextItem bodies as a separate session cache
- pre-redaction sensitive strings

CB-03 and CB-05 retain their own previously defined content-minimization rules.

## Redaction UI scope

The browser runtime exposes:

- local detector findings
- exact custom literals entered by the Human
- redact vs keep-and-acknowledge choice
- whole-ContextItem exclusion

CB-06 v0.1 does not claim complete PII detection or complete person-name detection.

The underlying CB-03 Core still supports manual range redaction. The initial browser runtime emphasizes exact custom literals and whole-item exclusion rather than presenting fragile character-offset editing controls.

## Outbound boundary

No provider API transport is implemented.

The supported runtime path is:

`render → copy → attempt record → Human manual handoff → Human confirmation receipt`

Copying alone must never create a confirmed receipt.

## Roundtable preparation

For a Roundtable target, CB-04 renders every provider from the same canonical payload and fingerprint.

CB-06 confirms provider handoffs individually. When all configured provider receipts exist, CB-05 Roundtable receipt equivalence is checked.

This prepares the evidence boundary for Room 4 without allowing Room 4 to silently receive a different context per provider.

## Failure / stale-state behavior

Any new upstream selection or package action clears downstream in-memory runtime artifacts.

Session reload restores persisted Core references, but does not persist or silently reuse rendered provider text. The user must render again before a new outbound confirmation.

## Non-goals

CB-06 v0.1 does not:

- call an AI API
- click provider websites automatically
- submit forms on provider pages
- verify provider delivery
- infer that pasted content was processed
- auto-approve ContextItems, packages, redactions, or handoffs
- create provider-specific semantic variants

## Release gate

CB-06 may be merged when:

- static runtime contract tests pass
- all existing Human Agency Core tests pass
- popup exposes the Room 3 launcher
- runtime imports CB-01 through CB-05 Core components
- outbound code contains no network/provider automation path
- copy and handoff confirmation remain distinct UI actions
