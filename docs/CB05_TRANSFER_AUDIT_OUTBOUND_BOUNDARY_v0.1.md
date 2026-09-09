# CB-05｜Transfer Audit / Outbound Handoff Boundary v0.1

Status: implementation baseline

## 1. Purpose

CB-05 defines the final Room 3 boundary between a **rendered context** and a **human-confirmed outbound handoff record**.

It exists to prevent these states from being confused:

```text
rendered
attempted
human-confirmed handoff
provider delivery verified
```

In v0.1, only the first three are represented. **Provider delivery is not verified.**

## 2. Core rule

A CB-04 rendering always begins as:

```text
status = rendered_not_sent
```

CB-05 may record an outbound attempt, but an attempt carries:

```text
status = attempted_not_confirmed
authority = no_delivery_claim
```

Only a human may create a handoff receipt:

```text
status = handoff_confirmed
authority = human_confirmed_outbound_handoff
delivery_status = unverified
```

`handoff_confirmed` means **the human states that the rendered artifact was handed off using the declared manual transport**. It does not mean that HIRAKU verified provider ingestion, processing, or successful delivery.

## 3. Supported v0.1 transports

CB-05 intentionally supports only manual boundary records:

- `manual_paste`
- `file_handoff`
- `other_manual`

API / connector transport is not implemented in CB-05 v0.1. A value such as `api_connector` is rejected rather than being recorded as though an API send occurred.

## 4. Source integrity checks

Before an attempt or confirmation crosses the CB-05 boundary, all of the following must still be true:

1. ContextPackage is transfer-ready under CB-01.
2. TransferView is Human-approved under CB-03.
3. TransferView belongs to the exact current ContextPackage revision.
4. Rendering belongs to that ContextPackage and TransferView.
5. Rendering remains in `rendered_not_sent` state.
6. Provider profile still matches the provider.
7. Canonical payload still matches the approved TransferView.
8. Semantic fingerprint still matches the canonical payload.
9. Provider-specific rendered text still exactly matches the deterministic CB-04 rendering.
10. Provider is within the approved ContextPackage target when target mode is `single` or `roundtable`.

A rendering modified after CB-04 therefore cannot be confirmed through CB-05 without being rendered again from the approved source.

## 5. Attempt record

`recordAttempt()` stores metadata only:

```json
{
  "status": "attempted_not_confirmed",
  "authority": "no_delivery_claim",
  "package_id": "cp_...",
  "package_revision": 3,
  "transfer_view_id": "rdv_...",
  "rendering_id": "render_...",
  "provider": "gpt",
  "profile": "gpt",
  "semantic_fingerprint": {
    "algorithm": "fnv1a32",
    "value": "..."
  },
  "transport": "manual_paste"
}
```

The attempt record does **not** duplicate:

- ContextItem content
- canonical payload
- canonical JSON
- rendered prompt text
- excluded content
- pre-redaction sensitive text

## 6. Human-confirmed receipt

`confirmManualHandoff()` requires a Human actor.

The resulting receipt is a historical audit fact. It records:

- Project
- ContextPackage ID and revision
- TransferView ID
- Rendering ID
- provider / profile
- semantic fingerprint
- manual transport
- optional destination label
- confirmation time
- confirming human
- optional reason
- `delivery_status = unverified`

The receipt deliberately does not store the transferred content itself.

## 7. No false delivery claim

CB-05 v0.1 has no provider callback, delivery receipt, API response, message ID, or server acknowledgment.

Therefore it MUST NOT use states such as:

```text
delivered
received_by_provider
provider_verified
processed
```

unless a later transport adapter can actually supply evidence for that claim.

This distinction is part of Human Agency governance: audit records must describe what is known, not what is merely assumed.

## 8. Roundtable integrity

For Roundtable handoff, every provider rendering must already satisfy CB-04 semantic equivalence.

CB-05 then records one receipt per provider. `assertRoundtableTransferReceiptsEquivalent()` requires all receipts to share the same:

- ContextPackage ID
- ContextPackage revision
- TransferView ID
- fingerprint algorithm
- fingerprint value

and requires distinct providers.

This gives Room 4 a verifiable statement that the human-confirmed handoffs were based on the same approved canonical context.

It still does not prove that each provider successfully ingested the context.

## 9. Audit actions

CB-05 uses existing Human Agency Core audit actions:

- `transfer_attempt`
- `transfer_approved`

In v0.1, `transfer_approved` means **Human-confirmed outbound handoff**, not provider-confirmed delivery.

Transfer audit metadata is content-minimized and stores IDs, provider/profile, transport, destination label, and semantic fingerprint rather than duplicating context text.

## 10. Immutability semantics

A handoff receipt describes a historical human confirmation. It is not revoked merely because a later ContextPackage revision exists.

The old receipt remains evidence of what was handed off at that earlier revision.

A new transfer after revision requires:

```text
new approved ContextPackage revision
→ new approved TransferView
→ new CB-04 rendering
→ new CB-05 receipt
```

## 11. Security boundary

CB-05 must never:

- auto-confirm handoff as an AI/system actor
- rewrite rendered content
- bypass CB-01 or CB-03 Human Gates
- restore redacted data
- silently change target provider
- claim provider delivery without evidence
- treat clipboard preparation as provider receipt

## 12. Non-goals for v0.1

Not included:

- direct provider API calls
- browser automation that pastes/sends automatically
- provider delivery callbacks
- cryptographic receipt signatures
- cryptographic tamper-evident audit chains
- remote server audit storage

These require separate explicit design and permissions.

## 13. Room 3 pipeline after CB-05

```text
Approved ContextItems
        ↓
CB-02 Selection Proposal
        ↓
Human selection
        ↓
CB-01 ContextPackage + Human Gate
        ↓
CB-03 Exclusion / Redaction + Human Gate
        ↓
Approved TransferView
        ↓
CB-04 Canonical Renderer
        ↓
rendered_not_sent
        ↓
CB-05 Outbound Boundary
        ↓
Human-confirmed handoff receipt
        ↓
delivery_status = unverified
```

At this point Room 3 has a complete local-first governance path from approved context selection to auditable human-confirmed handoff, without pretending to own provider delivery.
