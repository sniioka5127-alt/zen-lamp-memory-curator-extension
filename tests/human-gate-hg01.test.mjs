import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditLog,
  ContextItemStore,
  ContextPackageStore,
  ContextRedactionLayer,
  ContextRenderer,
  HumanDecisionRecordStore,
  ProjectStore,
  RoundtableCanonicalInputBuilder,
  RoundtableComparisonEngine,
  RoundtableInterpretiveExtractionEngine,
  RoundtableInterpretiveReviewStore,
  RoundtableResponseStore,
  assertFinalHumanDecisionRecord,
  assertHumanDecisionRecordIntegrity,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_decider" };
const human2 = { type: "human", id: "human_decider_2" };
const ai = { type: "ai", name: "roundtable_helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 10, 1, 0, n++));
}

async function createSource({ rejectOne = false } = {}) {
  const adapter = createMemoryAdapter();
  const clock = fixedClock();
  const audit = new AuditLog(adapter, { clock });
  const projects = new ProjectStore(adapter, { auditLog: audit, clock });
  const items = new ContextItemStore(adapter, { auditLog: audit, clock });
  const packages = new ContextPackageStore(adapter, { auditLog: audit, clock });
  const redaction = new ContextRedactionLayer(adapter, { auditLog: audit, clock });
  const renderer = new ContextRenderer({ auditLog: audit, clock });
  const inputBuilder = new RoundtableCanonicalInputBuilder({ auditLog: audit, clock });
  const responses = new RoundtableResponseStore(adapter, { auditLog: audit, clock });
  const comparisonEngine = new RoundtableComparisonEngine({ auditLog: audit, clock });
  const extractionEngine = new RoundtableInterpretiveExtractionEngine({ auditLog: audit, clock });
  const reviews = new RoundtableInterpretiveReviewStore(adapter, { auditLog: audit, clock });
  const decisions = new HumanDecisionRecordStore(adapter, { auditLog: audit, clock });

  const project = await projects.create({ name: "HG-01 Test" }, { actor: human });
  const proposed = await items.create({
    project_id: project.id,
    content: "Roundtable findings inform the Human decision but never replace it.",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "allow"
  }, { actor: ai });
  const approvedItem = await items.approve(proposed.id, { actor: human });

  const draftPackage = await packages.create({
    project_id: project.id,
    purpose: "Compare rollout options while preserving final Human judgment",
    target: {
      mode: "roundtable",
      project_id: project.id,
      platforms: ["gpt", "claude", "gemini"]
    },
    items: [approvedItem]
  }, { actor: ai });
  await packages.submitForReview(draftPackage.id, { actor: ai });
  const pkg = await packages.approve(draftPackage.id, { actor: human });
  const plan = await redaction.propose(pkg, {}, { actor: ai });
  const view = await redaction.approveTransferView(pkg, plan, { actor: human });
  const roundtable = await renderer.renderRoundtable(pkg, view, { actor: ai });
  const input = await inputBuilder.prepare(pkg, view, roundtable, { actor: ai });

  const rawByProvider = {
    gpt: "Check operational risk first. A staged rollout may be safer than a full launch.",
    claude: "Keep a reversible fallback path. Irreversible rollout increases recovery cost.",
    gemini: "Run a limited pilot first. Early validation can reduce deployment uncertainty."
  };
  const captured = [];
  for (const provider of input.providers) {
    captured.push(await responses.capture(input, pkg, view, roundtable, {
      provider,
      raw_response: rawByProvider[provider],
      actor: human,
      source_label: `${provider} HG-01 test response`
    }));
  }
  const comparison = await comparisonEngine.compare(input, captured, { actor: ai });
  const proposal = {
    contract_version: "rt-04-proposal-v0.1",
    roundtable_input_id: input.id,
    comparison_id: comparison.id,
    semantic_fingerprint: input.semantic_fingerprint,
    claims: [
      { id: "c1", provider: "gpt", statement: "GPT recommends examining operational risk first.", evidence: [{ quote: "Check operational risk first." }] },
      { id: "c2", provider: "claude", statement: "Claude recommends preserving reversibility.", evidence: [{ quote: "Keep a reversible fallback path." }] },
      { id: "c3", provider: "gemini", statement: "Gemini recommends a limited pilot first.", evidence: [{ quote: "Run a limited pilot first." }] }
    ],
    assumptions: [
      { id: "a1", provider: "gpt", statement: "GPT appears to assume staging may lower rollout risk.", evidence: [{ quote: "A staged rollout may be safer than a full launch." }] },
      { id: "a2", provider: "claude", statement: "Claude appears to assume irreversibility raises recovery cost.", evidence: [{ quote: "Irreversible rollout increases recovery cost." }] },
      { id: "a3", provider: "gemini", statement: "Gemini appears to assume early validation reduces uncertainty.", evidence: [{ quote: "Early validation can reduce deployment uncertainty." }] }
    ],
    conflicts: [{
      id: "x1",
      topic: "Primary rollout safeguard",
      conflict_type: "priority_difference",
      reason: "The providers emphasize different first-line safeguards.",
      sides: [
        { provider: "gpt", claim_ids: ["c1"], assumption_ids: ["a1"] },
        { provider: "claude", claim_ids: ["c2"], assumption_ids: ["a2"] },
        { provider: "gemini", claim_ids: ["c3"], assumption_ids: ["a3"] }
      ]
    }]
  };
  const extraction = await extractionEngine.ingest(input, comparison, captured, proposal, { actor: ai });
  const reviewDraft = await reviews.create(extraction, input, comparison, captured, { actor: human });
  let review = reviewDraft;
  let rejectedKey = null;
  for (let i = 0; i < reviewDraft.decisions.length; i += 1) {
    const row = reviewDraft.decisions[i];
    const decision = rejectOne && i === 0 ? "reject" : "accept";
    if (decision === "reject") rejectedKey = `${row.subject_type}:${row.subject_id}`;
    review = await reviews.setDecision(
      reviewDraft.id,
      extraction,
      input,
      comparison,
      captured,
      {
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        decision,
        note: `HG-01 source review ${row.subject_type}:${row.subject_id}`,
        actor: human
      }
    );
  }
  review = await reviews.finalize(review.id, extraction, input, comparison, captured, { actor: human });

  return {
    adapter,
    audit,
    project,
    input,
    captured,
    comparison,
    extraction,
    reviews,
    review,
    decisions,
    rejectedKey
  };
}

