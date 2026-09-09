import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditLog,
  ContextItemStore,
  ContextPackageStore,
  ContextRedactionLayer,
  ContextRenderer,
  ProjectStore,
  RoundtableCanonicalInputBuilder,
  RoundtableComparisonEngine,
  RoundtableInterpretiveExtractionEngine,
  RoundtableInterpretiveReviewStore,
  RoundtableResponseStore,
  acceptedInterpretiveSubjectIds,
  assertRoundtableInterpretiveReviewIntegrity,
  createMemoryAdapter
} from "../core/index.mjs";

const human = { type: "human", id: "human_test" };
const human2 = { type: "human", id: "human_reviewer_2" };
const ai = { type: "ai", name: "roundtable_helper" };

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 9, 18, 0, n++));
}

async function createSource() {
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

  const project = await projects.create({ name: "RT-05 Test" }, { actor: human });
  const proposed = await items.create({
    project_id: project.id,
    content: "Human review must govern any adoption of Roundtable interpretations.",
    kind: "constraint",
    memory_policy: "keep",
    transfer_policy: "allow"
  }, { actor: ai });
  const approvedItem = await items.approve(proposed.id, { actor: human });

  const draft = await packages.create({
    project_id: project.id,
    purpose: "Review claims, assumptions, and conflicts without turning them into truth or a final decision",
    target: {
      mode: "roundtable",
      project_id: project.id,
      platforms: ["gpt", "claude", "gemini"]
    },
    items: [approvedItem]
  }, { actor: ai });
  await packages.submitForReview(draft.id, { actor: ai });
  const pkg = await packages.approve(draft.id, { actor: human });
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
      source_label: `${provider} RT-05 test response`
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

  return { adapter, audit, project, input, captured, comparison, extraction, reviews };
}

async function decideAll(source, reviewId, decisionByKey = {}) {
  let review = await source.reviews.get(reviewId);
  for (const row of review.decisions) {
    const key = `${row.subject_type}:${row.subject_id}`;
    review = await source.reviews.setDecision(
      reviewId,
      source.extraction,
      source.input,
      source.comparison,
      source.captured,
      {
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        decision: decisionByKey[key] ?? "accept",
        note: `Human review for ${key}`,
        actor: human
      }
    );
  }
  return review;
}

test("RT-05: Human Gate creates a review draft and AI/system actors cannot review interpretations", async () => {
  const source = await createSource();
  await assert.rejects(
    () => source.reviews.create(source.extraction, source.input, source.comparison, source.captured, { actor: ai }),
    /Human Gate required/
  );

  const review = await source.reviews.create(source.extraction, source.input, source.comparison, source.captured, { actor: human });
  assert.equal(review.review_version, "RT-05");
  assert.equal(review.status, "draft_in_human_review");
  assert.equal(review.authority, "human_reviewed_interpretation_not_truth_or_final_decision");
  assert.equal(review.review_scope, "interpretive_structure_only");
  assert.equal(review.truth_status, "not_evaluated");
  assert.equal(review.final_decision_status, "not_created");
  assert.equal(review.summary.total, 7);
  assert.equal(review.summary.pending, 7);
  assert.equal(assertRoundtableInterpretiveReviewIntegrity(review, source.extraction, source.input, source.comparison, source.captured), true);

  await assert.rejects(
    () => source.reviews.setDecision(review.id, source.extraction, source.input, source.comparison, source.captured, {
      subject_type: "claim",
      subject_id: "claim_001",
      decision: "accept",
      actor: ai
    }),
    /Human Gate required/
  );
});

test("RT-05: accept/reject/hold decisions are interpretive only and finalization requires complete Human review", async () => {
  const source = await createSource();
  const draft = await source.reviews.create(source.extraction, source.input, source.comparison, source.captured, { actor: human });

  await assert.rejects(
    () => source.reviews.finalize(draft.id, source.extraction, source.input, source.comparison, source.captured, { actor: human }),
    /decisions remain pending/
  );

  const decided = await decideAll(source, draft.id, {
    "claim:claim_001": "accept",
    "claim:claim_002": "reject",
    "assumption:assumption_001": "hold",
    "conflict:conflict_001": "accept"
  });
  assert.equal(decided.summary.pending, 0);
  assert.equal(decided.decisions.find((row) => row.subject_id === "claim_001").interpretation_effect, "accepted_for_downstream_deliberation_not_as_truth");
  assert.equal(decided.decisions.find((row) => row.subject_id === "claim_002").interpretation_effect, "rejected_as_interpretation");
  assert.equal(decided.decisions.find((row) => row.subject_id === "assumption_001").interpretation_effect, "held_for_further_review");
  assert.equal(decided.decisions.find((row) => row.subject_id === "conflict_001").interpretation_effect, "accepted_as_interpretive_conflict_only");

  const finalized = await source.reviews.finalize(draft.id, source.extraction, source.input, source.comparison, source.captured, { actor: human });
  assert.equal(finalized.status, "finalized_human_review");
  assert.equal(finalized.human_gate.state, "finalized");
  assert.equal(finalized.human_gate.finalized_revision, finalized.revision);
  assert.equal(finalized.truth_status, "not_evaluated");
  assert.equal(finalized.final_decision_status, "not_created");
  assert.equal(assertRoundtableInterpretiveReviewIntegrity(finalized, source.extraction, source.input, source.comparison, source.captured), true);

  const accepted = acceptedInterpretiveSubjectIds(finalized);
  assert.equal(accepted.some((entry) => entry.subject_id === "claim_001"), true);
  assert.equal(accepted.some((entry) => entry.subject_id === "conflict_001"), true);
  assert.equal(accepted.some((entry) => entry.subject_id === "claim_002"), false);
});

