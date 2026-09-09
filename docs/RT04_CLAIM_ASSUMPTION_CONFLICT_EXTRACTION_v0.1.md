# RT-04｜Claim / Assumption / Conflict Extraction v0.1

## 1. Purpose

RT-04 is the first interpretive layer in Room 4 — Roundtable AI.

Its job is to turn the governed RT-01 / RT-02 / RT-03 evidence chain into **proposed**:

- provider claims,
- provider assumptions,
- potential conflicts between providers.

RT-04 does **not** decide which provider is correct.

The governing rule is:

> Interpretation may be proposed. Truth and decisions are not automatically assigned.

## 2. Inputs

RT-04 requires all of the following intact sources:

1. RT-01 `RoundtableCanonicalInput`
2. exactly one RT-02 raw response for every Human-approved provider
3. RT-03 `compared_not_decided` comparison bound to those exact responses

RT-04 revalidates the RT-02 and RT-03 integrity chain before generating or importing interpretive proposals.

## 3. No automatic provider execution

The browser extension still does not call an AI API.

RT-04 provides a governed extraction prompt that can be copied to an external interpretive model. The returned JSON is then imported back through the RT-04 contract.

The imported model output is explicitly treated as:

- `status = proposed_not_human_reviewed`
- `authority = interpretive_proposal_only`
- `source_authenticity = unverified_interpretive_output`

It is not Human-approved merely because a model returned structurally valid JSON.

## 4. Evidence-bound claims and assumptions

Every proposed claim or assumption must include at least one **verbatim quote** from the corresponding RT-02 raw provider response.

Example input proposal:

```json
{
  "id": "c1",
  "provider": "gpt",
  "statement": "GPT recommends checking operational risk first.",
  "evidence": [
    {
      "quote": "Check operational risk first."
    }
  ]
}
```

The Core does not trust model-supplied offsets. It searches the governed raw response and derives:

- `response_id`
- `start`
- `end`
- exact `quote`
- `occurrence`
- `match_count`

If the quote is absent, the proposal is rejected.

If the same quote appears more than once, the extractor must supply a 1-based `occurrence`; otherwise the evidence binding is ambiguous and rejected.

## 5. Conflict candidates

A conflict proposal must:

- involve at least two distinct providers,
- use only the Human-approved RT-01 provider set,
- reference evidence-backed claims / assumptions from the same provider side,
- use one of the controlled conflict types,
- remain `resolution = unresolved`,
- remain `truth_status = not_evaluated`.

Allowed v0.1 conflict types:

- `potential_direct_conflict`
- `different_assumption`
- `scope_difference`
- `priority_difference`
- `definition_difference`
- `unclear`

A conflict entry means only that the responses may differ in a decision-relevant way. It is not proof that one side is wrong.

## 6. Majority is not authority

RT-04 forbids decision fields such as:

- `winner`
- `decision`
- `truth`
- `majority_choice`
- `model_ranking`
- `recommended_provider`
- `best_provider`
- `correct_provider`
- `final_answer`

Three models repeating the same claim does not make that claim true.

Provider-unique and minority positions must remain available for Human review.

## 7. Human Review Gate

Every normalized RT-04 extraction contains:

```json
{
  "human_review": {
    "required": true,
    "state": "pending"
  }
}
```

RT-04 v0.1 does not include the downstream Human acceptance / rejection workflow. It only creates a reviewable proposal object.

## 8. Provenance chain

Every extraction remains bound to:

- Project ID
- RT-01 input ID
- RT-03 comparison ID
- ContextPackage ID / revision
- TransferView ID
- Canonical semantic fingerprint
- exact RT-02 response IDs
- RT-02 response fingerprints
- CB-04 rendering IDs

Evidence ranges are validated against the exact RT-02 raw text.

## 9. Mutation detection

RT-04 computes a lightweight FNV-1a fingerprint over the normalized interpretive proposal content.

This detects accidental or ordinary post-extraction mutation. It is **not** a cryptographic authenticity proof or signature.

Future hardening can replace / supplement this with SHA-256 and signed provenance.

## 10. Audit minimization

The Audit Log records metadata only:

- input / comparison / package IDs
- provider list
- response IDs
- semantic fingerprint
- interpretation fingerprint
- claim / assumption / conflict counts
- Human review state
- provenance state

It does not duplicate:

- raw provider responses,
- claim text,
- assumption text,
- evidence quotes,
- conflict explanation text.

## 11. RT-04 invariant

```text
RT-01  same context
   ↓
RT-02  raw evidence
   ↓
RT-03  descriptive comparison
   ↓
RT-04  interpretive proposals
   ↓
Human review required

PROPOSED INTERPRETATION ≠ TRUTH
PROPOSED INTERPRETATION ≠ DECISION
MODEL MAJORITY ≠ AUTHORITY
```