function firstAcceptedRef(review) {
  const row = review.decisions.find((entry) => entry.decision === "accept");
  return { subject_type: row.subject_type, subject_id: row.subject_id };
}

async function buildDecidedDraft(source, { actor = human } = {}) {
  const draft = await source.decisions.create(
    source.review,
    source.extraction,
    source.input,
    source.comparison,
    source.captured,
    {
      actor,
      decision_question: "Should we proceed with a limited staged rollout?"
    }
  );
  return source.decisions.update(
    draft.id,
    source.review,
    source.extraction,
    source.input,
    source.comparison,
    source.captured,
    {
      disposition: "decided",
      decision_text: "Proceed with a limited pilot and preserve a reversible fallback path.",
      rationale: "This preserves learning value while limiting irreversible operational exposure.",
      supporting_subject_refs: [firstAcceptedRef(source.review)],
      alternatives_considered: ["Immediate full launch", "Do nothing indefinitely"],
      unresolved_questions: ["What pilot duration is sufficient?"],
      conditions: ["Rollback must remain available during the pilot"],
      actor
    },
    { actor }
  );
}

test("HG-01: only a Human can open the Decision Gate and the source RT-05 review must be finalized", async () => {
  const source = await createSource();
  await assert.rejects(
    () => source.decisions.create(source.review, source.extraction, source.input, source.comparison, source.captured, {
      actor: ai,
      decision_question: "Should we proceed?"
    }),
    /Human Gate required/
  );

  const notFinal = structuredClone(source.review);
  notFinal.status = "draft_in_human_review";
  notFinal.human_gate.state = "in_review";
  await assert.rejects(
    () => source.decisions.create(notFinal, source.extraction, source.input, source.comparison, source.captured, {
      actor: human,
      decision_question: "Should we proceed?"
    }),
    /review content or Human Gate metadata was modified|active finalized RT-05 Human review/
  );

  const record = await source.decisions.create(source.review, source.extraction, source.input, source.comparison, source.captured, {
    actor: human,
    decision_question: "Should we proceed?"
  });
  assert.equal(record.decision_version, "HG-01");
  assert.equal(record.status, "draft_human_decision");
  assert.equal(record.authority, "human_authored_decision_record");
  assert.equal(record.disposition, "pending");
  assert.equal(record.execution_status, "not_executed_by_hg01");
  assert.equal(assertHumanDecisionRecordIntegrity(record, source.review, source.extraction, source.input, source.comparison, source.captured), true);
});

