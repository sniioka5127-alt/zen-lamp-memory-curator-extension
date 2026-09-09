# CB-03｜Exclusion / Redaction Layer v0.1

Status: **Implementation candidate**

## Purpose

CB-03 is the privacy-reduction layer of Room 3 — Context Bridge.

> CB-02 proposes **what may be useful**.  
> CB-03 controls **what must not leave unchanged**.

CB-03 operates after a ContextPackage has been selected and governed by CB-01/CB-02, and before provider-specific rendering in CB-04.

It does not change persistent memory, ContextItem approval, Transfer Policy, or the meaning of the canonical ContextPackage.

## Core model

CB-03 introduces two derivative objects:

### RedactionPlan

A local, proposal-only set of possible sensitive spans.

```text
ContextPackage
    |
    v
CB-03 detectors / custom literals
    |
    v
RedactionPlan
    authority = proposal_only
```

A RedactionPlan stores offsets, categories, and standard replacement labels. It deliberately does **not** store the matched source text.

### Redacted TransferView

A Human-approved, subtractive projection of one exact ContextPackage revision.

```text
Approved ContextPackage revision N
    |
    +-- whole-item exclusions
    +-- selected redactions
    +-- explicit acknowledgments of findings intentionally left visible
    +-- manual ranges
    |
    v
Human Gate
    |
    v
Approved TransferView bound to revision N
```

The TransferView contains only the content intended for later rendering. Whole-item excluded content is not copied into it.

## Human Authority invariants

CB-03 follows these rules:

1. detection is a suggestion, never authority;
2. only a human may approve a final TransferView;
3. every detector finding in a non-excluded item must either:
   - be selected for redaction; or
   - be explicitly acknowledged by the human as intentionally unredacted;
4. AI/system actors cannot approve or revoke a TransferView;
5. an approved TransferView is bound to one `ContextPackage.id + revision`;
6. if the ContextPackage revision changes, the old TransferView is no longer transfer-ready;
7. CB-03 never edits a ContextItem or its Memory / Transfer Policy;
8. CB-03 may only subtract information or insert standardized redaction markers; it does not add new semantic claims.

## Built-in local detectors

CB-03 v0.1 includes conservative local pattern detectors for:

- email addresses;
- phone-like number strings;
- IPv4 addresses;
- common credential-like token prefixes;
- exact custom literals supplied for the current redaction run.

These detectors are convenience signals, not a complete privacy classifier.

### Important limitation: names and semantic personal information

CB-03 does **not** claim that regex can reliably recognize personal names, especially Japanese names or context-dependent identifying information.

For that reason, v0.1 supports Human-selected manual redaction ranges and exact custom literals.

A future AI-assisted detector may propose additional spans, but any such proposal must remain `proposal_only` and pass the same Human Gate.

## No raw match duplication

A RedactionPlan stores data such as:

```json
{
  "context_item_id": "ctx_...",
  "start": 12,
  "end": 29,
  "category": "email",
  "replacement": "[REDACTED:EMAIL]"
}
```

It does **not** store the original matched email / credential / name.

This prevents the safety metadata itself from becoming another copy of sensitive material.

## Standard replacement markers

v0.1 uses fixed markers only:

- `[REDACTED]`
- `[REDACTED:EMAIL]`
- `[REDACTED:PHONE]`
- `[REDACTED:IP]`
- `[REDACTED:CREDENTIAL]`

Arbitrary replacement prose is intentionally not accepted in v0.1. This keeps CB-03 subtractive rather than turning it into a content-writing layer.

## Whole-item exclusion

A human may exclude an entire ContextItem from the TransferView.

The TransferView records only:

```json
{
  "context_item_id": "ctx_...",
  "reason": "not required for this external task"
}
```

The excluded content itself is not copied into the TransferView.

Any detector findings attached to a fully excluded item no longer require separate redaction or acknowledgment because the item does not leave through the TransferView.

## Explicit acknowledgment of unredacted findings

Detection can produce false positives, and some detected data may intentionally be public.

Therefore CB-03 does not force automatic masking. Instead, every finding must be resolved by one of three Human-visible outcomes:

```text
REDACT
KEEP + ACKNOWLEDGE
EXCLUDE WHOLE ITEM
```

A TransferView cannot be approved while a detector finding remains unresolved.

## Manual redaction

Human-selected ranges can be added at approval time.

This is the v0.1 path for items such as:

- personal names;
- case numbers;
- organization-specific identifiers;
- internal code names;
- any context-sensitive text the local detectors cannot safely classify.

Manual redactions use the generic `[REDACTED]` marker.

## Revision binding

A TransferView records:

```text
package_id
package_revision
```

`assertRedactedTransferViewReady(view, package)` verifies both that:

1. the current ContextPackage itself still passes CB-01 transfer readiness; and
2. the TransferView was approved for the same package revision.

A later package revision requires a new CB-03 review.

## Revocation

A human may revoke an approved TransferView.

Revocation does not alter the ContextPackage or ContextItems. It only removes transfer readiness from that derivative view.

## Audit events

CB-03 adds:

- `redaction_plan_created`
- `redaction_view_approved`
- `redaction_view_revoked`

The approved audit payload contains the sanitized TransferView, not a duplicated raw-sensitive match list.

## Boundary

CB-03 does **not**:

- send data to an AI or network service;
- call an AI API;
- infer persistent memory;
- change ContextItem approval;
- change Memory Policy or Transfer Policy;
- generate provider-specific handoff text;
- claim complete PII detection;
- automatically redact without Human review.

## Reference implementation

- `core/context-redaction-layer.mjs`
- `tests/context-bridge-cb03.test.mjs`

## Next phase

**CB-04｜Context Renderer**

CB-04 should render only from a CB-03 Human-approved TransferView (or from an explicitly defined no-redaction equivalent that still passes the same Human Gate), never directly from ungoverned raw memory.