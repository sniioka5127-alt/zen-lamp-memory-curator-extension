# CB-02｜Context Selection Engine v0.1

Status: **Implementation candidate**

## Purpose

Context Bridge is Room 3 of HIRAKU Tools.

> Context Bridge chooses what travels.

CB-02 adds a local, deterministic Context Selection Engine that helps a human review which already-approved ContextItems may be relevant to a stated purpose.

CB-02 is **proposal-only**. It does not approve transfer, mutate ContextItems, create authority, call an AI API, or perform outbound transfer.

## Relationship to CB-01

CB-01 governs the canonical `ContextPackage`, its revision-bound Human Gate, transfer readiness, source-integrity checks, and freshness acknowledgment.

CB-02 sits before that gate:

```text
Approved ContextItems
        |
        v
CB-02 Selection Proposal
        |
        | Human reviews / chooses
        v
ContextPackage draft
        |
        v
CB-01 Human Gate
        |
        v
Approved ContextPackage
```

A recommendation is not approval.

## Inputs

The engine receives:

- source `project_id`;
- a human-readable `purpose`;
- ContextPackage-compatible target metadata;
- optional explicit `extra_keywords`;
- optional `max_suggestions` for the short recommendation list.

The engine reads ContextItems from the selected Project through `ContextItemStore`.

## Hard governance eligibility

An item is blocked from the candidate pool when any of the following is true:

- source Project does not match;
- ContextItem status is not `approved`;
- `human_review.state` is not `approved`;
- `transfer_policy = deny`;
- `transfer_policy = project_only` and the target Project differs;
- freshness state is explicitly `stale`.

Blocked items are reported by ID and reason code. Their content is not copied into the selection plan.

## Warnings, not silent exclusion

The following remain visible as eligible candidates but carry warnings:

- `manual_only` → `manual_confirmation_required`;
- review date due / `review_due` → `freshness_review_due`;
- `memory_policy = drop` → `memory_policy_drop`;
- `memory_policy = temporary` → `memory_policy_temporary`.

This preserves the distinction between Memory Policy and Transfer Policy.

## Relevance ranking

CB-02 uses a deterministic local heuristic, not an external model.

The score is explainable and combines:

1. lexical overlap with the stated purpose / extra keywords;
2. a small kind prior;
3. a small Memory Policy adjustment.

The kind prior gives modest weight to governance-relevant categories such as:

- `constraint`;
- `decision`;
- `project_context`;
- `avoid`.

The score is only a ranking aid. It is not a truth value and it never changes authority fields.

## Japanese / CJK handling

The local tokenizer supports Latin-style tokens and CJK character n-grams. This allows Japanese purpose text to produce useful overlap signals without requiring a remote tokenizer or AI API.

## Selection plan

The engine returns an ephemeral proposal shaped like:

```json
{
  "schema_version": "0.1",
  "engine_version": "CB-02",
  "id": "sel_...",
  "project_id": "prj_...",
  "purpose": "...",
  "target": {},
  "authority": "proposal_only",
  "recommended_item_ids": [],
  "review_item_ids": [],
  "candidates": [],
  "blocked": [],
  "stats": {},
  "created_at": "..."
}
```

The plan intentionally stores references, scores, reason codes, warnings, and source `updated_at` values rather than duplicating ContextItem content.

## Recommendation levels

- `suggest` — high enough deterministic score to appear in the short recommendation list;
- `review` — plausible contextual anchor worth human attention;
- `available` — eligible but not strongly ranked.

All eligible candidates remain visible even when `max_suggestions` truncates the short recommendation list.

## Source-integrity check

Before selected IDs are resolved into live ContextItems, CB-02 checks that:

- each ID was eligible in the original plan;
- the live ContextItem still exists;
- the live `updated_at` matches the selection proposal;
- current governance eligibility still passes.

If the source changed, the old proposal cannot silently carry forward.

## Human Authority invariants

CB-02 may suggest.

CB-02 may not:

- auto-approve a ContextItem;
- change Memory Policy;
- change Transfer Policy;
- change Human Review state;
- add blocked items by implication;
- treat a recommendation as package approval;
- bypass CB-01 Human Gate;
- send data to another AI.

The final approved transfer context remains governed by CB-01.

## Privacy

The reference engine is local and deterministic. It does not call an external AI service.

Selection-plan records do not duplicate blocked-item content.

## Reference implementation

- `core/context-selection-engine.mjs`
- `tests/context-bridge-cb02.test.mjs`

## Next phase

**CB-03｜Exclusion / Redaction Layer**

CB-03 should provide explicit exclusion and redaction controls before provider rendering, while preserving provenance and preventing excluded content from leaking through metadata.
