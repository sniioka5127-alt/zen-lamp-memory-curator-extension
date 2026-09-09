# MC-01 — Memory Curator → ContextItem migration

Status: implementation branch

## Goal

Move Memory Curator from a monolithic Markdown-memory / handoff generator toward the Human Agency Core `ContextItem[]` model without calling any AI API or breaking the existing local-first workflow.

## Boundary

Memory Curator owns **what remains**. It does not own provider-specific handoff generation; that responsibility belongs to Context Bridge.

## MC-01 runtime flow

1. User pastes or captures a conversation.
2. Memory Curator generates a copy-paste prompt.
3. The external AI returns a machine-readable `context_items` JSON block plus optional human-readable notes.
4. User pastes that result back into the extension.
5. Memory Curator imports each candidate into `ContextItemStore` as `proposed`.
6. Human reviews candidates and explicitly approves/rejects them.
7. Approved items remain available in local Core storage for later Context Bridge use.

## Compatibility

- Existing INITIAL / UPDATE modes remain.
- Existing conversation capture remains.
- Existing local draft save/load remains, but is labeled as a draft rather than approved memory.
- Legacy Next Chat Handoff generation is removed from the new MC-01 prompt contract; Context Bridge will own that capability.

## Human Authority invariants

- Imported AI output never becomes approved automatically.
- AI candidate status starts at `proposed`.
- Approval/rejection requires a human actor.
- Memory Policy and Transfer Policy stay separate.
- Changing semantic content invalidates approval per Core rules.

## Out of scope

- Context Bridge renderer implementation.
- Cloud sync.
- Automatic AI API calls.
- Cross-project transfer.
- Cryptographic audit-log hardening.