test("RT-05: finalized reviews are immutable; revision requires a superseding Human review", async () => {
  const source = await createSource();
  const draft = await source.reviews.create(source.extraction, source.input, source.comparison, source.captured, { actor: human });
  await decideAll(source, draft.id);
  const finalized = await source.reviews.finalize(draft.id, source.extraction, source.input, source.comparison, source.captured, { actor: human });

  await assert.rejects(
    () => source.reviews.setDecision(finalized.id, source.extraction, source.input, source.comparison, source.captured, {
      subject_type: "claim",
      subject_id: "claim_001",
      decision: "reject",
      actor: human
    }),
    /immutable.*superseding review/
  );

  const replacement = await source.reviews.create(source.extraction, source.input, source.comparison, source.captured, {
    actor: human2,
    supersedes_review_id: finalized.id
  });
  assert.equal(replacement.supersedes_review_id, finalized.id);
  assert.equal(replacement.status, "draft_in_human_review");
  assert.equal(replacement.human_gate.reviewer, "human_reviewer_2");
});

test("RT-05: only Human can revoke a finalized review and revoked review cannot drive accepted-subject output", async () => {
  const source = await createSource();
  const draft = await source.reviews.create(source.extraction, source.input, source.comparison, source.captured, { actor: human });
  await decideAll(source, draft.id);
  const finalized = await source.reviews.finalize(draft.id, source.extraction, source.input, source.comparison, source.captured, { actor: human });

  await assert.rejects(
    () => source.reviews.revoke(finalized.id, source.extraction, source.input, source.comparison, source.captured, { actor: ai }),
    /Human Gate required/
  );
  const revoked = await source.reviews.revoke(finalized.id, source.extraction, source.input, source.comparison, source.captured, {
    actor: human,
    reason: "Human reviewer wants a fresh interpretive pass"
  });
  assert.equal(revoked.status, "revoked_human_review");
  assert.equal(revoked.human_gate.state, "revoked");
  assert.equal(revoked.truth_status, "not_evaluated");
  assert.throws(() => acceptedInterpretiveSubjectIds(revoked), /only from a finalized Human review/);
});

test("RT-05: integrity rejects post-review mutation and substituted RT-04 source", async () => {
  const source = await createSource();
  const draft = await source.reviews.create(source.extraction, source.input, source.comparison, source.captured, { actor: human });
  await decideAll(source, draft.id);
  const finalized = await source.reviews.finalize(draft.id, source.extraction, source.input, source.comparison, source.captured, { actor: human });

  const tampered = structuredClone(finalized);
  tampered.decisions[0].decision = "reject";
  assert.throws(
    () => assertRoundtableInterpretiveReviewIntegrity(tampered, source.extraction, source.input, source.comparison, source.captured),
    /interpretation effect was modified|review content or Human Gate metadata was modified/
  );

  const substitutedExtraction = structuredClone(source.extraction);
  substitutedExtraction.id = "rtx_other";
  assert.throws(
    () => assertRoundtableInterpretiveReviewIntegrity(finalized, substitutedExtraction, source.input, source.comparison, source.captured),
    /does not match its RT-04 interpretive source|interpretive extraction content was modified/
  );
});

test("RT-05: audit stays metadata-only and never duplicates Claim, Assumption, Conflict, evidence, or Human notes", async () => {
  const source = await createSource();
  const draft = await source.reviews.create(source.extraction, source.input, source.comparison, source.captured, { actor: human });
  await source.reviews.setDecision(draft.id, source.extraction, source.input, source.comparison, source.captured, {
    subject_type: "claim",
    subject_id: "claim_001",
    decision: "accept",
    note: "Sensitive human review note that must not be copied into Audit Log",
    actor: human
  });
  let review = await source.reviews.get(draft.id);
  for (const row of review.decisions.filter((entry) => entry.decision === "pending")) {
    review = await source.reviews.setDecision(draft.id, source.extraction, source.input, source.comparison, source.captured, {
      subject_type: row.subject_type,
      subject_id: row.subject_id,
      decision: "hold",
      note: `Private note for ${row.subject_id}`,
      actor: human
    });
  }
  await source.reviews.finalize(draft.id, source.extraction, source.input, source.comparison, source.captured, { actor: human });

  const events = (await source.audit.list({ project_id: source.project.id }))
    .filter((event) => event.action.startsWith("roundtable_interpretive_review_"));
  assert.equal(events.length >= 3, true);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("GPT recommends examining operational risk first"), false);
  assert.equal(serialized.includes("Check operational risk first"), false);
  assert.equal(serialized.includes("Primary rollout safeguard"), false);
  assert.equal(serialized.includes("Sensitive human review note"), false);
  assert.equal(serialized.includes("Private note for"), false);
});
