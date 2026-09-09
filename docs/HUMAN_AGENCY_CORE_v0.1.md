# Human Agency Core v0.1

Status: **Adopted architecture draft**  
Project: HIRAKU Tools / ZEN LAMP PROJECT

## Purpose

Human Agency Core is the shared foundation for tools that help a person work with long-running AI conversations without losing ownership of questions, memory, context, evidence, and decisions.

The Core is not an AI answer engine. It does not decide what is true, silently promote AI output into memory, or automatically transfer context to another AI.

> Product is integrated. Architecture is separated.
>
> One house, four rooms.

## Core principles

### 1. Human Authority

AI-generated classifications, summaries, memories, and decisions are proposals until a human reviews them.

`PROPOSED != APPROVED`

No module may automatically convert an AI proposal into an approved human decision.

### 2. Provenance First

Important information should retain its origin where available:

- who or what produced it;
- source platform or document;
- conversation or document reference;
- timestamp;
- whether the item is quoted, extracted, inferred, or transformed.

Human statements and AI inferences must remain distinguishable at the data level.

### 3. Memory is not Context

**Memory** means information worth retaining beyond the current interaction.

**Context** means information selected for a particular task, AI, or handoff.

An item may be retained in memory while being forbidden from transfer.

### 4. Local First

The default architecture is local-first. Data remains in the browser/device unless the user explicitly exports, copies, syncs, or sends it.

Any future network transfer must make the destination and transferred content visible to the user.

### 5. Reversibility and Auditability

Human actions affecting memory, transfer, approval, rejection, freshness, and decisions should be reversible where practical and recorded as audit events.

## Core objects

Human Agency Core v0.1 defines these shared objects:

- `Project`
- `ContextItem`
- `Source`
- `Evidence`
- `Decision`
- `ContextPackage`
- `RoundtableSession`
- `Policy`
- `AuditEvent`

## Common lifecycle

```text
PROPOSED
   |-- APPROVED
   |-- REJECTED
   `-- NEEDS_REVIEW
          |-- APPROVED
          `-- REJECTED

APPROVED
   |-- UPDATED
   |-- STALE
   `-- ARCHIVED
```

## Core invariants

1. AI output cannot become `APPROVED` without a Human Gate.
2. Memory approval does not imply transfer permission.
3. Transfer permission does not imply factual correctness.
4. Roundtable agreement does not imply truth or automatic decision.
5. Cross-project transfer is never automatic.
6. Provenance must not be silently discarded during transformation.
7. The Core stores state and policy; module-specific reasoning remains inside modules.

## Human Gate

Human review is required at minimum for:

- approving persistent memory;
- confirming a decision;
- sending a Context Package outside the local workspace;
- changing restrictive transfer policies;
- adopting Roundtable results as a decision;
- destructive deletion of important approved items.

## Out of scope for v0.1

Human Agency Core v0.1 intentionally excludes:

- automatic cloud synchronization;
- silent background memory capture;
- autonomous AI-to-AI conversations;
- automatic majority-vote decisions;
- personality profiling;
- automatic cross-project sharing;
- automatic promotion of AI inference to human fact.

## Implementation sequence

1. Core types and state transitions
2. Project Store
3. ContextItem Store
4. Provenance / Policy / Freshness
5. Audit Log
6. Memory Curator migration
7. Chat Atlas migration
8. Context Bridge implementation
9. Roundtable AI implementation
10. Unified workspace shell
