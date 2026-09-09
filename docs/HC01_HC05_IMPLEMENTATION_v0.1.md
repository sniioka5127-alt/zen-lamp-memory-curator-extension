# Human Agency Core — HC-01 to HC-05 Implementation v0.1

Status: **REFERENCE CORE IMPLEMENTED ON ARCHITECTURE BRANCH**

Branch: `architecture/human-agency-v0.1`

This implementation intentionally does **not** change the existing Memory Curator popup runtime yet. It creates a runtime-neutral reference Core first, so the four modules can later share the same authority, provenance, policy and audit semantics.

## HC-01 — Type definitions and state transitions

Implemented:

- Common enums for ContextItem, Project, memory policy, transfer policy, freshness and actors
- Guarded entity state machine
- `PROPOSED` is never automatically equivalent to `APPROVED`
- Archived ContextItems are terminal in v0.1
- `updated` is treated as an AuditEvent, not as an approval status

Core files:

- `core/types.mjs`
- `core/state-machine.mjs`

## HC-02 — Project Store

Implemented:

- Create / read / list / update Project
- Project lifecycle: `active / paused / completed / archived`
- `local_first = true` default
- `human_gate_required = true` default
- Default transfer policy validation
- Project mutations can be written to the shared Audit Log

Core files:

- `core/storage.mjs`
- `core/project-store.mjs`

The storage layer is intentionally adapter-based. v0.1 includes:

- in-memory adapter for tests/reference use
- `chrome.storage` adapter for the current browser-extension environment

IndexedDB or another local-first web-app adapter can be added without changing Store semantics.

## HC-03 — ContextItem Store

Implemented:

- ContextItems are always created as `proposed`
- AI/system-created items cannot approve themselves
- `approve()` and `reject()` require a human actor
- Revision of an approved or stale item invalidates the previous approval and moves it to `needs_review`
- Separate Memory Policy and Transfer Policy
- Project-scoped listing
- Stale / review / archive lifecycle

Core file:

- `core/context-item-store.mjs`

## HC-04 — Provenance / Policy / Freshness

Implemented:

- Human / AI / document / system / unknown source distinction
- Optional platform/model/conversation/document provenance
- Derived-content and source-reference metadata
- Memory Policy: `keep / temporary / review / drop`
- Transfer Policy: `allow / project_only / manual_only / deny`
- Freshness: `current / review_due / stale / not_applicable`
- Transfer evaluation blocks unapproved ContextItems even when a permissive transfer policy exists
- `manual_only` requires explicit human confirmation at transfer time

Core file:

- `core/governance.mjs`

## HC-05 — Audit Log

Implemented:

- Append-only AuditLog interface
- Project/entity scoped retrieval
- Before/after snapshots
- Actor, action, reason and metadata fields
- Create / update / approve / reject / policy-change / stale / archive events

Core file:

- `core/audit-log.mjs`

### v0.1 limitation

The AuditLog is append-only at the Core API level, but it is **not yet cryptographically tamper-evident**. Hash chaining / signed audit evidence is deferred to a later hardening phase.

## Human Authority invariants

The reference Core must preserve these invariants:

1. AI proposal does not become human-approved memory automatically.
2. A ContextItem must be both `status=approved` and `human_review.state=approved` before transfer can pass governance.
3. Memory Policy and Transfer Policy are independent.
4. Human-only operations cannot be confirmed by an AI actor.
5. Editing previously approved semantic content invalidates the previous approval.
6. Cross-project transfer is denied when `transfer_policy=project_only`.
7. `transfer_policy=deny` cannot be overridden by renderer/module behavior.
8. Roundtable or Context Bridge modules must consume Core decisions rather than bypass them.

## Tests

Added:

- `tests/human-agency-core.test.mjs`
- `.github/workflows/human-agency-core.yml`

The test suite covers state transitions, project creation, proposed ContextItems, Human Gate approval, transfer policy enforcement, approval invalidation after revision, stale handling and Audit Log events.

## Integration boundary

Current legacy extension runtime remains unchanged.

Next integration phase should be:

1. Freeze HC-01..HC-05 after review/test.
2. Add a local web-app storage adapter (likely IndexedDB) for the integrated HIRAKU Tools workspace.
3. Refactor Memory Curator to emit/consume ContextItems rather than a single Markdown memory blob.
4. Connect Chat Atlas as a `proposed ContextItem` producer.
5. Build Context Bridge as a `ContextPackage` selector/renderer.
6. Build Roundtable AI as a consumer of one approved ContextPackage, never as an authority source.

> Product is integrated. Architecture is separated.
> One house, four rooms.
