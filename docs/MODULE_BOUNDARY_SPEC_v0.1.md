# 4 Module Boundary Spec v0.1

Status: **Adopted architecture draft**

## Product model

HIRAKU Tools is designed as one integrated workspace with four clearly separated modules.

> One house, four rooms.

The user experiences one product. Internally, each module has a distinct responsibility and communicates through Human Agency Core objects.

## Room 1 — Chat Atlas

### Responsibility

**See / understand what happened.**

Chat Atlas maps long AI conversations into structures such as:

- questions;
- decisions;
- hypotheses;
- objections;
- discoveries;
- unresolved points;
- changes of direction;
- branches.

### Allowed

- conversation parsing;
- timeline and branch visualization;
- generating proposed ContextItems;
- identifying unresolved questions;
- linking related statements and evidence.

### Forbidden

- automatically approving persistent memory;
- silently transferring context to another AI;
- final human decisions;
- treating multi-model agreement as truth.

Atlas-generated ContextItems default to `proposed`.

## Room 2 — Memory Curator

### Responsibility

**Choose what remains.**

Memory Curator helps the human decide whether proposed items should be:

- `keep`;
- `temporary`;
- `review`;
- `drop`.

### Allowed

- memory-policy proposals;
- comparing proposed items with existing memory;
- contradiction detection;
- promotion/demotion suggestions;
- Human Review workflows.

### Forbidden

- generating final next-chat handoffs;
- generating provider-specific transfer prompts as its primary responsibility;
- running Roundtable comparisons;
- silently changing Human Approval state.

Legacy `Next Chat Handoff` and `AI-specific Handoff` responsibilities move to Context Bridge.

## Room 3 — Context Bridge

### Responsibility

**Choose what travels.**

Context Bridge selects approved or explicitly reviewed ContextItems for a particular purpose and produces a `ContextPackage`.

### Input

- Project;
- task/purpose;
- eligible ContextItems;
- transfer policies;
- human selections.

### Output

- canonical `ContextPackage`;
- optional provider-specific renderings for GPT, Claude, Gemini, local AI, or generic systems.

### Forbidden

- silently changing memory policy;
- changing Human Approval state;
- promoting AI inference into fact;
- automatically saving external AI responses as memory.

## Room 4 — Roundtable AI

### Responsibility

**Compare without surrendering judgment.**

Roundtable sends the same canonical ContextPackage to multiple AI systems and compares their outputs.

### Comparison output

- agreement;
- disagreement;
- different assumptions;
- minority views;
- evidence differences;
- uncertainty;
- missing information;
- questions requiring human review.

### Forbidden

- `majority = truth`;
- automatic decision from model consensus;
- automatic memory promotion of Roundtable results.

Roundtable completion must end in a Human Decision step when a decision is required.

## Human Gate

Human Gate is not a fifth room. It is a system-wide boundary.

At minimum, Human Gate applies to:

- persistent memory approval;
- final decisions;
- external ContextPackage transfer;
- restrictive policy changes;
- adoption of Roundtable findings;
- destructive deletion of important approved items.

## Canonical flow

```text
AI Conversation
      |
      v
Chat Atlas
      | proposed ContextItems
      v
Memory Curator
      | human-approved memory policy
      v
Human Agency Core
      |
      v
Context Bridge
      | ContextPackage
      v
Roundtable AI
      |
      v
Human Gate
      | Decision / new candidate items
      v
Human Agency Core
```

## Boundary invariant

Modules may share data through Human Agency Core. They must not silently mutate another module's domain state.

This boundary is architectural, not merely visual.
