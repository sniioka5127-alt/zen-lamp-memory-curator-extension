# RT-05｜Interpretive Review / Human Gate v0.1

## Purpose

RT-05 is the Human review boundary between RT-04 interpretive proposals and any later deliberation layer.

It does **not** decide factual truth, select a winning provider, or create the user's final decision.

The core invariant is:

> **Human acceptance of an interpretation is not the same as Human acceptance of truth.**

## Inputs

RT-05 requires an intact chain:

- RT-01 `RoundtableCanonicalInput`
- exactly one intact RT-02 raw response for every RT-01 provider
- intact RT-03 `compared_not_decided` comparison
- intact RT-04 `proposed_not_human_reviewed` interpretive extraction

The RT-05 review is bound to:

- Project ID
- RT-01 input ID
- RT-03 comparison ID
- RT-04 extraction ID
- ContextPackage ID / revision
- TransferView ID
- canonical semantic fingerprint
- RT-04 interpretation fingerprint
- RT-02 response IDs / fingerprints / rendering IDs

The full source chain is revalidated on review creation, edits, finalization, revocation, and integrity checks.

## Human-only authority

The following RT-05 actions require `actor.type = human`:

- create review
- record / change an item review decision while the review is draft
- finalize review
- revoke review
- create a superseding review

AI and system actors cannot exercise this Human Gate.

## Review subjects

Every RT-04 Claim, Assumption, and Conflict becomes exactly one RT-05 review subject.

Each subject must receive exactly one final Human decision before finalization:

- `accept`
- `reject`
- `hold`

Drafts may temporarily contain `pending`.

### Interpretation effects

For Claim / Assumption:

- `accept` → `accepted_for_downstream_deliberation_not_as_truth`
- `reject` → `rejected_as_interpretation`
- `hold` → `held_for_further_review`

For Conflict:

- `accept` → `accepted_as_interpretive_conflict_only`
- `reject` → `rejected_as_interpretation`
- `hold` → `held_for_further_review`

Conflict acceptance does not resolve the conflict and does not evaluate truth.

## Lifecycle

```text
draft_in_human_review
        ↓ all subjects reviewed
finalized_human_review
        ↓ Human revoke
revoked_human_review
```

A finalized or revoked review is immutable. Changes require a new review with `supersedes_review_id`.

## Finalized authority boundary

A finalized review always uses:

```text
status = finalized_human_review
authority = human_reviewed_interpretation_not_truth_or_final_decision
review_scope = interpretive_structure_only
truth_status = not_evaluated
final_decision_status = not_created
```

This prevents a reviewed interpretation from being silently promoted into:

- factual truth
- a winning provider
- model ranking
- a final answer
- a Human decision

## Revision-bound Human Gate

The Human Gate stores the exact finalized review revision:

```text
human_gate.finalized_revision === review.revision
```

Any draft edit increments the review revision. Finalization increments it again and binds approval to that exact revision.

## Accepted subject output

`acceptedInterpretiveSubjectIds(review)` returns only subject IDs from a `finalized_human_review` and only where the Human decision is `accept`.

It returns identifiers, not duplicated Claim / Assumption / Conflict text.

Revoked reviews cannot produce accepted subject output.

## Provenance and integrity

RT-05 uses a lightweight `fnv1a32` review fingerprint for mutation detection. It is not a cryptographic authenticity signature.

Integrity verification rejects:

- source extraction substitution
- ContextPackage / TransferView / semantic-fingerprint mismatch
- RT-04 interpretation-fingerprint mismatch
- response-binding changes
- missing / duplicate / unknown review subjects
- provider-binding changes
- invalid review decision/effect pairs
- finalization with pending subjects
- review-content or Human-Gate mutation

## Persistence

Unlike RT-03 / RT-04 runtime outputs, the RT-05 Human review decision artifact is persisted in the configured Core storage adapter.

The RT-05 record intentionally stores **references and Human decisions**, not another copy of:

- RT-02 raw response bodies
- RT-04 Claim text
- RT-04 Assumption text
- RT-04 Conflict explanations
- RT-04 evidence quotes

The source RT-04 extraction must still be available when source text needs to be displayed or independently revalidated.

## Audit

RT-05 adds metadata-only audit actions:

- `roundtable_interpretive_review_started`
- `roundtable_interpretive_review_item_recorded`
- `roundtable_interpretive_review_finalized`
- `roundtable_interpretive_review_revoked`

Audit metadata may include IDs, revisions, fingerprints, subject IDs/types, counts, and decision codes.

It must not duplicate Claim text, Assumption text, Conflict text, evidence quotes, raw provider responses, or free-text Human review notes.

## Non-goals

RT-05 does not:

- decide truth
- resolve conflicts
- rank providers
- select a winner
- use majority vote
- create a final answer
- create the user's final decision
- call external AI APIs

Those remain separate downstream responsibilities and require their own Human Agency boundary.
