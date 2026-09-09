# RT-03｜Response Comparison / Disagreement Matrix v0.1

## Purpose

RT-03 is the first comparison layer in Room 4 — Roundtable AI.

It compares one intact RT-02 raw response for every provider in the RT-01 Canonical Context Input and produces a descriptive matrix without deciding which provider is correct.

## Core rule

**Comparison is not judgment. Similarity is not truth. Majority is not authority.**

RT-03 may describe exact wording overlap and structural / lexical divergence. It must not create a winner, preferred provider, majority decision, truth claim, or Human decision.

## Required input

- one intact RT-01 `RoundtableCanonicalInput`
- exactly one selected RT-02 response for every provider in the RT-01 provider set
- every RT-02 response must pass `assertRoundtableResponseIntegrity`

Missing providers, duplicate providers, responses from another RT-01 input, or modified raw response evidence are rejected.

## Output state

```text
comparison_version = RT-03
status = compared_not_decided
authority = descriptive_no_truth_claim
```

The output is revision / provenance bound to:

- RT-01 input ID
- Project ID
- ContextPackage ID + revision
- TransferView ID
- Canonical semantic fingerprint
- exact selected RT-02 response IDs + response fingerprints

## Comparison basis

RT-03 v0.1 is local and deterministic. It uses only:

1. **Exact normalized wording**
   - NFKC normalization
   - whitespace normalization
   - case normalization
   - paragraph / sentence-like segmentation
   - exact shared wording is a text identity observation only, not semantic consensus

2. **Hybrid lexical overlap**
   - word tokens for spaced languages
   - CJK bigrams for Japanese / Chinese / Korean text
   - pairwise Jaccard overlap
   - relation labels are explicitly named `*_lexical_overlap`

3. **Response structure / length**
   - response length
   - short-to-long length ratio
   - exact shared segment counts

## Main output sections

### `source_responses`

Metadata references only:

- provider
- RT-02 response ID
- response fingerprint
- CB-04 rendering ID

### `exact_shared_wording`

Text segments whose normalized wording occurs in every provider response.

This means only:

> every selected response contains equivalent normalized text at those positions.

It does **not** mean the statement is correct or that the providers independently reached the same conclusion.

### `provider_unique_segments`

Segments whose normalized wording appears only in one selected provider response.

This is a useful candidate list for later minority-view / assumption review, but RT-03 does not automatically classify those segments as important, correct, wrong, or minority truth.

### `pairwise_matrix`

For every provider pair:

- lexical overlap
- `high_lexical_overlap` / `mixed_lexical_overlap` / `low_lexical_overlap`
- exact shared segment count
- both raw response lengths
- short-to-long length ratio

These are diagnostics, not model scores.

### `interpretive_review`

Always:

```text
required = true
```

because semantic agreement, factual correctness, assumptions, contradictions, and decision relevance require a later interpretive / Human review layer.

## Forbidden output

RT-03 must not contain authoritative fields such as:

- `winner`
- `decision`
- `truth`
- `majority_choice`
- `model_ranking`
- `recommended_provider`

## Audit

Audit action:

```text
roundtable_responses_compared
```

The audit record is metadata-only. It may contain IDs, provider list, semantic fingerprint, response IDs, and aggregate counts. It must not duplicate provider raw response bodies or comparison previews.

## Privacy / storage

RT-03 returns a comparison object but does not introduce a new persistent comparison store in v0.1. RT-02 remains the source of governed raw evidence.

## Non-goals for RT-03

RT-03 does not:

- call provider APIs
- ask an AI to interpret the responses
- determine semantic consensus
- fact-check claims
- identify a winning model
- convert majority agreement into truth
- produce a final recommendation
- create a Human decision

Those responsibilities belong to later Roundtable phases and the Human Gate.
