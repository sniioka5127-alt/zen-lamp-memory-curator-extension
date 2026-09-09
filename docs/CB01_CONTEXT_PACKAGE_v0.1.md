# CB-01｜ContextPackage Schema / State Machine / Human Gate v0.1

Status: **Implementation candidate**

## Purpose

Context Bridge is Room 3 of HIRAKU Tools.

> Context Bridge chooses what travels.

CB-01 defines the canonical `ContextPackage` object and the Human Gate that must be passed before the package is considered transfer-ready.

CB-01 does **not** select context automatically, render provider-specific prompts, call an AI API, or perform outbound transfer. Those are later Context Bridge phases.

## Core distinction

`ContextItem` and `ContextPackage` are different objects.

- `ContextItem` = one unit of information managed by Human Agency Core.
- `ContextPackage` = a purpose-specific, revisioned snapshot of selected Human-approved ContextItems.

Persistent memory does not automatically become transfer context.

## Canonical schema

```json
{
  "schema_version": "0.1",
  "id": "cp_...",
  "project_id": "prj_...",
  "revision": 1,
  "purpose": "Continue implementation review",
  "target": {
    "mode": "single",
    "project_id": "prj_...",
    "platforms": ["claude"]
  },
  "items": [],
  "excluded_items": [],
  "status": "draft",
  "human_gate": {
    "required": true,
    "state": "pending",
    "approved_revision": null,
    "approved_at": null,
    "approved_by": null,
    "rejected_at": null,
    "rejected_by": null,
    "revoked_at": null,
    "revoked_by": null,
    "reason": null
  },
  "provenance": {
    "created_by": "context_bridge",
    "source": "human_agency_core"
  },
  "created_at": "...",
  "updated_at": "..."
}
```

## ContextItem snapshots

A package stores a frozen snapshot rather than only a live ContextItem ID.

Each package item includes at minimum:

- `context_item_id`;
- source `project_id`;
- `content`;
- `kind`;
- source / provenance metadata;
- memory policy and transfer policy as they existed at snapshot time;
- freshness metadata;
- Human approval metadata;
- the source ContextItem `updated_at` value;
- `snapshot_at`.

This allows a package approval to bind to a specific source state.

If the live ContextItem changes after the package snapshot, package approval is blocked until the package is revised and reviewed again.

## State machine

```text
draft
  | submit
  v
pending_review
  | approve (Human only)
  +--------------------> approved
  |                         |
  | reject (Human only)     | revoke (Human only)
  v                         v
rejected                  revoked
  |                         |
  +---------- revise -------+
               |
               v
              draft

Any non-archived state may be archived through an allowed transition.
Archived is terminal in v0.1.
```

Canonical statuses:

- `draft`
- `pending_review`
- `approved`
- `rejected`
- `revoked`
- `archived`

ContextPackage uses its own lifecycle rather than reusing ContextItem status semantics.

## Revision binding

Human approval is valid only for the exact package revision that was reviewed.

```text
human_gate.approved_revision === package.revision
```

Any revision resets the package to `draft`, increments `revision`, and clears the current Human Gate approval.

An approved package cannot be revised by an AI/system actor. Human action is required to reopen approved content.

## Admission rules

CB-01 permits a ContextItem to enter a package only when:

1. its source Project matches the package source Project;
2. `status = approved`;
3. `human_review.state = approved`;
4. `transfer_policy != deny`;
5. `project_only` is not being moved outside its Project.

`manual_only` items may be placed in a draft package, but the package itself still requires explicit Human approval before transfer readiness.

## Human Gate

Only a human actor may:

- approve a pending package;
- reject a pending package;
- revoke package approval;
- revise an already approved package;
- archive a package.

AI/system actors may create drafts or submit a draft for human review. They cannot turn a package into a transfer-ready object.

A package is transfer-ready only when all of these are true:

```text
status == approved
human_gate.state == approved
human_gate.approved_revision == revision
items.length > 0
```

The reference helper is `assertContextPackageTransferReady()`.

## Freshness Gate

A Human-approved ContextItem may still become time-sensitive.

If a live source item is `review_due`, stale by review date, or otherwise requires freshness review, package approval requires explicit acknowledgment of that ContextItem ID.

This prevents a Human Gate from becoming a blind single-click approval for stale context.

## Source-integrity Gate

Before submission and approval, CB-01 verifies that the live source ContextItem still matches the snapshot's source `updated_at` value.

If it changed, the old package snapshot cannot inherit the new state silently.

The package must be revised and reviewed again.

## Target modes

CB-01 defines target metadata but does not render provider-specific prompts.

- `generic` — no specific provider required;
- `single` — exactly one platform;
- `roundtable` — at least two platforms.

The same canonical package can therefore be prepared for a Roundtable comparison without provider-specific wording becoming part of the governed context itself.

## Excluded items

`excluded_items` records IDs and reasons only.

Excluded item content is intentionally not copied into the package. This reduces the risk that information explicitly excluded from transfer is accidentally leaked through exclusion metadata.

## Audit events

CB-01 uses the shared Audit Log for:

- `create`;
- `submit_review`;
- `approve`;
- `reject`;
- `update` / revision;
- `revoke_approval`;
- `archive`.

Actual outbound transfer auditing remains a later Context Bridge phase.

## Boundary invariants

Context Bridge may not:

- change a ContextItem's Memory Policy;
- change a ContextItem's Human Approval state;
- upgrade AI inference into fact;
- bypass `deny` or `project_only` transfer policy;
- treat package creation as package approval;
- treat package approval as actual transfer;
- silently reuse approval after package revision.

## Reference implementation

- `core/context-package-state-machine.mjs`
- `core/context-package-store.mjs`
- `tests/context-bridge-cb01.test.mjs`

## Next phase

**CB-02｜Context Selection Engine**

CB-02 may suggest which eligible ContextItems are relevant to a purpose, but selection remains reviewable and Human approval remains governed by CB-01.
