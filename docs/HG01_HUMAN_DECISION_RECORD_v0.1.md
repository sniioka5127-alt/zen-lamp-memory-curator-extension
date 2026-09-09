# HG-01｜Human Decision Record / Decision Gate v0.1

Status: **Implementation candidate**

## Purpose

HG-01 implements the system-wide Human Gate for final judgment after Roundtable interpretation review.

Human Gate is **not a fifth room**. It is the boundary where a person records a judgment that may have been informed by Room 4, without allowing Room 4 to decide for them.

Canonical flow:

```text
RT-05 finalized Human interpretive review
        ↓
HG-01 Human Decision draft
        ↓
Human writes the decision / rationale / alternatives / uncertainty
        ↓
HG-01 exact-revision Human Gate
        ↓
finalized_human_decision
```

## Core invariant

```text
RT-05 accept
≠ factual truth
≠ model winner
≠ final decision

HG-01 finalized decision
= a Human-authored judgment record
≠ automatic external execution
≠ independent factual verification
```

## Source requirement

HG-01 requires an **active, finalized RT-05 Human review**. It revalidates the RT-01 → RT-05 chain through the existing RT-05 integrity contract and binds the decision record to:

- Human Project;
- RT-01 input ID;
- RT-03 comparison ID;
- RT-04 extraction ID;
- RT-05 review ID and exact revision;
- ContextPackage ID and revision;
- TransferView ID;
- canonical semantic fingerprint;
- RT-04 interpretation fingerprint;
- RT-05 review fingerprint.

If the bound RT-05 review is later revoked, the old HG-01 record remains historical data but no longer passes the active final-decision assertion against that revoked source.

## Record states

```text
draft_human_decision
        ↓ Human finalize
finalized_human_decision
        ↓ Human revoke
revoked_human_decision
```

Finalized and revoked records are immutable. A changed judgment must be represented by a new decision record, optionally linked with `supersedes_decision_id`.

## Decision disposition

HG-01 v0.1 supports:

- `pending` — draft only;
- `decided` — the Human made a judgment;
- `deferred` — the Human intentionally postpones judgment;
- `no_action` — the Human chooses no action as the decision.

All finalized dispositions require both `decision_text` and `rationale`.

A `deferred` decision additionally requires at least one explicit revisit condition:

- `revisit.trigger`; or
- `revisit.at`.

This prevents an ambiguous “defer” from becoming a silent dead end.

## Human-authored fields

A draft may contain:

- `decision_question`;
- `disposition`;
- `decision_text`;
- `rationale`;
- `supporting_subject_refs`;
- `alternatives_considered`;
- `unresolved_questions`;
- `conditions`;
- `revisit`.

These are Human decision fields. AI/system actors cannot create, update, finalize, revoke, or supersede HG-01 decisions.

## Supporting RT-05 references

`supporting_subject_refs` are references only, not duplicated interpretation text.

A supporting reference must point to an RT-05 subject with `decision = accept`.

This means a rejected or held RT-05 interpretation cannot silently be represented as supporting evidence for the Human decision.

The Human may still make a decision with no supporting Roundtable subject references. Roundtable informs judgment; it does not control it.

## Authority and side effects

Every HG-01 record states:

```text
authority = human_authored_decision_record
decision_scope = human_judgment_only
truth_status = not_independently_verified
execution_status = not_executed_by_hg01
```

`finalized_human_decision` means the system has a Human-authored decision record. It does **not** mean an external action was executed, a policy was changed, a message was sent, or a ContextItem was automatically promoted into memory.

External execution and memory promotion require separate governed phases.

## Revision-bound Human Gate

Each update increments the decision revision.

Finalization records:

- `human_gate.state = finalized`;
- `human_gate.finalized_revision = record.revision`;
- `human_gate.finalized_at`;
- `human_gate.finalized_by`.

A finalized record cannot be edited in place.

## Revocation and supersession

Only a Human actor may revoke a finalized decision.

Revocation preserves the historical record and adds revocation metadata. It does not delete or rewrite the original Human judgment.

A later Human judgment can create a new HG-01 record with `supersedes_decision_id` pointing to a finalized or revoked prior record in the same Human Project.

## Privacy and Audit

The persisted HG-01 decision artifact necessarily stores the Human decision narrative because that narrative is the record itself.

The Audit Log remains metadata-only and does **not** duplicate:

- decision question;
- decision text;
- rationale;
- alternatives;
- unresolved questions;
- conditions;
- free-text revocation reason.

Audit metadata includes IDs, revisions, disposition, fingerprints, counts, and execution status.

## Fingerprint

HG-01 v0.1 uses the same lightweight FNV-1a 32-bit mutation-detection approach used by existing Core phases.

It is for local mutation detection and is **not** a cryptographic authenticity or signature mechanism.

## Explicit non-goals in HG-01

HG-01 does not:

- select a winning AI;
- turn model majority into truth;
- verify external facts;
- execute the decision;
- send messages or API calls;
- alter ContextItem Memory Policy;
- automatically create or approve a Decision ContextItem;
- automatically transfer the decision to another AI.

Those require separate, explicit governance boundaries.
