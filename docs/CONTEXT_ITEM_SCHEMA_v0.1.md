# ContextItem Schema v0.1

Status: **Adopted architecture draft**

## Definition

A `ContextItem` is the smallest meaningful unit of project context that can be reviewed, remembered, excluded, transferred, cited, updated, or archived independently.

A ContextItem is not assumed to be true merely because it exists.

## Base schema

```json
{
  "schema_version": "0.1",
  "id": "ctx_xxxxx",
  "project_id": "prj_xxxxx",
  "content": "Example content",
  "kind": "project_context",
  "status": "proposed",
  "source": {
    "actor_type": "human",
    "actor_name": null,
    "platform": null,
    "model": null,
    "conversation_id": null,
    "document_id": null,
    "timestamp": null
  },
  "provenance": {
    "original_text": null,
    "derived": false,
    "derived_by": null
  },
  "memory_policy": "review",
  "transfer_policy": "manual_only",
  "freshness": {
    "state": "current",
    "review_after": null,
    "reason": null
  },
  "human_review": {
    "required": true,
    "state": "pending",
    "approved_at": null
  },
  "created_at": "",
  "updated_at": ""
}
```

## `kind`

v0.1 defines:

- `fact`
- `decision`
- `constraint`
- `project_context`
- `style_anchor`
- `discovery`
- `question`
- `hypothesis`
- `temporary`
- `avoid`
- `evidence_reference`

`decision` and `hypothesis` must never be treated as interchangeable.

## `status`

- `proposed`
- `approved`
- `rejected`
- `needs_review`
- `stale`
- `archived`

AI extraction defaults to `proposed` unless the item is a faithful representation of an already human-approved state and that approval can be established.

## `source.actor_type`

- `human`
- `ai`
- `document`
- `system`
- `unknown`

Human statements and AI inference must remain distinguishable.

## Memory policy

- `keep`
- `temporary`
- `review`
- `drop`

Memory policy answers: **Should this be retained?**

## Transfer policy

- `allow`
- `project_only`
- `manual_only`
- `deny`

Transfer policy answers: **May this item be included in a Context Package?**

Memory and transfer policies are independent. For example:

```text
memory_policy = keep
transfer_policy = deny
```

means: retain the item locally, but do not transfer it to another AI.

## Freshness

- `current`
- `review_due`
- `stale`
- `not_applicable`

Time-sensitive claims such as prices, legal requirements, roles, schedules, or system states should support freshness review. Stable creative constraints may use `not_applicable`.

## Human review

Recommended states:

- `pending`
- `approved`
- `rejected`

No module may silently rewrite human approval state.

## Provenance requirements

When a ContextItem is derived from another source, the original source reference should be preserved where practical. Transformations such as summarization, classification, translation, or merging should be recorded rather than presented as original human text.

## Core invariants

1. Existence does not imply truth.
2. AI proposal does not imply human approval.
3. `keep` does not imply `allow`.
4. `approved` does not imply forever-current.
5. Derived text must not masquerade as verbatim source text.
6. Cross-project reuse requires explicit human action.
