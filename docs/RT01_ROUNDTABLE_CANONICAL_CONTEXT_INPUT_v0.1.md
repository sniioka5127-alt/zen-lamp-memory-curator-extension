# RT-01｜Roundtable AI Canonical Context Input v0.1

## Purpose

RT-01 is the first Core phase for **Room 4 — Roundtable AI**.

Its purpose is to ensure that every compared AI begins from the **same Human-approved canonical context** before any response comparison starts.

RT-01 does **not** execute an AI, collect responses, vote, rank models, or make a decision.

## Boundary

```text
CB-01 Human-approved ContextPackage
  ↓
CB-03 Human-approved TransferView
  ↓
CB-04 equivalent provider renderings
  ↓
(optional) CB-05 Human-confirmed manual handoff receipts
  ↓
RT-01 RoundtableCanonicalInput
  status = prepared_not_executed
```

## Core invariant

Different provider presentation syntax is allowed.

Different semantic context is not.

For every Roundtable participant RT-01 requires:

- the same ContextPackage ID and revision
- the same approved TransferView
- the same canonical JSON
- the same semantic fingerprint
- exact provider coverage matching the Human-approved Roundtable target
- CB-04 rendering integrity for every provider

## RoundtableCanonicalInput

RT-01 produces a runtime object containing:

- Project / ContextPackage / revision / TransferView references
- purpose
- provider list
- one canonical semantic payload and canonical JSON
- one semantic fingerprint
- exact CB-04 provider inputs
- optional CB-05 handoff evidence
- provenance

The object remains:

```text
status = prepared_not_executed
```

No field such as `winner`, `decision`, or `responses` is created by RT-01.

## Optional handoff evidence

CB-05 receipts may be supplied to RT-01.

When valid receipts cover every provider, RT-01 records:

```text
handoff_evidence.state = human_confirmed_manual_handoff
delivery_status = unverified
```

This means the Human declared that the approved rendered contexts were handed off manually. It does **not** prove that a provider received, parsed, or used them.

If receipts are omitted:

```text
handoff_evidence.state = not_provided
```

Canonical fairness validation still works; transfer evidence is simply weaker.

## Privacy / persistence

RT-01 itself does not persist the canonical payload or provider prompt text to a new store.

The runtime input necessarily references the already-approved canonical content so Room 4 can use it, but the audit event stores metadata only:

- package ID / revision
- TransferView ID
- provider list
- semantic fingerprint
- handoff evidence state

The audit event does not duplicate ContextItem content, canonical JSON, or rendered prompt text.

## Human Agency rules

RT-01 preserves these rules:

1. Human approval belongs upstream to ContextPackage / TransferView governance.
2. RT-01 cannot silently add or remove providers.
3. RT-01 cannot add facts or provider-specific premises.
4. RT-01 cannot turn model agreement into a Human decision.
5. RT-01 cannot claim provider delivery from a manual handoff receipt.

## Next phase

RT-02 should define **provider response capture / normalization** while preserving:

- model identity
- raw response provenance
- canonical input fingerprint
- uncertainty
- disagreement
- no automatic majority-vote decision.
