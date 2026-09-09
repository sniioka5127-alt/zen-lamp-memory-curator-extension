# RT-06｜Roundtable Browser Runtime Integration v0.1

## Purpose

RT-06 turns the RT-01 through RT-05 Roundtable Core contracts into one local browser workspace without changing their authority boundaries.

The browser runtime is orchestration, not a new source of truth.

```text
Human-approved Room 3 source
        ↓
RT-01 canonical input
        ↓
RT-02 Human-attested raw responses
        ↓
RT-03 descriptive comparison
        ↓
RT-04 interpretive proposal
        ↓
RT-05 Human review
```

Room 4 still does **not** create the final Human decision.

## Source boundary

RT-06 starts only from:

- an approved ContextPackage;
- `target.mode = roundtable`;
- at least two approved providers;
- an approved TransferView bound to the exact package revision.

The runtime enumerates those existing Core records from `chrome.storage.local`. It does not create a shortcut around CB-01 or CB-03 Human Gates.

## Fresh rendering boundary

RT-06 deliberately creates a **fresh CB-04 Roundtable rendering** from the selected approved ContextPackage + TransferView before preparing RT-01.

This means prior CB-05 handoff receipts are not silently reused. RT-01 is prepared with:

```text
handoff_evidence.state = not_provided
```

unless a future phase adds an explicit, exact rendering-preserving handoff import.

This avoids falsely claiming that a prior receipt proves delivery of a newly generated rendering ID.

## RT-01 browser step

The runtime calls the existing `ContextRenderer.renderRoundtable()` and `RoundtableCanonicalInputBuilder.prepare()` contracts.

Provider views may have different presentation profiles, but all must retain one canonical payload and semantic fingerprint.

Copying a provider prompt is explicitly labeled:

```text
Copy is not delivery.
```

RT-06 v0.1 does not call provider APIs or automate browser submission.

## RT-02 browser step

For each RT-01 provider, the Human manually pastes the exact provider response.

The runtime calls `RoundtableResponseStore.capture()` with:

- Human actor;
- `capture_method = manual_paste`;
- optional source label;
- optional claimed model;
- no provider-authenticated origin claim.

If a provider response is corrected, the new capture uses `supersedes_response_id`; the old raw evidence remains intact.

Changing any current provider response clears downstream RT-03 / RT-04 / RT-05 runtime state.

## RT-03 browser step

Once exactly one current RT-02 response exists for every provider, RT-06 calls `RoundtableComparisonEngine.compare()`.

The UI displays:

- exact shared wording;
- provider-unique wording;
- pairwise lexical diagnostics;
- exact shared segment counts;
- response-length ratio.

The browser never labels these values as truth, semantic agreement, model quality, or a winner.

## RT-04 browser step

RT-06 calls `RoundtableInterpretiveExtractionEngine.buildPrompt()` to produce the governed external extraction prompt.

The Human may copy that prompt manually to an external AI and paste the returned JSON back into RT-06.

`ingest()` revalidates the RT-01 / RT-02 / RT-03 chain and exact verbatim evidence requirements.

The imported result remains:

```text
status = proposed_not_human_reviewed
authority = interpretive_proposal_only
```

## RT-05 browser step

RT-06 creates a Human review through `RoundtableInterpretiveReviewStore`.

Every Claim / Assumption / Conflict must receive one explicit decision:

- `accept`
- `reject`
- `hold`

`accept` means only that the interpretation may continue into later deliberation. It does not create factual truth or a final decision.

The runtime disables finalization while any subject remains pending.

Finalized RT-05 reviews remain immutable through the Core contract.

## Runtime persistence

RT-06 v0.1 intentionally does **not** persist the full browser runtime graph as a new session cache.

Existing Core persistence still applies:

- RT-02 raw responses are persisted because they are governed evidence;
- RT-05 review records are persisted because they are Human authority records;
- RT-01, RT-03 and RT-04 remain runtime artifacts under their current contracts.

Closing the page can therefore end an unfinished RT-03 / RT-04 browser session. A later persistence phase must preserve provenance without creating uncontrolled duplicate stores.

## Security / privacy posture

RT-06:

- uses DOM `textContent` / form values rather than `innerHTML` for provider-controlled text;
- performs no `fetch()` / XHR provider transport;
- does not automatically open provider websites or inject prompts;
- does not convert majority agreement into truth;
- does not create model ranking, winner, recommended provider, or final Human decision.

## Acceptance criteria

RT-06 v0.1 is accepted when:

1. the popup can open Room 4;
2. only approved Roundtable Room 3 sources can be loaded;
3. RT-01 through RT-05 can be executed sequentially from one browser page;
4. provider prompts remain manual-copy only;
5. RT-02 capture remains Human-attested and raw;
6. response correction preserves supersession history;
7. RT-03 remains descriptive only;
8. RT-04 remains proposal-only with exact evidence binding;
9. RT-05 remains Human-only and cannot finalize with pending subjects;
10. no provider API transport or automatic final decision is introduced.