test("HG-01: a finalized Human Decision is revision-bound, records rationale, and does not claim execution or factual verification", async () => {
  const source = await createSource();
  const updated = await buildDecidedDraft(source);
  assert.equal(updated.disposition, "decided");
  assert.equal(updated.supporting_subject_refs.length, 1);
  assert.equal(updated.supporting_subject_refs[0].review_decision, "accept");

  const finalized = await source.decisions.finalize(
    updated.id,
    source.review,
    source.extraction,
    source.input,
    source.comparison,
    source.captured,
    { actor: human }
  );
  assert.equal(finalized.status, "finalized_human_decision");
  assert.equal(finalized.human_gate.state, "finalized");
  assert.equal(finalized.human_gate.finalized_revision, finalized.revision);
  assert.equal(finalized.truth_status, "not_independently_verified");
  assert.equal(finalized.execution_status, "not_executed_by_hg01");
  assert.equal(assertFinalHumanDecisionRecord(finalized, source.review, source.extraction, source.input, source.comparison, source.captured), true);
});

test("HG-01: only Human-accepted RT-05 subjects can be cited as supporting interpretation references", async () => {
  const source = await createSource({ rejectOne: true });
  const [subject_type, subject_id] = source.rejectedKey.split(":");
  const draft = await source.decisions.create(source.review, source.extraction, source.input, source.comparison, source.captured, {
    actor: human,
    decision_question: "Should we proceed?"
  });

  await assert.rejects(
    () => source.decisions.update(
      draft.id,
      source.review,
      source.extraction,
      source.input,
      source.comparison,
      source.captured,
      { supporting_subject_refs: [{ subject_type, subject_id }] },
      { actor: human }
    ),
    /must be Human-accepted in RT-05/
  );
});

test("HG-01: deferred decisions require an explicit revisit trigger or time", async () => {
  const source = await createSource();
  const draft = await source.decisions.create(source.review, source.extraction, source.input, source.comparison, source.captured, {
    actor: human,
    decision_question: "Should we launch now?"
  });
  const deferred = await source.decisions.update(
    draft.id,
    source.review,
    source.extraction,
    source.input,
    source.comparison,
    source.captured,
    {
      disposition: "deferred",
      decision_text: "Defer launch pending one additional operational test.",
      rationale: "The Human decision-maker wants one more failure-mode check.",
      actor: human
    },
    { actor: human }
  );
  await assert.rejects(
    () => source.decisions.finalize(deferred.id, source.review, source.extraction, source.input, source.comparison, source.captured, { actor: human }),
    /requires a revisit trigger or time/
  );

  const withTrigger = await source.decisions.update(
    deferred.id,
    source.review,
    source.extraction,
    source.input,
    source.comparison,
    source.captured,
    { revisit: { trigger: "After the failure-mode test is complete" } },
    { actor: human }
  );
  const finalized = await source.decisions.finalize(withTrigger.id, source.review, source.extraction, source.input, source.comparison, source.captured, { actor: human });
  assert.equal(finalized.disposition, "deferred");
});

