# RT-02｜Provider Response Capture / Provenance v0.1

## Status

Implementation specification for Room 4 — Roundtable AI.

RT-02 follows RT-01 Canonical Context Input.

## Purpose

RT-02 captures each provider response as raw evidence bound to the exact RT-01 canonical input that preceded it.

The responsibility of RT-02 is evidence capture and provenance only.

It does **not** compare answers, summarize them, score models, majority-vote, select a winner, or create a Human decision.

## Core invariant

```text
RT-01 Canonical Input
        ↓
provider-specific Human handoff
        ↓
provider response
        ↓
RT-02 Raw Response Capture
        ↓
captured_raw_uninterpreted
```

The captured response remains evidence. Interpretation belongs to a later Roundtable phase.

## Manual capture boundary in v0.1

RT-02 v0.1 supports only:

- `manual_paste`
- `manual_file`
- `other_manual`

Provider APIs are not called. Browser submission is not automated. Because the provider identity is manually attributed, capture requires a Human actor.

The source authenticity state is explicitly:

```text
human_attested_unverified
```

This means the Human states that the pasted/imported text came from the named provider, but RT-02 does not possess cryptographic or provider-side proof of origin.

## Exact raw response preservation

`raw_response` is stored exactly as supplied, including leading/trailing whitespace and line breaks.

RT-02 does not trim, rewrite, normalize, summarize, translate, or classify the response body.

The record also stores:

- exact raw response length
- a lightweight `fnv1a32` content fingerprint

The fingerprint is for accidental mutation detection and equality checking. It is **not** a cryptographic authenticity proof.

## Provenance binding

Every RT-02 record is bound to:

- RT-01 Roundtable Input ID
- Project ID
- ContextPackage ID
- ContextPackage revision
- TransferView ID
- provider
- CB-04 rendering ID
- semantic fingerprint of the canonical transferred context

RT-02 revalidates RT-01 against the current CB-01 / CB-03 / CB-04 source chain before capture.

A response cannot be captured for a provider that is not uniquely present in the Human-approved Roundtable input.

## Optional CB-05 evidence

If RT-01 was prepared with CB-05 handoff receipts, RT-02 may bind the provider response to the matching provider receipt.

This strengthens provenance for the outbound handoff path, but it does not change either of these states:

```text
provider_delivery_status = unverified
source_authenticity = human_attested_unverified
```

A Human-confirmed paste is not provider receipt proof, and a manually captured answer is not authenticated provider-origin proof.

## Response record

Representative shape:

```json
{
  "schema_version": "0.1",
  "capture_version": "RT-02",
  "id": "rtr_...",
  "status": "captured_raw_uninterpreted",
  "authority": "evidence_only_no_interpretation",
  "roundtable_input_id": "rti_...",
  "provider": "gpt",
  "rendering_id": "render_...",
  "semantic_fingerprint": {
    "algorithm": "fnv1a32",
    "value": "..."
  },
  "raw_response": "exact provider text",
  "response_fingerprint": {
    "algorithm": "fnv1a32",
    "value": "...",
    "length": 123
  },
  "source_provenance": {
    "capture_method": "manual_paste",
    "captured_by": "local_user",
    "claimed_provider": "gpt",
    "claimed_model": null,
    "source_authenticity": "human_attested_unverified",
    "provider_delivery_status": "unverified",
    "handoff_receipt_id": null
  }
}
```

## Append-only response history

RT-02 does not provide an update method for captured response bodies.

If a Human needs to correct a mistaken capture, a new response record is created with:

```text
supersedes_response_id = previous record ID
```

The previous raw evidence remains unchanged.

## Audit minimization

The `roundtable_response_captured` audit event stores metadata only:

- response ID
- RT-01 input ID
- provider
- rendering ID
- canonical semantic fingerprint
- response fingerprint
- response length
- capture method
- source authenticity state
- optional handoff receipt ID
- optional superseded response ID

The audit event does not duplicate raw provider response text or the source label.

## Explicit non-goals

RT-02 does not:

- call GPT / Claude / Gemini APIs
- prove provider delivery or ingestion
- authenticate provider identity
- interpret response meaning
- summarize responses
- detect agreement/disagreement
- score providers
- majority-vote
- declare truth
- select a winner
- create a Human decision

Those responsibilities, where appropriate, belong to later Room 4 phases.
