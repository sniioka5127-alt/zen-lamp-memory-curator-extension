# CB-04｜Context Renderer v0.1

Status: **Implementation candidate**

## Purpose

Context Bridge is Room 3 of HIRAKU Tools.

> Context Bridge chooses what travels.

CB-04 turns one Human-approved CB-03 `TransferView` into provider-facing text without changing the governed semantic payload.

CB-04 does **not** call an AI API, send data externally, re-select context, modify Memory Policy, or create new semantic claims.

## Core invariant

Provider formatting may differ. Transferred meaning may not.

```text
Approved TransferView
        |
        v
Canonical Transfer Payload
        |
        +--> Generic format
        +--> GPT format
        +--> Claude format
        +--> Gemini format
        +--> Roundtable set
```

Every rendering carries the same `canonical_json` and the same semantic fingerprint.

## Canonical payload

CB-04 intentionally minimizes what is transferred.

```json
{
  "schema_version": "0.1",
  "purpose": "Continue implementation review",
  "items": [
    {
      "context_item_id": "ctx_...",
      "kind": "constraint",
      "content": "..."
    }
  ]
}
```

The canonical payload does not include excluded ContextItem content, detector findings, raw redacted source text, Memory Policy, Transfer Policy, or unrelated audit metadata.

Those remain governance data rather than model context.

## Preconditions

Rendering is allowed only when:

1. the source `ContextPackage` passes `assertContextPackageTransferReady()`;
2. the CB-03 `TransferView` passes `assertRedactedTransferViewReady()`;
3. the TransferView belongs to the exact current ContextPackage revision.

Rendering itself is **not outbound transfer**.

Every render artifact has:

```text
status = rendered_not_sent
authority = derived_from_human_approved_transfer_view
```

## Semantic fingerprint

CB-04 creates a deterministic canonical JSON string and a lightweight equality fingerprint.

```text
algorithm = fnv1a32
```

This fingerprint exists to verify that two provider renderings contain the same canonical semantic payload.

It is **not a cryptographic integrity signature** and must not be represented as tamper-proof evidence. Cryptographic signing/hash chaining belongs to a later hardening phase.

## Provider profiles

Built-in presentation profiles:

- `generic`
- `gpt`
- `claude`
- `gemini`

Aliases such as `chatgpt` / `openai`, `anthropic`, and `google` map to the corresponding profile.

Unknown providers use the `generic` formatting profile while preserving their provider label and the same canonical payload.

Provider profiles may change only framing and syntax. They may not:

- add provider-specific facts;
- remove ContextItems;
- rewrite ContextItem content;
- change item order;
- infer omitted information;
- restore redacted information.

## Governance preamble

Each format contains the same fixed governance message:

- the context was selected and approved through HIRAKU Context Bridge;
- only the canonical payload should be used as transferred working context;
- omitted/redacted information must not be reconstructed or guessed;
- uncertainty and constraints must be preserved.

This preamble is renderer governance metadata, not a new ContextItem.

## Roundtable rendering

`renderRoundtable()` creates one rendering per provider from the same approved TransferView.

Before returning, CB-04 verifies:

```text
same canonical_json
same fingerprint algorithm
same fingerprint value
```

across every provider rendering.

This prevents Roundtable comparison from being contaminated by silently different source context.

## Privacy / retention

CB-04 does not persist the full rendered artifact in Core storage.

Only an audit metadata event is written when an AuditLog is supplied. The audit event records identifiers, provider/profile, package revision, and semantic fingerprint — not the canonical context body.

This avoids creating an unnecessary second persistent copy of transferred context.

## Audit action

CB-04 adds:

```text
context_rendered
```

This records rendering as a local preparation step only. Actual transfer auditing remains CB-05.

## Boundary invariants

CB-04 may not:

- render an unapproved ContextPackage;
- render an unapproved/revoked TransferView;
- reuse a TransferView after ContextPackage revision changes;
- change persistent ContextItems;
- change Memory Policy / Transfer Policy / Human Review state;
- call an external provider;
- mark a render as sent;
- claim provider renderings are equivalent unless their canonical payloads match exactly.

## Reference implementation

- `core/context-renderer.mjs`
- `tests/context-bridge-cb04.test.mjs`

## Next phase

**CB-05｜Transfer Audit / Outbound Handoff Boundary**

CB-05 will govern the transition from `rendered_not_sent` to an explicit human-confirmed transfer event and record what was actually sent, where, and from which exact governed revision.