test("HG-01: finalized decisions are immutable, can be Human-revoked, and replacement uses a superseding record", async () => {
  const source = await createSource();
  const draft = await buildDecidedDraft(source);
  const finalized = await source.decisions.finalize(draft.id, source.review, source.extraction, source.input, source.comparison, source.captured, { actor: human });

  await assert.rejects(
    () => source.decisions.update(
      finalized.id,
      source.review,
      source.extraction,
      source.input,
      source.comparison,
      source.captured,
      { decision_text: "Silently changed decision" },
      { actor: human }
    ),
    /immutable.*superseding decision/
  );
  await assert.rejects(
    () => source.decisions.revoke(finalized.id, source.review, source.extraction, source.input, source.comparison, source.captured, { actor: ai }),
    /Human Gate required/
  );

  const revoked = await source.decisions.revoke(finalized.id, source.review, source.extraction, source.input, source.comparison, source.captured, {
    actor: human,
    reason: "New operational evidence requires reconsideration"
  });
  assert.equal(revoked.status, "revoked_human_decision");
  assert.throws(
    () => assertFinalHumanDecisionRecord(revoked, source.review, source.extraction, source.input, source.comparison, source.captured),
    /not finalized and active/
  );

  const replacement = await source.decisions.create(source.review, source.extraction, source.input, source.comparison, source.captured, {
    actor: human2,
    decision_question: "Should we proceed after reconsideration?",
    supersedes_decision_id: revoked.id
  });
  assert.equal(replacement.supersedes_decision_id, revoked.id);
  assert.equal(replacement.human_gate.owner, "human_decider_2");
});

test("HG-01: mutation and RT-05 source revocation invalidate an active decision record", async () => {
  const source = await createSource();
  const draft = await buildDecidedDraft(source);
  const finalized = await source.decisions.finalize(draft.id, source.review, source.extraction, source.input, source.comparison, source.captured, { actor: human });

  const tampered = structuredClone(finalized);
  tampered.rationale = "Changed after Human finalization";
  assert.throws(
    () => assertHumanDecisionRecordIntegrity(tampered, source.review, source.extraction, source.input, source.comparison, source.captured),
    /decision content or Human Gate metadata was modified/
  );

  const revokedReview = await source.reviews.revoke(
    source.review.id,
    source.extraction,
    source.input,
    source.comparison,
    source.captured,
    { actor: human, reason: "Review source withdrawn" }
  );
  assert.throws(
    () => assertFinalHumanDecisionRecord(finalized, revokedReview, source.extraction, source.input, source.comparison, source.captured),
    /active finalized RT-05 Human review|does not match its finalized RT-05 source/
  );
});

test("HG-01: Audit Log is metadata-only and does not duplicate Human decision narrative", async () => {
  const source = await createSource();
  const draft = await source.decisions.create(source.review, source.extraction, source.input, source.comparison, source.captured, {
    actor: human,
    decision_question: "PRIVATE-QUESTION-DO-NOT-AUDIT"
  });
  const updated = await source.decisions.update(
    draft.id,
    source.review,
    source.extraction,
    source.input,
    source.comparison,
    source.captured,
    {
      disposition: "decided",
      decision_text: "PRIVATE-DECISION-DO-NOT-AUDIT",
      rationale: "PRIVATE-RATIONALE-DO-NOT-AUDIT",
      alternatives_considered: ["PRIVATE-ALTERNATIVE-DO-NOT-AUDIT"],
      actor: human
    },
    { actor: human }
  );
  await source.decisions.finalize(updated.id, source.review, source.extraction, source.input, source.comparison, source.captured, { actor: human });

  const events = await source.audit.list({ entity_type: "human_decision_record", entity_id: draft.id });
  assert.ok(events.length >= 3);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("PRIVATE-QUESTION-DO-NOT-AUDIT"), false);
  assert.equal(serialized.includes("PRIVATE-DECISION-DO-NOT-AUDIT"), false);
  assert.equal(serialized.includes("PRIVATE-RATIONALE-DO-NOT-AUDIT"), false);
  assert.equal(serialized.includes("PRIVATE-ALTERNATIVE-DO-NOT-AUDIT"), false);
});
