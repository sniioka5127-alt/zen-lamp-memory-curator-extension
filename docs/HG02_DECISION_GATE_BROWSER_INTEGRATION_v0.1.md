# HG-02 — Decision Gate Browser Integration v0.1

Status: **Implementation candidate**

## Purpose

HG-02 integrates the HG-01 Human Decision Record into the existing Roundtable browser workspace without creating a fifth AI room.

The visible boundary is:

```text
RT-05 finalized Human interpretive review
        ↓
──────── AI comparison / interpretation ends ────────
        ↓
Human Decision Gate
        ↓
HG-01 Human Decision Record
```

Roundtable AI compares and proposes interpretations. The Human decides.

## Browser flow

1. Complete RT-01 through RT-04 in the existing Roundtable runtime.
2. A Human explicitly reviews every RT-04 Claim / Assumption / Conflict in RT-05.
3. RT-05 must reach `finalized_human_review` before HG-02 opens the Decision Gate.
4. The Human enters a Decision Question and explicitly opens an HG-01 draft.
5. The Human may record:
   - disposition: `decided`, `deferred`, or `no_action`;
   - Human decision text;
   - Human rationale;
   - optional RT-05 support references;
   - alternatives considered;
   - unresolved questions;
   - conditions / safeguards;
   - revisit trigger or time.
6. The Human explicitly finalizes the record.
7. A finalized decision may later be Human-revoked or replaced by a superseding HG-01 record.

## Human Authority boundary

HG-02 delegates all decision authority to `HumanDecisionRecordStore`; it does not implement a weaker UI-only decision contract.

The browser must not turn any of the following into a final decision automatically:

- provider agreement;
- provider majority;
- lexical overlap;
- RT-04 interpretation proposals;
- RT-05 `accept` decisions.

RT-05 `accept` means only that the Human accepts that interpretation for downstream deliberation. It does not mean factual truth and does not automatically become the final judgment.

Only RT-05 subjects with `decision = accept` are displayed as eligible optional supporting references in the Decision Gate. The Human may also finalize a decision without citing any Roundtable interpretation.

## Decision semantics

An active finalized HG-01 record remains:

```text
authority = human_authored_decision_record
decision_scope = human_judgment_only
truth_status = not_independently_verified
execution_status = not_executed_by_hg01
```

Therefore:

```text
Human decision recorded
≠ factual truth independently verified
≠ external action executed
```

HG-02 contains no decision execution connector.

## Source invalidation

The browser clears its current runtime Decision Gate artifact when the upstream Roundtable chain changes, including changes to provider responses, comparison, extraction, or Human interpretive review.

This does not delete an already persisted HG-01 record. Historical records remain in governed Core storage.

If a new RT-05 review is started, the current runtime decision reference is cleared so a decision bound to an older review cannot remain visually active as the current judgment.

## Revocation and supersession

A finalized HG-01 record is immutable.

- Human revocation preserves the historical record.
- Replacement creates a new record with `supersedes_decision_id`.
- Browser supersession never edits the prior finalized / revoked record in place.

## Local First / transport boundary

HG-02 adds no provider or execution transport.

It does not add:

- `fetch()` provider calls;
- XHR provider calls;
- automatic browser submission;
- provider API execution;
- automatic decision execution;
- model winner selection;
- majority-to-decision conversion.

The browser continues to use DOM text/value APIs rather than `innerHTML` for governed provider / interpretation content.

## Persistence boundary

HG-01 Human Decision Records are stored by the governed Core store.

HG-02 does **not** introduce a full Roundtable session-recovery layer. RT-01, RT-03, and RT-04 remain runtime artifacts under the current RT-06 contract. Closing the page during an unfinished runtime therefore does not guarantee full reconstruction of the complete Roundtable chain.

A future project/workspace session schema should solve recovery explicitly rather than duplicating governed evidence into an ad-hoc browser cache.

## Version

The integrated browser line advances the extension manifest to **v0.5.0**.

## Test boundary

HG-02 automated tests cover:

- visual placement after RT-05;
- HG-01 Core delegation;
- Human-only decision fields and lifecycle controls;
- Human-accepted supporting-reference filtering;
- upstream invalidation of the current runtime decision;
- no automated network / execution path;
- manifest version;
- JavaScript syntax.

These are Core/browser contract and static tests. They are not a real Chrome/Edge click-through smoke test.
